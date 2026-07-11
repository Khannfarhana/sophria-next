/**
 * Mode-aware quoting. Single source of truth for the booking widget, /book flow,
 * and admin. Distance-based pricing is stubbed (flat tiers) until a maps provider
 * is wired in — see docs/torontocitylimo-replication-plan.md §5.
 */

import { applyVehicleMultiplier, EXTRA_PASSENGER_SURCHARGE } from "@/lib/tariff";

export type TripType = "one_way" | "hourly" | "airport";

export const TRIP_TYPES: { value: TripType; label: string; hint: string }[] = [
  { value: "one_way", label: "One-way", hint: "Point to point" },
  { value: "hourly", label: "By the hour", hint: "Dedicated chauffeur" },
  { value: "airport", label: "Airport", hint: "Pearson / Billy Bishop / Hamilton / Buffalo" },
];

export const HOURLY_MIN_HOURS = 2;
const AIRPORT_FEE = 15; // flat zone surcharge (meet & greet + wait)

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
      return Math.round(base + AIRPORT_FEE + extraKm * PER_KM);
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
