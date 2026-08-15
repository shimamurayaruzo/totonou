import "server-only";

import { z } from "zod";

import { serverEnv } from "@/lib/server/env";
import { ExternalServiceError } from "@/lib/server/http";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().default(3600),
  token_type: z.string().optional(),
});

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getGoogleAccessToken(
  providerAccessToken?: string,
): Promise<string | undefined> {
  if (providerAccessToken) {
    return providerAccessToken;
  }
  if (serverEnv.GOOGLE_ACCESS_TOKEN) {
    return serverEnv.GOOGLE_ACCESS_TOKEN;
  }
  if (
    !serverEnv.GOOGLE_REFRESH_TOKEN ||
    !serverEnv.GOOGLE_CLIENT_ID ||
    !serverEnv.GOOGLE_CLIENT_SECRET
  ) {
    return undefined;
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: serverEnv.GOOGLE_CLIENT_ID,
      client_secret: serverEnv.GOOGLE_CLIENT_SECRET,
      refresh_token: serverEnv.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new ExternalServiceError("google_oauth");
  }
  const parsed = tokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ExternalServiceError("google_oauth");
  }
  cachedToken = {
    value: parsed.data.access_token,
    expiresAt: Date.now() + parsed.data.expires_in * 1000,
  };
  return cachedToken.value;
}
