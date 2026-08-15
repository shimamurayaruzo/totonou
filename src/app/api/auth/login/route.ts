import { createSupabaseServerClient } from "@/lib/server/supabase";

function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const client = await createSupabaseServerClient();
  if (!client) {
    return Response.redirect(new URL(`/?demo=1`, url.origin));
  }
  const redirectTo = new URL("/api/auth/callback", url.origin);
  redirectTo.searchParams.set("next", next);
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo.toString(),
      scopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/calendar.events",
      ].join(" "),
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });
  if (error || !data.url) {
    return Response.redirect(new URL("/login?error=oauth_start", url.origin));
  }
  return Response.redirect(data.url);
}
