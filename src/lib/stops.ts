/**
 * Intermediate stops on a booking.
 *
 * The client asked to "leave option to add upto 5 stops" (14 Jul). Nothing
 * existed before this: the form had exactly two address fields, `bookings` had
 * no column, and getDirections took two points — while the pricing page and FAQ
 * already advertised multi-stop trips and "$10 per 10 minutes" for requested
 * stops.
 *
 * Routing through stops changes the distance, so the fare follows automatically
 * on distance-priced trips. Per-stop WAITING time is not modelled: the $10/10min
 * figure is a dispatch-side charge and we have no way to know how long a
 * passenger spends at each stop until the ride happens. That stays a manual
 * charge until the client tells us how they want it billed.
 */

export const MAX_STOPS = 5;

/**
 * A type alias rather than an interface on purpose: interfaces get no implicit
 * index signature, so an interface here would not be assignable to the
 * generated `Json` type of the jsonb column and every write would need a cast.
 */
export type BookingStop = {
  address: string;
  /** Null when the passenger typed an address Mapbox couldn't resolve. */
  lat: number | null;
  lng: number | null;
};

/** A stop counts only once it has an address; blank rows are UI scaffolding. */
export const isFilledStop = (s: BookingStop): boolean => s.address.trim().length > 0;

/** Only stops we have coordinates for can be routed through. */
export function routableStops(stops: BookingStop[]): { lat: number; lng: number }[] {
  return stops
    .filter((s) => isFilledStop(s) && s.lat != null && s.lng != null)
    .map((s) => ({ lat: s.lat as number, lng: s.lng as number }));
}

/** Normalise unknown JSON from the DB (or a client payload) into stops. */
export function parseStops(value: unknown): BookingStop[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_STOPS)
    .map((raw) => {
      const s = raw as Partial<BookingStop> | null;
      if (!s || typeof s.address !== "string") return null;
      const lat = typeof s.lat === "number" && Number.isFinite(s.lat) ? s.lat : null;
      const lng = typeof s.lng === "number" && Number.isFinite(s.lng) ? s.lng : null;
      return { address: s.address.slice(0, 300), lat, lng };
    })
    .filter((s): s is BookingStop => s != null && isFilledStop(s));
}

/** Short summary for lists and emails, e.g. "via Yorkdale, Eaton Centre". */
export function summariseStops(stops: BookingStop[]): string {
  const filled = stops.filter(isFilledStop);
  if (filled.length === 0) return "";
  return `via ${filled.map((s) => s.address.split(",")[0]).join(", ")}`;
}
