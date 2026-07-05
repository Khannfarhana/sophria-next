/**
 * Booking date/time — wall-clock preserving.
 *
 * The exact time a customer picks is stored as that wall clock encoded as a UTC
 * instant, and ALWAYS displayed in UTC. Result: the value round-trips
 * identically for everyone regardless of their device timezone — no conversion,
 * no shift. This module is the single source of truth for both directions.
 *
 *   pick "2026-07-05T18:00"  →  store "2026-07-05T18:00:00.000Z"  →  show "6:00 PM"
 */

const TZ_SUFFIX = /([zZ])$|([+-]\d{2}:?\d{2})$/;
const hasTimeZone = (v: string) => TZ_SUFFIX.test(v);

/** Normalize any value (stored ISO or a naive datetime-local string) to a UTC-wall-clock instant. */
function toUtcInstant(value: string): Date {
  const normalized = hasTimeZone(value)
    ? value
    : `${value.length === 16 ? `${value}:00` : value}Z`;
  return new Date(normalized);
}

/** datetime-local value ("2026-07-05T18:00") → ISO instant preserving the wall clock. */
export function toStorageIso(wallClock: string): string {
  const d = toUtcInstant(wallClock);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Format a stored ISO (or a raw datetime-local string) as its wall clock — never shifted. */
export function formatDateTime(
  value: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  if (!value) return "—";
  const d = toUtcInstant(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-CA", { ...opts, timeZone: "UTC" });
}

/** Format only the date portion (wall clock, UTC). */
export function formatDate(value: string | null | undefined): string {
  return formatDateTime(value, { dateStyle: "medium" });
}

/** True when the value's wall-clock day equals the reference day (both in UTC). */
export function isSameUtcDay(value: string, ref: Date = new Date()): boolean {
  const d = toUtcInstant(value);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === ref.toISOString().slice(0, 10);
}
