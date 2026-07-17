"use server";

import { auth } from "@/auth";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { invalidatePricingConfig } from "@/lib/pricing-config.server";
import { PRICING_CONFIG_COLUMNS } from "@/lib/pricing-config";

/**
 * Publishing the rate card.
 *
 * Every export of a "use server" module is a public POST endpoint, so this file
 * exports exactly one function and gates it on the admin role in code. The RLS
 * policy is the second layer, not the first.
 */

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Editable fields, and the range each must fall in. */
const NUMERIC_LIMITS: Record<string, [min: number, max: number]> = {
  hst_rate: [0, 0.25],
  yyz_airport_fee: [0, 200],
  airport_meet_greet: [0, 500],
  airport_free_km: [0, 200],
  tariff_markup_rate: [0, 2],
  retail_per_km: [0, 50],
  hourly_min_hours: [1, 24],
  tariff_per_km: [0, 50],
  tariff_in_zone_base: [0, 500],
  tariff_min: [0, 500],
  pearson_radius_km: [0, 50],
  extra_passenger_surcharge: [0, 200],
  multi_dropoff_charge: [0, 200],
  stop_wait_per_10min: [0, 200],
  default_driver_payout_rate: [0, 1],
  default_tip_rate: [0, 1],
  stripe_pct: [0, 0.1],
  stripe_fixed: [0, 5],
};

export interface PublishPricingInput {
  /** Only the fields being changed. Everything else is carried over. */
  patch: Record<string, number | boolean>;
  reason: string;
}

/**
 * Publish a new version of the rate card.
 *
 * Inserts rather than updates: the table is the audit log and the rollback
 * path, and a money change has to be attributable. `reason` is required for the
 * same reason updateBookingFareAction requires one — a price change nobody can
 * explain three months later is worse than no history at all.
 *
 * The ranges are re-checked here AND by a CHECK constraint on the table. There
 * is no code review on an admin form: a fat-fingered 13 instead of 0.13 would
 * otherwise reprice every ride in the country. Belt and braces is proportionate
 * when the failure is silent and financial.
 */
export async function publishPricingConfigAction(input: PublishPricingInput) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // `pricing`, not `admin`. Confirming a booking and repricing the business are
  // different jobs; every current admin holds `pricing` (backfilled by
  // 20260717210000), so this changes nothing today. It means the next admin —
  // the dispatcher hired so nobody confirms bookings at 6am — can be created
  // without it and cannot touch the rate card.
  if (!session.user.roles?.includes("pricing")) {
    throw new Error("Unauthorized: changing rates needs the pricing role.");
  }

  const reason = String(input.reason ?? "").trim();
  if (reason.length < 5) throw new Error("Give a reason for this change (at least 5 characters).");
  if (reason.length > 500) throw new Error("Reason is too long.");

  const patch: Record<string, number | boolean> = {};
  for (const [key, raw] of Object.entries(input.patch ?? {})) {
    if (key === "tariff_tax_inclusive") {
      patch[key] = Boolean(raw);
      continue;
    }
    const limits = NUMERIC_LIMITS[key];
    // Unknown keys are dropped, not written: the client picks these names.
    if (!limits) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${key}: not a number.`);
    const [min, max] = limits;
    if (n < min || n > max) throw new Error(`${key}: must be between ${min} and ${max} (got ${n}).`);
    patch[key] = n;
  }
  if (Object.keys(patch).length === 0) throw new Error("Nothing to publish.");

  const admin = svc();

  // Carry the current version forward so a patch of one field doesn't reset the
  // other seventeen to their column defaults.
  const { data: current, error: readErr } = await admin
    .from("pricing_config")
    .select(PRICING_CONFIG_COLUMNS)
    .eq("is_active", true)
    .single();
  if (readErr || !current) throw new Error(`Could not read the active rate card: ${readErr?.message ?? "none active"}`);

  const row = { ...(current as unknown as Record<string, unknown>) };
  delete row.id;
  delete row.created_at;

  const { data: inserted, error: insErr } = await admin
    .from("pricing_config")
    .insert({
      ...row,
      ...patch,
      reason,
      created_by: session.user.id,
      // Inserted stood-down, then activated atomically below. Inserting it
      // active would collide with the one-active unique index.
      is_active: false,
    })
    .select("id")
    .single();
  if (insErr || !inserted) throw new Error(`Could not save the new version: ${insErr?.message}`);

  // One statement flips both rows, so no reader ever sees zero active versions
  // and quotes from the built-in fallback mid-publish.
  const { error: actErr } = await admin.rpc("activate_pricing_config", { _id: inserted.id });
  if (actErr) throw new Error(`Saved but could not activate: ${actErr.message}`);

  invalidatePricingConfig();
  revalidatePath("/admin");
  revalidatePath("/book");
  revalidatePath("/dashboard");
  // /terms PUBLISHES these rates — HST, the airport fee, the hourly minimum,
  // the suggested tip — and it is prerendered. Without this, changing HST in
  // the admin would leave the legal terms asserting a rate the engine no longer
  // charges: the published-policy-drifts-from-code bug, with legal weight.
  // These pages are generated from the same config, so reprint them.
  revalidatePath("/terms");
  revalidatePath("/refund-policy");
  revalidatePath("/pricing");
  return { success: true, id: inserted.id as string };
}
