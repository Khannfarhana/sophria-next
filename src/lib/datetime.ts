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

/**
 * The operating timezone. Booking wall clocks are Toronto local time — the
 * fleet runs the GTA and its cross-border reach (Buffalo, Detroit, Montreal)
 * is Eastern too, so one zone covers every pickup.
 */
const OPERATING_TZ = "America/Toronto";

/** Offset (ms) between a zone's wall clock and the real instant it happens at. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const wallAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return wallAsUtc - instant.getTime();
}

/**
 * The real instant a stored booking time occurs at.
 *
 * Storage keeps the picked wall clock encoded as UTC (see toStorageIso), which
 * is deliberate for display but is NOT the moment the ride happens: "18:00Z"
 * means 6pm in Toronto, i.e. 22:00Z in summer. Anything comparing a pickup to
 * the current time — the cancellation ladder above all — must resolve the
 * instant first, or every ride looks hours closer than it is.
 */
export function pickupInstant(value: string): Date {
  const wallAsUtc = toUtcInstant(value).getTime();
  if (isNaN(wallAsUtc)) return new Date(NaN);
  // Solve instant I where wallClock(I) == wallAsUtc, i.e. I = wallAsUtc - offset(I).
  // A second pass settles the offset across a DST boundary.
  let guess = wallAsUtc - zoneOffsetMs(new Date(wallAsUtc), OPERATING_TZ);
  guess = wallAsUtc - zoneOffsetMs(new Date(guess), OPERATING_TZ);
  return new Date(guess);
}

/** Minutes from `now` until a stored pickup time. Negative once it has passed. */
export function minutesUntilPickup(value: string, now: number = Date.now()): number {
  const t = pickupInstant(value).getTime();
  return isNaN(t) ? NaN : (t - now) / 60000;
}

/** True when the value's wall-clock day equals the reference day (both in UTC). */
export function isSameUtcDay(value: string, ref: Date = new Date()): boolean {
  const d = toUtcInstant(value);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === ref.toISOString().slice(0, 10);
}

/**
 * Whether a picked wall clock is a usable, still-in-the-future pickup.
 *
 * Resolves through pickupInstant rather than comparing the raw value to
 * Date.now(). That distinction is the whole point: the stored form of "6pm" is
 * "18:00Z", which as a bare instant is 2pm Toronto in summer — a direct
 * comparison would reject a perfectly valid 6pm booking made at 3pm, and
 * accept a 9am one made at 10am. Rejects NaN, so the empty/garbage input that
 * toStorageIso would otherwise silently coerce to "now" is caught here.
 */
export function isFuturePickup(wallClock: string | null | undefined, now: number = Date.now()): boolean {
  if (!wallClock) return false;
  const t = pickupInstant(wallClock).getTime();
  return Number.isFinite(t) && t > now;
}

/** Now, as OPERATING_TZ's wall clock: { date: "2026-07-17", time: "15:00" }. */
function operatingWallClock(now: Date = new Date()): { date: string; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: OPERATING_TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    })
      .formatToParts(now)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, x.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`,
  };
}

/**
 * The earliest pickup a customer may choose, as a `datetime-local` value in
 * OPERATING_TZ — for the `min` attribute on the picker. Toronto's wall clock,
 * not the browser's: the form's values are read as Toronto time regardless of
 * where the customer's device is set.
 */
export function minPickupLocalValue(now: Date = new Date()): string {
  const { date, time } = operatingWallClock(now);
  return `${date}T${time}`;
}

/**
 * True when a stored pickup falls on TODAY in Toronto.
 *
 * Replaces isSameUtcDay for pickup comparisons, which compared the stored
 * wall-clock day against the UTC day and so broke every evening: after 8pm EDT
 * the UTC date has already rolled over, so a driver's remaining rides for
 * tonight compared "2026-07-17" against "2026-07-18" and vanished from Today.
 */
export function isPickupToday(value: string | null | undefined, now: Date = new Date()): boolean {
  if (!value) return false;
  const d = toUtcInstant(value);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === operatingWallClock(now).date;
}
