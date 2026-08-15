import { convert } from "html-to-text";
import { z } from "zod";

import {
  TASK_PRIORITIES,
  TASK_TYPES,
  TRIAGE_CATEGORIES,
  TRIAGE_REASON_CODES,
  type GmailCategory,
  type JsonObject,
  type Message,
} from "../types";

const actionableCategories = new Set(["needs_reply", "needs_action"]);

export const triageDecisionSchema = z
  .object({
    messageId: z.string().trim().min(1).max(512),
    category: z.enum(TRIAGE_CATEGORIES),
    priority: z.enum(TASK_PRIORITIES).nullable(),
    taskType: z.enum(TASK_TYPES).nullable(),
    summary: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(1_000),
    reasonCode: z.enum(TRIAGE_REASON_CODES),
    confidence: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((value, context) => {
    const actionable = actionableCategories.has(value.category);
    if (actionable && value.priority === null) {
      context.addIssue({
        code: "custom",
        path: ["priority"],
        message: "actionable messages require a priority",
      });
    }
    if (actionable && value.taskType === null) {
      context.addIssue({
        code: "custom",
        path: ["taskType"],
        message: "actionable messages require a task type",
      });
    }
    if (!actionable && value.priority !== null) {
      context.addIssue({
        code: "custom",
        path: ["priority"],
        message: "non-actionable messages must not have a priority",
      });
    }
    if (!actionable && value.taskType !== null) {
      context.addIssue({
        code: "custom",
        path: ["taskType"],
        message: "non-actionable messages must not have a task type",
      });
    }
  });

export const triageBatchSchema = z.array(triageDecisionSchema).max(100);
export const triageOutputSchema = triageDecisionSchema;
export const triageResponseSchema = triageBatchSchema;

export type TriageDecision = z.infer<typeof triageDecisionSchema>;

export function parseTriageDecision(input: unknown): TriageDecision {
  return triageDecisionSchema.parse(input);
}

export function parseTriageBatch(input: unknown): TriageDecision[] {
  return triageBatchSchema.parse(input);
}

export type TriageExclusionRule =
  | "duplicate_message_id"
  | "maximum_100"
  | "promotions_social"
  | "automated_sender"
  | "blocked_domain";

export interface ExcludedMessage {
  readonly messageId: string;
  readonly rule: TriageExclusionRule;
}

export interface TriageAuditEvent {
  readonly operation: "triage_exclude_rule";
  readonly message: "トリアージ除外ルールを適用";
  readonly context: {
    readonly rule: TriageExclusionRule;
    readonly excluded_count: number;
  };
}

export interface TriagePreprocessOptions {
  readonly domainAllowlist?: readonly string[];
  readonly domainBlocklist?: readonly string[];
  readonly maxMessages?: number;
}

export interface TriagePreprocessResult {
  readonly eligible: readonly Message[];
  readonly excluded: readonly ExcludedMessage[];
  readonly auditEvents: readonly TriageAuditEvent[];
  readonly receivedCount: number;
  readonly uniqueCount: number;
  readonly consideredCount: number;
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^@/, "")
    .replace(/^\.+|\.+$/g, "");
}

export function extractSenderDomain(address: string): string | null {
  const normalized = address.trim().toLocaleLowerCase("en-US");
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) {
    return null;
  }
  const domain = normalizeDomain(normalized.slice(at + 1).replace(/[>\s].*$/, ""));
  return domain && domain.includes(".") ? domain : null;
}

function senderLocalPart(address: string): string {
  const normalized = address.trim().toLocaleLowerCase("en-US");
  const at = normalized.lastIndexOf("@");
  return at > 0 ? normalized.slice(0, at).replace(/^.*</, "") : normalized;
}

export function isAutomatedSender(address: string): boolean {
  const localPart = senderLocalPart(address);
  return /^(?:no[._-]?reply|noreply|news|info)(?:[+._-]|$)/i.test(localPart);
}

function matchesDomain(domain: string | null, rules: readonly string[]): boolean {
  if (!domain) {
    return false;
  }
  return rules.some(
    (rule) => domain === rule || domain.endsWith(`.${rule}`),
  );
}

function exclusionRule(
  message: Message,
  allowlist: readonly string[],
  blocklist: readonly string[],
): TriageExclusionRule | null {
  const domain = extractSenderDomain(message.from.address);
  if (matchesDomain(domain, blocklist)) {
    return "blocked_domain";
  }
  if (message.category === "forums") {
    return null;
  }
  if (message.category === "promotions" || message.category === "social") {
    return "promotions_social";
  }
  if (matchesDomain(domain, allowlist)) {
    return null;
  }
  if (isAutomatedSender(message.from.address)) {
    return "automated_sender";
  }
  return null;
}

function categoryRank(category: GmailCategory): number {
  return category === "forums" ? 0 : 1;
}

function validTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function deduplicateMessages(
  messages: readonly Message[],
): {
  readonly unique: readonly Message[];
  readonly duplicates: readonly ExcludedMessage[];
} {
  const selected = new Map<
    string,
    { readonly message: Message; readonly firstIndex: number }
  >();
  const duplicates: ExcludedMessage[] = [];
  messages.forEach((message, index) => {
    const existing = selected.get(message.messageId);
    if (!existing) {
      selected.set(message.messageId, { message, firstIndex: index });
      return;
    }
    duplicates.push({
      messageId: message.messageId,
      rule: "duplicate_message_id",
    });
    if (
      message.category === "forums" &&
      existing.message.category !== "forums"
    ) {
      selected.set(message.messageId, {
        message,
        firstIndex: existing.firstIndex,
      });
    }
  });
  const unique = [...selected.values()]
    .sort((left, right) => {
      const categoryDifference =
        categoryRank(left.message.category) - categoryRank(right.message.category);
      if (categoryDifference !== 0) {
        return categoryDifference;
      }
      const timeDifference =
        validTimestamp(right.message.receivedAt) -
        validTimestamp(left.message.receivedAt);
      return timeDifference || left.firstIndex - right.firstIndex;
    })
    .map((entry) => entry.message);
  return { unique, duplicates };
}

function messageLimit(requested: number | undefined): number {
  if (requested === undefined) {
    return 100;
  }
  if (!Number.isFinite(requested)) {
    return 100;
  }
  return Math.max(0, Math.min(100, Math.trunc(requested)));
}

function auditEvents(excluded: readonly ExcludedMessage[]): TriageAuditEvent[] {
  const counts = new Map<TriageExclusionRule, number>();
  for (const item of excluded) {
    counts.set(item.rule, (counts.get(item.rule) ?? 0) + 1);
  }
  return [...counts.entries()].map(([rule, excluded_count]) => ({
    operation: "triage_exclude_rule",
    message: "トリアージ除外ルールを適用",
    context: { rule, excluded_count },
  }));
}

export function preprocessMessagesForTriage(
  messages: readonly Message[],
  options: TriagePreprocessOptions = {},
): TriagePreprocessResult {
  const allowlist = (options.domainAllowlist ?? [])
    .map(normalizeDomain)
    .filter(Boolean);
  const blocklist = (options.domainBlocklist ?? [])
    .map(normalizeDomain)
    .filter(Boolean);
  const deduplicated = deduplicateMessages(messages);
  const limit = messageLimit(options.maxMessages);
  const considered = deduplicated.unique.slice(0, limit);
  const excluded: ExcludedMessage[] = [...deduplicated.duplicates];
  for (const message of deduplicated.unique.slice(limit)) {
    excluded.push({ messageId: message.messageId, rule: "maximum_100" });
  }
  const eligible: Message[] = [];
  for (const message of considered) {
    const rule = exclusionRule(message, allowlist, blocklist);
    if (rule) {
      excluded.push({ messageId: message.messageId, rule });
    } else {
      eligible.push(message);
    }
  }
  return {
    eligible,
    excluded,
    auditEvents: auditEvents(excluded),
    receivedCount: messages.length,
    uniqueCount: deduplicated.unique.length,
    consideredCount: considered.length,
  };
}

function safeHref(path: string): string {
  const trimmed = path.trim();
  if (
    /^(?:https?:\/\/|mailto:)/i.test(trimmed) ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#")
  ) {
    return trimmed;
  }
  return "";
}

function normalizedText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToTriageText(html: string, maxLength = 20_000): string {
  const boundedMax = Number.isFinite(maxLength)
    ? Math.max(0, Math.min(100_000, Math.trunc(maxLength)))
    : 20_000;
  if (boundedMax === 0 || !html.trim()) {
    return "";
  }
  const withoutCommentsAndExecutableContent = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const text = convert(withoutCommentsAndExecutableContent, {
    wordwrap: false,
    preserveNewlines: true,
    selectors: [
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "template", format: "skip" },
      { selector: "noscript", format: "skip" },
      { selector: "img", format: "skip" },
      {
        selector: "a",
        options: {
          hideLinkHrefIfSameAsText: true,
          noAnchorUrl: false,
          pathRewrite: safeHref,
        },
      },
    ],
  });
  const normalized = normalizedText(text);
  return normalized.length <= boundedMax
    ? normalized
    : normalized.slice(0, boundedMax).trimEnd();
}

export function prepareMessageTextForTriage(
  message: Pick<Message, "bodyHtml" | "bodyText">,
  maxLength = 20_000,
): string {
  if (message.bodyHtml?.trim()) {
    return htmlToTriageText(message.bodyHtml, maxLength);
  }
  const normalized = normalizedText(message.bodyText);
  const boundedMax = Number.isFinite(maxLength)
    ? Math.max(0, Math.min(100_000, Math.trunc(maxLength)))
    : 20_000;
  return normalized.slice(0, boundedMax).trimEnd();
}

export interface SafeTriageClassificationLog {
  readonly operation: "triage_classify";
  readonly message: "メール分類が完了";
  readonly context: JsonObject;
}

export function buildTriageClassificationLog(
  decision: TriageDecision,
): SafeTriageClassificationLog {
  return {
    operation: "triage_classify",
    message: "メール分類が完了",
    context: {
      message_id: decision.messageId,
      category: decision.category,
      priority: decision.priority,
      task_type: decision.taskType,
      reason_code: decision.reasonCode,
      confidence: decision.confidence,
    },
  };
}

const sensitiveLogKeys = new Set([
  "address",
  "body",
  "body_html",
  "body_text",
  "email",
  "from",
  "name",
  "recipient",
  "subject",
  "text",
  "token",
]);

function isSafeLogValue(value: unknown): boolean {
  if (typeof value === "string") {
    return !/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value);
  }
  if (Array.isArray(value)) {
    return value.every(isSafeLogValue);
  }
  if (value && typeof value === "object") {
    return Object.entries(value).every(
      ([key, child]) =>
        !sensitiveLogKeys.has(key.toLocaleLowerCase("en-US")) &&
        isSafeLogValue(child),
    );
  }
  return true;
}

export function isPiiSafeTriageLogContext(context: JsonObject): boolean {
  return isSafeLogValue(context);
}

export const preprocessTriageMessages = preprocessMessagesForTriage;
export const preprocessHtmlForTriage = htmlToTriageText;
