/**
 * Mode-aware quoting. Single source of truth for the booking widget, /book flow,
 * and admin. Distance-based pricing is stubbed (flat tiers) until a maps provider
 * is wired in — see docs/torontocitylimo-replication-plan.md §5.
 */

import { applyVehicleMultiplier, EXTRA_PASSENGER_SURCHARGE } from "@/lib/tariff";

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

export const TRIP_TYPES: { value: TripType; label: string; hint: string }[] = [
  { value: "one_way", label: "One-way", hint: "Point to point" },
  { value: "hourly", label: "By the hour", hint: "Dedicated chauffeur" },
  { value: "airport", label: "Airport", hint: "Pearson / Billy Bishop / Hamilton / Buffalo" },
];

export const HOURLY_MIN_HOURS = 2;
/**
 * Meet & greet + wait surcharge folded into the fare on non-Pearson airport
 * trips. NOT the GTAA airport fee — this is what makes the advertised
 * "airport transfers from $110" work (sedan base 95 + 15). See YYZ_AIRPORT_FEE
 * for the fee the airport actually levies, which is a separate line item.
 */
const AIRPORT_MEET_GREET = 15;

/** Per-kilometre rate added on top of a vehicle's base for point-to-point trips. */
export const PER_KM = 2.75;
/** Airport trips include this many km before per-km charges kick in. */
const AIRPORT_FREE_KM = 20;

/** Minimal shape we need from a vehicle row to quote. */
export interface QuotableVehicle {
  base_rate: number | string;
  hourly_rate?: number | string | null;
  /** vehicle_type enum — needed to scale Pearson tariffs by class. */
  type?: string | null;
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
}

/** Returns an estimated fare in CAD for the given trip type + vehicle. */
export function quote(
  tripType: TripType,
  vehicle: QuotableVehicle | null | undefined,
  params: QuoteParams = {},
): number {
  if (!vehicle) return 0;
  const base = Number(vehicle.base_rate) || 0;
  const km = Number(params.distanceKm) || 0;

  switch (tripType) {
    case "hourly": {
      const hrs = Math.max(HOURLY_MIN_HOURS, Number(params.durationHours) || HOURLY_MIN_HOURS);
      return hourlyRateFor(vehicle) * hrs;
    }
    case "airport": {
      // Pearson trips follow the official GTAA tariff (tax-inclusive),
      // scaled to the vehicle class.
      if (params.tariff != null) {
        const surcharge = Number(params.passengerCount) > 4 ? EXTRA_PASSENGER_SURCHARGE : 0;
        return applyVehicleMultiplier(params.tariff, vehicle.type) + surcharge;
      }
      const extraKm = Math.max(0, km - AIRPORT_FREE_KM);
      return Math.round(base + AIRPORT_MEET_GREET + extraKm * PER_KM);
    }
    case "one_way":
    default:
      // Distance-based when we have coordinates; flat base otherwise.
      return km > 0 ? Math.round(base + km * PER_KM) : base;
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
export function airportFeeFor(tripType: TripType): number {
  return tripType === "airport" ? YYZ_AIRPORT_FEE : 0;
}

export interface FareBreakdown {
  /** Vehicle/tariff fare before markup. */
  baseFare: number;
  /** Tariff markup — 0 on retail-rate (hourly / one-way) trips. */
  markup: number;
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
 */
export function priceBreakdown(
  tripType: TripType,
  vehicle: QuotableVehicle | null | undefined,
  ctx: PricingContext = {},
): FareBreakdown {
  const baseFare = quote(tripType, vehicle, ctx);
  // Tariff trips are the "basic prices" the markup was specified against;
  // hourly and one-way already price off the client's retail rate sheet.
  const markup = ctx.tariff != null ? round2(baseFare * TARIFF_MARKUP_RATE) : 0;
  const airportFee = airportFeeFor(tripType);
  const subtotal = round2(baseFare + markup + airportFee);
  const hst = round2(subtotal * HST_RATE);
  return { baseFare, markup, airportFee, subtotal, hst, total: round2(subtotal + hst) };
}

/** Suggested gratuity for a fare, in dollars. Tips are pre-tax by convention. */
export function suggestedTip(subtotal: number, rate: number = DEFAULT_TIP_RATE): number {
  return round2(Math.max(0, subtotal) * rate);
}
