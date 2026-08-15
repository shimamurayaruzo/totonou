import { log } from "@/lib/logger";
import { ApiError, errorResponse } from "@/lib/server/http";
import { createSupabaseServerClient } from "@/lib/server/supabase";

function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: Request): Promise<Response> {
  const correlationId = `auth_${crypto.randomUUID()}`;
  const url = new URL(request.url);
  try {
    const code = url.searchParams.get("code");
    if (!code) {
      throw new ApiError(400, "AUTH_CODE_REQUIRED", "OAuth code is missing");
    }
    const client = await createSupabaseServerClient();
    if (!client) {
      return Response.redirect(new URL("/?demo=1", url.origin));
    }
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      throw new ApiError(401, "AUTH_EXCHANGE_FAILED", "Google login could not be completed");
    }
    await log.info("auth_callback_complete", "Google login completed", {
      correlationId,
      userId: data.user.id,
      context: { auth: { provider: "google", authenticated: true } },
    });
    return Response.redirect(new URL(safeNext(url.searchParams.get("next")), url.origin));
  } catch (error) {
    const response = await errorResponse(error, { operation: "auth_callback_complete", correlationId });
    if (response.status < 500) {
      return Response.redirect(new URL("/login?error=oauth_callback", url.origin));
    }
    return response;
  }
}
