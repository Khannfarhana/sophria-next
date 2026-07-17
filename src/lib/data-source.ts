/**
 * Decides whether the app talks to a real Supabase instance or falls back to
 * the local mock DB (src/data/data.ts).
 *
 * Mock mode is OPT-IN, via NEXT_PUBLIC_USE_MOCK_DB=1. It used to be INFERRED
 * from the Supabase env vars being absent, which made every misconfiguration
 * land silently in a fake database:
 *
 *   * NEXT_PUBLIC_* values are inlined at BUILD time. A deploy whose Supabase
 *     vars exist at runtime but not during the build (env scoped to
 *     production-runtime only, or a warm build cache) shipped a bundle
 *     permanently hardcoded to mock mode — with nothing logged.
 *   * The failure is worse than an outage because it half-works. Sign-in goes
 *     to real Supabase and succeeds, so the app looks healthy while every
 *     booking is written to .mock-db/db.json. The customer gets a real-looking
 *     SR-XXXXXX reference for a ride nobody is dispatched to, and
 *     mockPayBooking marks it paid without Stripe ever being called.
 *   * The old expression also OR'd in SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.
 *     This module is imported by client components ("use client"), where
 *     non-NEXT_PUBLIC_ vars are always undefined — those operands could never
 *     be true in the browser and only created the illusion of a fallback.
 *   * The old docstring claimed "Writes still require a real connection". They
 *     do not: mockCreateBooking and every other mock write persists.
 *
 * Missing Supabase config now surfaces as a visible connection failure instead
 * of a silent switch to a fake database. Loud beats plausible.
 */
export const SUPABASE_ENABLED = process.env.NEXT_PUBLIC_USE_MOCK_DB !== "1";
