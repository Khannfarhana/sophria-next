/**
 * Decides whether the app talks to a real Supabase instance or falls back to
 * the local mock DB (src/data/data.ts). When the public Supabase env vars are
 * absent (e.g. demo mode / local preview), reads resolve to mock data so the
 * UI still renders. Writes still require a real connection.
 */
export const SUPABASE_ENABLED = Boolean(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY),
);
