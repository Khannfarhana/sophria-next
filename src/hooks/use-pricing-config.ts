"use client";

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/use-supabase";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import {
  DEFAULT_PRICING_CONFIG,
  PRICING_CONFIG_COLUMNS,
  toPricingConfig,
  type PricingConfig,
} from "@/lib/pricing-config";

/**
 * The live rate card, for client-side quoting.
 *
 * Same shape as the vehicles read — the rate card is public information (it is
 * what the customer is quoted from) and the RLS policy allows anyone to read
 * the ACTIVE version only.
 *
 * This drives the PREVIEW, never the charge. createBookingAction recomputes the
 * fare server-side from its own read of this table and ignores any client
 * amount, so a tampered config here shows the tamperer a wrong number and bills
 * them the right one.
 *
 * Never returns undefined: quoting falls back to the values the engine has
 * always shipped rather than rendering a blank or a zero fare.
 */
export function usePricingConfig(): PricingConfig {
  const supabase = useSupabase();

  const { data } = useQuery({
    queryKey: ["pricing-config"],
    enabled: SUPABASE_ENABLED,
    // The card changes rarely, but a publish should reach an open booking tab
    // without a reload.
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PricingConfig> => {
      const { data, error } = await supabase
        .from("pricing_config")
        .select(PRICING_CONFIG_COLUMNS)
        .eq("is_active", true)
        .single();
      if (error) throw error;
      return toPricingConfig(data as unknown as Record<string, unknown>);
    },
  });

  return data ?? DEFAULT_PRICING_CONFIG;
}
