/**
 * Mode-aware quoting. Single source of truth for the booking widget, /book flow,
 * and admin. Distance-based pricing is stubbed (flat tiers) until a maps provider
 * is wired in — see docs/torontocitylimo-replication-plan.md §5.
 */

import { applyVehicleMultiplier } from "@/lib/tariff";
import { DEFAULT_PRICING_CONFIG, type PricingConfig } from "@/lib/pricing-config";

export type TripType = "one_way" | "hourly" | "airport";

/* ── Client pricing policy ────────────────────────────────────────────────
 * Every rate below is a client decision, not an engineering one. They are
 * grouped here so they can be retuned without touching the fare logic.
 */

/**
 * Markup on tariff-map fares. Applied to Pearson tariff trips ONLY: the
 * vehicles table already holds the client's retail rates (see migration
 * 20260711150000 — hourly $85 sedan / $120 SUV are the advertised numbers),
 * so marking those up again would contradict the published /pricing page.
 */
export const TARIFF_MARKUP_RATE = 0.3;

/** Ontario HST. Mandatory on every ride. */
export const HST_RATE = 0.13;

/**
 * GTAA fee passed through on any trip touching Pearson, as a separate line.
 * Other airports (Billy Bishop, Hamilton, Buffalo/USD) publish their own
 * rates and still need confirmed values — they fall back to this one.
 */
export const YYZ_AIRPORT_FEE = 17.25;

/** Gratuity preselected at checkout. Customer can change or clear it. */
export const DEFAULT_TIP_RATE = 0.15;

/**
 * Driver's share of the PRE-TAX fare when a driver has no explicit rate — the
 * platform charges the remaining 25% commission. Mirrors the drivers.
 * commission_rate default (migration 20260716130000). Note the column stores
 * the DRIVER's share, not the platform's cut: 0.75 pays the chauffeur 75%.
 */
export const DEFAULT_DRIVER_PAYOUT_RATE = 0.75;

/** Money rounding — half-up to the cent, avoiding float drift. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The amount a driver's share is calculated from.
 *
 * bookings.fare_estimate is the pre-tax subtotal — base + markup + airport fee
 * — but the GTAA airport fee is a PASS-THROUGH, not revenue: SophRia collects
 * $17.25 from the passenger and remits it to the airport authority. Including
 * it in the payout base paid the driver 75% of that fee, so the business
 * remitted $17.25 and recovered $4.31 of it. Pearson is ~90% of the business,
 * so this was on nearly every ride.
 *
 * Deliberately takes the STORED airport_fee rather than recomputing from trip
 * type: a booking's payout must follow the fee that was actually charged on it,
 * and older rows carry 0.
 */
export function driverPayoutBase(fareEstimate: number | null | undefined, airportFee: number | null | undefined): number {
  return round2(Math.max(0, Number(fareEstimate ?? 0) - Number(airportFee ?? 0)));
}

export const TRIP_TYPES: { value: TripType; label: string; hint: string }[] = [
  { value: "one_way", label: "One-way", hint: "Point to point" },
  { value: "hourly", label: "By the hour", hint: "Dedicated chauffeur" },
  { value: "airport", label: "Airport", hint: "Pearson / Billy Bishop / Hamilton / Buffalo" },
];

export const HOURLY_MIN_HOURS = 2;

/** Per-kilometre rate added on top of a vehicle's base for point-to-point trips. */
export const PER_KM = 2.75;

/*
 * AIRPORT_MEET_GREET and AIRPORT_FREE_KM used to live here. They are now
 * cfg.airportMeetGreet / cfg.airportFreeKm (see pricing-config.ts), so the
 * owner can retune them without a deploy — the meet & greet especially, which
 * sits at $15 against a $45-$80 market. The constants above are kept because
 * they are read outside the fare engine (the /terms page publishes the hourly
 * minimum, for one); their DEFAULT_PRICING_CONFIG twins are what the engine
 * actually quotes from.
 */

/** Minimal shape we need from a vehicle row to quote. */
export interface QuotableVehicle {
  base_rate: number | string;
  hourly_rate?: number | string | null;
  /** vehicle_type enum — needed to scale Pearson tariffs by class. */
  type?: string | null;
  /** Rated bag capacity — the yardstick for the tariff's "excess baggage". */
  luggage?: number | string | null;
  /** Per-class tariff scale, now a column on vehicles. Falls back to TARIFF_MULTIPLIERS. */
  tariff_multiplier?: number | string | null;
}

export function hourlyRateFor(v: QuotableVehicle): number {
  const hr = v.hourly_rate != null ? Number(v.hourly_rate) : NaN;
  if (Number.isFinite(hr) && hr > 0) return hr;
  // Fallback: derive an hourly rate from the one-way base.
  return Math.round(Number(v.base_rate) * 0.6);
}

export interface QuoteParams {
  durationHours?: number;
  /** Driving distance in km (from Mapbox Directions). Omit for a flat estimate. */
  distanceKm?: number;
  /**
   * Published Pearson (sedan) tariff for this airport trip, resolved by the
   * caller via resolvePearsonTariff() in src/lib/tariff.ts. When set, the
   * airport fare is tariff × vehicle-class multiplier instead of the formula.
   */
  tariff?: number | null;
  /** Booked passenger count — >4 adds the once-per-trip tariff surcharge. */
  passengerCount?: number | null;
  /** Booked bag count. Over the vehicle's rated capacity is "excess baggage". */
  luggageCount?: number | null;
}

/**
 * Returns an estimated fare in CAD for the given trip type + vehicle.
 *
 * `cfg` defaults to the values this engine has always hardcoded, so callers
 * that omit it are unchanged.
 */
export function quote(
  tripType: TripType,
  vehicle: QuotableVehicle | null | undefined,
  params: QuoteParams = {},
  cfg: PricingConfig = DEFAULT_PRICING_CONFIG,
): number {
  if (!vehicle) return 0;
  const base = Number(vehicle.base_rate) || 0;
  const km = Number(params.distanceKm) || 0;

  switch (tripType) {
    case "hourly": {
      const hrs = Math.max(cfg.hourlyMinHours, Number(params.durationHours) || cfg.hourlyMinHours);
      return hourlyRateFor(vehicle) * hrs;
    }
    case "airport": {
      // Pearson trips follow the official GTAA tariff (tax-inclusive),
      // scaled to the vehicle class.
      if (params.tariff != null) {
        // The surcharge is NOT added here — see tariffSurcharge(). It must not
        // be marked up, so it cannot live inside the number priceBreakdown
        // applies the markup to.
        const mult = vehicle.tariff_multiplier != null ? Number(vehicle.tariff_multiplier) : null;
        // Math.round, NOT round2 — applyVehicleMultiplier has always rounded the
        // scaled tariff to whole dollars, and the two must agree to the cent.
        // Keeping cents here made an SUV's 55 × 1.3 come out at 71.50 instead of
        // 72, which the markup and HST amplified into $0.73 a trip.
        const scaled =
          mult != null && Number.isFinite(mult) && mult > 0
            ? Math.round(params.tariff * mult)
            : applyVehicleMultiplier(params.tariff, vehicle.type);
        // As printed on the card — and the card's legend says that figure
        // "includes taxes".
        const published = scaled;
        // Hand back the PRE-TAX equivalent so priceBreakdown's markup and HST
        // apply to a pre-tax base. Without this the engine marked up and then
        // re-taxed a number that already contained HST — tax on tax, on ~90% of
        // the business. See tariff.ts and 20260717170000_tariff_tax_inclusive.
        return cfg.tariffTaxInclusive ? round2(published / (1 + cfg.hstRate)) : published;
      }
      const extraKm = Math.max(0, km - cfg.airportFreeKm);
      return Math.round(base + cfg.airportMeetGreet + extraKm * cfg.retailPerKm);
    }
    case "one_way":
    default:
      // Distance-based when we have coordinates; flat base otherwise.
      return km > 0 ? Math.round(base + km * cfg.retailPerKm) : base;
  }
}

export function tripTypeLabel(t: TripType): string {
  return TRIP_TYPES.find((x) => x.value === t)?.label ?? "One-way";
}

/** Everything needed to price a trip, beyond the vehicle and trip type. */
export interface PricingContext extends QuoteParams {
  pickupText?: string | null;
  dropoffText?: string | null;
  pickupCoords?: { lat: number; lng: number } | null;
  dropoffCoords?: { lat: number; lng: number } | null;
}

/**
 * The airport fee for a trip, or 0 when it isn't an airport trip.
 * Every airport currently bills the Pearson rate: Billy Bishop, Hamilton and
 * Buffalo (USD) each publish their own, and we don't have those numbers yet.
 */
export function airportFeeFor(tripType: TripType, cfg: PricingConfig = DEFAULT_PRICING_CONFIG): number {
  return tripType === "airport" ? cfg.yyzAirportFee : 0;
}

/**
 * The tariff's once-per-trip surcharge, PRE-TAX, or 0 when it doesn't apply.
 *
 *   "A $15.00 surcharge applies when a driver is asked to transport more than
 *    4 passengers and/or excess baggage ... The surcharge can only be charged
 *    once per trip."  — official Feb 2024 tariff card
 *
 * Two things this gets right that the first cut didn't:
 *
 *  * AND/OR. Only the passenger half existed; luggage_count was collected and
 *    stored but never priced, so a party of two with ten bags rode for free on
 *    a charge the tariff allows. "Excess" is measured against the vehicle's own
 *    rated bag capacity — that is what makes a load excessive. The OR means it
 *    is charged once when both apply, never twice.
 *
 *  * It is NOT marked up. This sits outside baseFare on purpose: everything
 *    quote() returns carries the 30% tariff markup, which turned a $15
 *    surcharge into $19.49 on the customer's total — while /book and /pricing
 *    both advertise "$15". That is the published-vs-charged drift this codebase
 *    keeps getting bitten by (the FAQ once promised 13% HST the engine never
 *    applied). A published $15 must cost $15.
 *
 * Returned pre-tax so HST lands on it exactly once: the card's figure is
 * tax-inclusive, so $15 published -> $13.27 pre-tax -> $15.00 charged.
 */
export function tariffSurcharge(
  vehicle: QuotableVehicle | null | undefined,
  params: QuoteParams = {},
  cfg: PricingConfig = DEFAULT_PRICING_CONFIG,
): number {
  if (!vehicle || params.tariff == null) return 0;
  const overPassengers = Number(params.passengerCount) > 4;
  const ratedBags = Number(vehicle.luggage);
  const overBags = Number.isFinite(ratedBags) && ratedBags > 0 && Number(params.luggageCount) > ratedBags;
  if (!overPassengers && !overBags) return 0;
  const published = cfg.extraPassengerSurcharge;
  return cfg.tariffTaxInclusive ? round2(published / (1 + cfg.hstRate)) : published;
}

export interface FareBreakdown {
  /** Vehicle/tariff fare before markup. Excludes the surcharge. */
  baseFare: number;
  /** Tariff markup — 0 on retail-rate (hourly / one-way) trips. */
  markup: number;
  /**
   * Tariff surcharge (>4 passengers / excess baggage), pre-tax. Deliberately
   * NOT inside baseFare, so the markup never touches it.
   */
  surcharge: number;
  /** GTAA pass-through, shown to the customer as its own line. */
  airportFee: number;
  /** Pre-tax total. This is what lands in bookings.fare_estimate. */
  subtotal: number;
  hst: number;
  /** subtotal + hst. Tip is added later, at payment. */
  total: number;
}

/**
 * The authoritative fare breakdown. `quote()` returns only the raw fare; this
 * layers on the client's markup, the airport fee and HST, and is what both the
 * booking UI and the server should use so the customer sees what they're charged.
 *
 * `cfg` defaults to DEFAULT_PRICING_CONFIG — the values this engine has always
 * hardcoded — so every existing caller that omits it quotes exactly what it
 * quoted before the rates became data. Server callers pass the live config from
 * pricing_config; the booking UI passes the same row it read for its preview.
 */
export function priceBreakdown(
  tripType: TripType,
  vehicle: QuotableVehicle | null | undefined,
  ctx: PricingContext = {},
  cfg: PricingConfig = DEFAULT_PRICING_CONFIG,
): FareBreakdown {
  const baseFare = quote(tripType, vehicle, ctx, cfg);
  // Tariff trips are the "basic prices" the markup was specified against;
  // hourly and one-way already price off the client's retail rate sheet.
  const markup = ctx.tariff != null ? round2(baseFare * cfg.tariffMarkupRate) : 0;
  // Added AFTER the markup: a published $15 must reach the customer as $15.
  const surcharge = tariffSurcharge(vehicle, ctx, cfg);
  const airportFee = airportFeeFor(tripType, cfg);
  const subtotal = round2(baseFare + markup + surcharge + airportFee);
  const hst = round2(subtotal * cfg.hstRate);
  return { baseFare, markup, surcharge, airportFee, subtotal, hst, total: round2(subtotal + hst) };
}

/** Suggested gratuity for a fare, in dollars. Tips are pre-tax by convention. */
export function suggestedTip(subtotal: number, rate: number = DEFAULT_TIP_RATE): number {
  return round2(Math.max(0, subtotal) * rate);
}
