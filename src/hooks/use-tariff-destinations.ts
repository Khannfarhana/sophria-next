"use client";

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/hooks/use-supabase";
import { SUPABASE_ENABLED } from "@/lib/data-source";

/**
 * The live out-of-town tariff table, for client-side quoting.
 *
 * Same trust model as usePricingConfig: the table is public information (RLS
 * allows anyone to read it — it is what the customer is quoted from) and this
 * drives the PREVIEW only; createBookingAction re-resolves the tariff
 * server-side via loadTariffDestinations and ignores the client's number.
 *
 * Returns null while loading or unavailable — resolvePearsonTariff then falls
 * back to the built-in February 2024 card, so a quote is never blank.
 */
export function useTariffDestinations(): Record<string, number> | null {
  const supabase = useSupabase();

  const { data } = useQuery({
    queryKey: ["tariff-destinations"],
    enabled: SUPABASE_ENABLED,
    staleTime: 5 * 60_000, // destinations change rarely — admin edits, not traffic
    queryFn: async (): Promise<Record<string, number> | null> => {
      const { data, error } = await supabase.from("tariff_destinations").select("name, tariff");
      if (error) throw error;
      if (!data?.length) return null;
      return Object.fromEntries(data.map((r: { name: string; tariff: number }) => [r.name, Number(r.tariff)]));
    },
  });

  return data ?? null;
}
