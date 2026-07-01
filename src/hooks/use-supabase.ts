"use client";

import { useSession } from "next-auth/react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

// Global cache for the authenticated Supabase client (client-side only to prevent SSR leaks)
const clientCache: {
  client: SupabaseClient | null;
  token: string | null;
} = {
  client: null,
  token: null,
};

function getAuthenticatedClient(token: string): SupabaseClient {
  if (typeof window === "undefined") {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        }
      }
    );
  }

  if (clientCache.client && clientCache.token === token) {
    return clientCache.client;
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      }
    }
  );

  clientCache.token = token;
  clientCache.client = client;

  return client;
}

export function useSupabase(): SupabaseClient {
  const { data: session } = useSession();
  const token = session?.user?.accessToken;

  return useMemo(() => {
    if (!token) {
      return supabase;
    }

    return getAuthenticatedClient(token);
  }, [token]);
}
