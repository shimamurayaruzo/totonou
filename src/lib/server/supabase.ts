import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { integrationStatus, serverEnv } from "@/lib/server/env";

let adminClient: SupabaseClient | null | undefined;

export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!integrationStatus.supabase) {
    return null;
  }

  const cookieStore = await cookies();
  return createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL as string,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: {
        flowType: "pkce",
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            return;
          }
        },
      },
    },
  );
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (adminClient !== undefined) {
    return adminClient;
  }
  if (!integrationStatus.supabaseAdmin) {
    adminClient = null;
    return adminClient;
  }

  adminClient = createClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL as string,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY as string,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
  return adminClient;
}

export type AuthContext = {
  userId?: string;
  providerAccessToken?: string;
  authenticated: boolean;
};

export async function getAuthContext(): Promise<AuthContext> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      userId: serverEnv.TOTONOU_DEFAULT_USER_ID,
      providerAccessToken: undefined,
      authenticated: false,
    };
  }

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return {
      userId: serverEnv.TOTONOU_DEFAULT_USER_ID,
      providerAccessToken: undefined,
      authenticated: false,
    };
  }

  const { data: sessionData } = await client.auth.getSession();
  return {
    userId: data.user.id,
    providerAccessToken: sessionData.session?.provider_token ?? undefined,
    authenticated: true,
  };
}
