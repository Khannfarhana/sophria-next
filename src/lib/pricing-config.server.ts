import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ENABLED } from "@/lib/data-source";
import {
  DEFAULT_PRICING_CONFIG,
  PRICING_CONFIG_COLUMNS,
  toPricingConfig,
  type PricingConfig,
} from "@/lib/pricing-config";

/**
 * Server-side read of the live rate card.
 *
 * Cached per request rather than per process: a request must price every leg
 * against ONE version of the config. Reading it twice across an await could
 * otherwise straddle a publish and quote a booking half at the old rates and
 * half at the new — rare, but the kind of thing that is impossible to explain
 * to a customer afterwards. Within a request the answer is frozen; the next
 * request picks up the change immediately, which is what an operator expects
 * after pressing Publish.
 *
 * FALLS BACK, NEVER THROWS. If the config table is unreachable, quoting the
 * values the engine has always shipped is far better than failing the booking —
 * and DEFAULT_PRICING_CONFIG is exactly the seeded row, so the fallback is a
 * no-op rather than a guess. A failure here is logged loudly because it means
 * published rate changes are being silently ignored.
 */

let cache: { at: number; value: PricingConfig } | null = null;
// Short, not zero: a booking flow makes several server calls in quick
// succession and they should agree, but a publish must take effect promptly
// without a deploy or a restart.
const TTL_MS = 30_000;

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function loadPricingConfig(): Promise<PricingConfig> {
  if (!SUPABASE_ENABLED) return DEFAULT_PRICING_CONFIG;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  try {
    const { data, error } = await svc()
      .from("pricing_config")
      .select(PRICING_CONFIG_COLUMNS)
      .eq("is_active", true)
      .single();
    if (error) throw new Error(error.message);
    const value = toPricingConfig(data as unknown as Record<string, unknown>);
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error("[pricing-config] falling back to built-in rates — published changes are NOT being applied:", err);
    return DEFAULT_PRICING_CONFIG;
  }
}

/** Drop the cache so the next quote sees a newly published version at once. */
export function invalidatePricingConfig(): void {
  cache = null;
}

/**
 * The out-of-town tariff table, as data.
 *
 * Returns null when unavailable so the caller can fall back to the hardcoded
 * OUT_OF_TOWN map in tariff.ts rather than quote a trip with no tariff at all
 * (which would silently drop to the distance model and undercharge a
 * long-haul).
 */
export async function loadTariffDestinations(): Promise<Record<string, number> | null> {
  if (!SUPABASE_ENABLED) return null;
  try {
    const { data, error } = await svc().from("tariff_destinations").select("name, tariff");
    if (error) throw new Error(error.message);
    if (!data?.length) return null;
    return Object.fromEntries(data.map((r) => [r.name as string, Number(r.tariff)]));
  } catch (err) {
    console.error("[pricing-config] tariff destinations unavailable, using built-in table:", err);
    return null;
  }
}
