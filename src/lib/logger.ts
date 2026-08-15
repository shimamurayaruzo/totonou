import "server-only";

import path from "node:path";

import { createLogger, type VibeLogger } from "vibelogger";

import { serverEnv } from "@/lib/server/env";
import { getSupabaseAdminClient } from "@/lib/server/supabase";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export type LogOperation =
  | "fetch_mail_batch_start"
  | "fetch_mail_batch_complete"
  | "triage_exclude_rule"
  | "triage_classify"
  | "task_create"
  | "task_start"
  | "task_complete"
  | "reply_draft_generate"
  | "reply_send"
  | "mark_as_read"
  | "review_generate"
  | "review_export"
  | "voice_coach_speak"
  | "calendar_events_list"
  | "calendar_candidate_extract"
  | "calendar_conflict_check"
  | "calendar_event_create"
  | "style_profile_learn"
  | "briefing_generate"
  | "auth_callback_complete"
  | "activity_list"
  | "api_error"
  | (string & {});

export type LogMetadata = {
  context?: Record<string, unknown>;
  humanNote?: string;
  aiTodo?: string;
  correlationId?: string;
  userId?: string;
};

const hiddenKeys = new Set([
  "body",
  "body_text",
  "body_html",
  "content",
  "html",
  "text",
  "name",
  "full_name",
  "email",
  "email_address",
  "address",
  "from",
  "to",
  "sender",
  "recipient",
  "subject",
  "title",
  "description",
  "location",
  "token",
  "access_token",
  "refresh_token",
  "api_key",
  "apikey",
  "secret",
  "client_secret",
  "password",
  "passphrase",
  "authorization",
  "cookie",
  "credential",
]);
const secretKeyPattern =
  /(^|_)(token|secret|password|passphrase|authorization|cookie|credential|api_?key)($|_)/i;
const personalKeyPattern =
  /(^|_)(body|content|html|text|name|email|address|from|to|sender|recipient|subject|title|description|location)($|_)/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const bearerPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const processStamp = new Date().toISOString().replace(/[:.]/g, "-");
const fileLoggers = new Map<string, VibeLogger>();

function shouldHideKey(key: string): boolean {
  const normalized = key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  return (
    hiddenKeys.has(normalized) ||
    secretKeyPattern.test(normalized) ||
    personalKeyPattern.test(normalized)
  );
}

function sanitizeString(value: string): string {
  return value
    .replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(bearerPattern, "Bearer [REDACTED]")
    .replace(jwtPattern, "[REDACTED_TOKEN]");
}

function sanitizeValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (depth > 8) {
    return "[MAX_DEPTH]";
  }
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return { name: value.name };
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen, depth + 1));
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[CIRCULAR]";
    }
    seen.add(value);
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      sanitized[key] = shouldHideKey(key)
        ? "[REDACTED]"
        : sanitizeValue(item, seen, depth + 1);
    }
    return sanitized;
  }
  return String(value);
}

export function sanitizeLogData(value: unknown): unknown {
  return sanitizeValue(value, new WeakSet<object>(), 0);
}

function getFileLogger(correlationId: string): VibeLogger {
  const existing = fileLoggers.get(correlationId);
  if (existing) {
    return existing;
  }
  const logger = createLogger({
    correlationId,
    logFile: path.join(
      process.cwd(),
      "logs",
      "totonou",
      `vibe_${processStamp}.log`,
    ),
    autoSave: true,
    keepLogsInMemory: false,
    createDirs: true,
  });
  fileLoggers.set(correlationId, logger);
  if (fileLoggers.size > 100) {
    const oldestKey = fileLoggers.keys().next().value;
    if (oldestKey) {
      fileLoggers.delete(oldestKey);
    }
  }
  return logger;
}

async function persistDevelopment(
  level: LogLevel,
  operation: string,
  message: string,
  metadata: LogMetadata,
  correlationId: string,
): Promise<void> {
  const logger = getFileLogger(correlationId);
  const options = {
    context: metadata.context,
    humanNote: metadata.humanNote,
    aiTodo: metadata.aiTodo,
  };
  if (level === "INFO") {
    await logger.info(operation, message, options);
    return;
  }
  if (level === "WARN") {
    await logger.warning(operation, message, options);
    return;
  }
  await logger.error(operation, message, options);
}

async function persistProduction(
  level: LogLevel,
  operation: string,
  message: string,
  metadata: LogMetadata,
  correlationId: string,
): Promise<void> {
  const userId = metadata.userId ?? serverEnv.TOTONOU_DEFAULT_USER_ID;
  const client = getSupabaseAdminClient();
  if (!client || !userId) {
    return;
  }
  await client.from("activity_logs").insert({
    user_id: userId,
    ts: new Date().toISOString(),
    level,
    operation,
    message,
    correlation_id: correlationId,
    context: metadata.context ?? {},
    human_note: metadata.humanNote ?? null,
    ai_todo: metadata.aiTodo ?? null,
  });
}

async function write(
  level: LogLevel,
  operation: LogOperation,
  message: string,
  metadata: LogMetadata = {},
): Promise<void> {
  try {
    const correlationId = metadata.correlationId ?? `log_${crypto.randomUUID()}`;
    const sanitizedMetadata = sanitizeLogData(metadata) as LogMetadata;
    const sanitizedMessage = sanitizeString(message);
    const consoleEntry = {
      timestamp: new Date().toISOString(),
      level,
      operation,
      message: sanitizedMessage,
      correlation_id: correlationId,
      context: sanitizedMetadata.context ?? {},
      human_note: sanitizedMetadata.humanNote,
      ai_todo: sanitizedMetadata.aiTodo,
    };

    try {
      const serialized = JSON.stringify(consoleEntry);
      if (level === "ERROR") {
        console.error(serialized);
      } else if (level === "WARN") {
        console.warn(serialized);
      } else {
        console.log(serialized);
      }
    } catch {
      return;
    }

    try {
      if (serverEnv.NODE_ENV === "production") {
        await persistProduction(
          level,
          operation,
          sanitizedMessage,
          sanitizedMetadata,
          correlationId,
        );
      } else {
        await persistDevelopment(
          level,
          operation,
          sanitizedMessage,
          sanitizedMetadata,
          correlationId,
        );
      }
    } catch {
      return;
    }
  } catch {
    return;
  }
}

export const log = {
  info: (
    operation: LogOperation,
    message: string,
    metadata?: LogMetadata,
  ) => write("INFO", operation, message, metadata),
  warn: (
    operation: LogOperation,
    message: string,
    metadata?: LogMetadata,
  ) => write("WARN", operation, message, metadata),
  error: (
    operation: LogOperation,
    message: string,
    metadata?: LogMetadata,
  ) => write("ERROR", operation, message, metadata),
};
