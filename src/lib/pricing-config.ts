/**
 * The rate card, as data.
 *
 * Every number here used to be a hardcoded constant in pricing.ts / tariff.ts,
 * so changing a price meant a developer, a commit and a deploy — for values
 * that demonstrably move (the GTAA pickup fee went $15 -> $17.25; the tariff
 * card this app encodes is dated February 2024 and gets reprinted).
 *
 * Isomorphic on purpose. priceBreakdown() is called synchronously inside seven
 * client components for live quoting AND on the server for the authoritative
 * fare, so the config travels as a plain object rather than a fetch:
 *
 *   server  — loadPricingConfig() (cached), passed into priceBreakdown
 *   client  — usePricingConfig() (React Query, same shape as the vehicles read)
 *
 * SAFETY: a publicly readable rate card cannot become a tampered price.
 * createBookingAction recomputes the fare server-side and ignores whatever the
 * client sends, so at worst a tampered client shows itself a wrong preview and
 * is billed the correct number.
 */

export interface PricingConfig {
  hstRate: number;
  /**
   * True when the Pearson tariffs already include HST, as the official card
   * states verbatim: "All tariffs in Canadian dollars and includes taxes."
   * The engine then converts a tariff to its pre-tax equivalent before applying
   * markup and HST, so tax is charged once rather than twice.
   *
   * A claim about the SOURCE of tariff_destinations, not a pricing lever: if
   * those values are ever replaced with a pre-tax sheet, turn this off.
   */
  tariffTaxInclusive: boolean;
  yyzAirportFee: number;
  airportMeetGreet: number;
  airportFreeKm: number;
  tariffMarkupRate: number;
  retailPerKm: number;
  /** Km included in the base fare on one-way trips before per-km billing starts. */
  onewayFreeKm: number;
  hourlyMinHours: number;
  tariffPerKm: number;
  tariffInZoneBase: number;
  tariffMin: number;
  pearsonRadiusKm: number;
  extraPassengerSurcharge: number;
  multiDropoffCharge: number;
  stopWaitPer10Min: number;
  defaultDriverPayoutRate: number;
  defaultTipRate: number;
  stripePct: number;
  stripeFixed: number;
}

/**
 * The values the engine shipped with, and the fallback when the config table is
 * unreachable (or in mock mode).
 *
 * These are NOT arbitrary defaults — they are exactly what pricing.ts and
 * tariff.ts hardcode today, which is what makes the config rollout a no-op:
 * every existing call site that omits a config keeps quoting the same fare it
 * quoted yesterday. Falling back to a wrong-but-plausible number would be far
 * worse than failing, so these must stay in step with the seed in
 * 20260717150000_pricing_config.sql.
 */
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  hstRate: 0.13,
  // The official GTAA card states the tariffs already include tax, so the
  // built-in fallback prices the same way the live config does.
  tariffTaxInclusive: true,
  yyzAirportFee: 17.25,
  airportMeetGreet: 15,
  airportFreeKm: 20,
  tariffMarkupRate: 0.3,
  retailPerKm: 2.75,
  onewayFreeKm: 0,
  hourlyMinHours: 2,
  tariffPerKm: 2.01,
  tariffInZoneBase: 28,
  tariffMin: 40,
  pearsonRadiusKm: 3.5,
  extraPassengerSurcharge: 15,
  multiDropoffCharge: 15,
  stopWaitPer10Min: 10,
  defaultDriverPayoutRate: 0.75,
  defaultTipRate: 0.15,
  stripePct: 0.029,
  stripeFixed: 0.3,
};

/** DB row (snake_case, numeric columns arrive as strings) -> PricingConfig. */
export function toPricingConfig(row: Record<string, unknown> | null | undefined): PricingConfig {
  if (!row) return DEFAULT_PRICING_CONFIG;
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const d = DEFAULT_PRICING_CONFIG;
  return {
    hstRate: num(row.hst_rate, d.hstRate),
    tariffTaxInclusive:
      row.tariff_tax_inclusive == null ? d.tariffTaxInclusive : Boolean(row.tariff_tax_inclusive),
    yyzAirportFee: num(row.yyz_airport_fee, d.yyzAirportFee),
    airportMeetGreet: num(row.airport_meet_greet, d.airportMeetGreet),
    airportFreeKm: num(row.airport_free_km, d.airportFreeKm),
    tariffMarkupRate: num(row.tariff_markup_rate, d.tariffMarkupRate),
    retailPerKm: num(row.retail_per_km, d.retailPerKm),
    onewayFreeKm: num(row.oneway_free_km, d.onewayFreeKm),
    hourlyMinHours: num(row.hourly_min_hours, d.hourlyMinHours),
    tariffPerKm: num(row.tariff_per_km, d.tariffPerKm),
    tariffInZoneBase: num(row.tariff_in_zone_base, d.tariffInZoneBase),
    tariffMin: num(row.tariff_min, d.tariffMin),
    pearsonRadiusKm: num(row.pearson_radius_km, d.pearsonRadiusKm),
    extraPassengerSurcharge: num(row.extra_passenger_surcharge, d.extraPassengerSurcharge),
    multiDropoffCharge: num(row.multi_dropoff_charge, d.multiDropoffCharge),
    stopWaitPer10Min: num(row.stop_wait_per_10min, d.stopWaitPer10Min),
    defaultDriverPayoutRate: num(row.default_driver_payout_rate, d.defaultDriverPayoutRate),
    defaultTipRate: num(row.default_tip_rate, d.defaultTipRate),
    stripePct: num(row.stripe_pct, d.stripePct),
    stripeFixed: num(row.stripe_fixed, d.stripeFixed),
  };
}

/** Columns to select. Kept here so the server and client reads cannot diverge. */
export const PRICING_CONFIG_COLUMNS =
  "id, hst_rate, tariff_tax_inclusive, yyz_airport_fee, airport_meet_greet, airport_free_km, tariff_markup_rate, " +
  "retail_per_km, oneway_free_km, hourly_min_hours, tariff_per_km, tariff_in_zone_base, tariff_min, " +
  "pearson_radius_km, extra_passenger_surcharge, multi_dropoff_charge, stop_wait_per_10min, " +
  "default_driver_payout_rate, default_tip_rate, stripe_pct, stripe_fixed, created_at, reason";

/* ── What a ride actually earns ──────────────────────────────────────────── */

export interface RideMargin {
  /** What the customer pays, tax and fees included. */
  total: number;
  /** Collected for the CRA. Not revenue. */
  hst: number;
  /** Collected for the GTAA. Not revenue. */
  airportFee: number;
  /** The base the driver's share is taken from (pre-tax, less the airport fee). */
  payoutBase: number;
  driverPayout: number;
  /** payoutBase - driverPayout. What the platform bills for. */
  gross: number;
  /** Stripe's cut of the whole charge, including the pass-throughs. */
  processing: number;
  /** gross - processing. The real number. */
  net: number;
}

/**
 * True contribution of a ride.
 *
 * Stripe's fee was modelled NOWHERE — not in the fare engine, not in the admin
 * — so every margin figure in the business was overstated. On a $100.29 Pearson
 * fare the platform's gross looks like $17.87 (25% of the payout base) but
 * Stripe takes $3.21 of it: 18% of the margin, leaving $14.66. Worse, Stripe
 * charges on the FULL amount, including the HST and the GTAA fee that are only
 * passing through — so the pass-throughs cost real money to collect.
 *
 * Pure and isomorphic: the admin can show this next to any fare.
 */
export function rideMargin(opts: {
  total: number;
  hst: number;
  airportFee: number;
  driverRate: number;
  tip?: number;
  config?: PricingConfig;
}): RideMargin {
  const cfg = opts.config ?? DEFAULT_PRICING_CONFIG;
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const tip = Math.max(0, opts.tip ?? 0);

  const preTax = r2(opts.total - opts.hst - tip);
  const payoutBase = r2(Math.max(0, preTax - opts.airportFee));
  const driverPayout = r2(payoutBase * opts.driverRate);
  const gross = r2(payoutBase - driverPayout);
  // Stripe bills the whole transaction — tip and pass-throughs included.
  const processing = r2(opts.total * cfg.stripePct + cfg.stripeFixed);
  return {
    total: r2(opts.total),
    hst: r2(opts.hst),
    airportFee: r2(opts.airportFee),
    payoutBase,
    driverPayout,
    gross,
    processing,
    net: r2(gross - processing),
  };
}
