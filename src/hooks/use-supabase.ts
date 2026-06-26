"use client";

import { useSession } from "next-auth/react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

export function useSupabase(): SupabaseClient {
  const { data: session } = useSession();
  const token = (session?.user as any)?.accessToken as string | undefined;

  return useMemo(() => {
    if (!token) {
      return supabase;
    }

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
  }, [token]);
}
