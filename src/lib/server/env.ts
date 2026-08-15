import "server-only";

import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);
const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().trim().url().optional(),
);
const optionalUuid = z.preprocess(
  emptyToUndefined,
  z.string().uuid().optional(),
);
const optionalPort = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1).max(65535).optional(),
);
const optionalBoolean = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  return value;
}, z.boolean().optional());

export const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  TOTONOU_DEFAULT_USER_ID: optionalUuid,
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_TRIAGE_MODEL: optionalString.default(
    "claude-haiku-4-5-20251001",
  ),
  ANTHROPIC_GENERATION_MODEL: optionalString.default("claude-sonnet-4-6"),
  GOOGLE_ACCESS_TOKEN: optionalString,
  GOOGLE_REFRESH_TOKEN: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_CALENDAR_ID: optionalString.default("primary"),
  XSERVER_IMAP_HOST: optionalString,
  XSERVER_IMAP_PORT: optionalPort.default(993),
  XSERVER_IMAP_SECURE: optionalBoolean.default(true),
  XSERVER_SMTP_HOST: optionalString,
  XSERVER_SMTP_PORT: optionalPort.default(465),
  XSERVER_SMTP_SECURE: optionalBoolean.default(true),
  XSERVER_MAIL_USER: optionalString,
  XSERVER_MAIL_PASSWORD: optionalString,
  XSERVER_MAIL_FROM: optionalString,
  MAIL_ALLOWED_DOMAINS: optionalString,
  MAIL_BLOCKED_DOMAINS: optionalString,
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const paths = parsed.error.issues
    .map((issue) => issue.path.join("."))
    .filter(Boolean)
    .join(", ");
  throw new Error(`Invalid server environment variables: ${paths}`);
}

export const serverEnv = parsed.data;

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const integrationStatus = {
  anthropic: Boolean(serverEnv.ANTHROPIC_API_KEY),
  supabase: Boolean(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL &&
      serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  supabaseAdmin: Boolean(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL &&
      serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  ),
  google: Boolean(
    serverEnv.GOOGLE_ACCESS_TOKEN ||
      (serverEnv.GOOGLE_REFRESH_TOKEN &&
        serverEnv.GOOGLE_CLIENT_ID &&
        serverEnv.GOOGLE_CLIENT_SECRET),
  ),
  xserver: Boolean(
    serverEnv.XSERVER_IMAP_HOST &&
      serverEnv.XSERVER_SMTP_HOST &&
      serverEnv.XSERVER_MAIL_USER &&
      serverEnv.XSERVER_MAIL_PASSWORD,
  ),
} as const;

export function parseDomainList(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
