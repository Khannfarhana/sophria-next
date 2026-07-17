import { Client } from "pg";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "").trim();
}
let conn = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!conn) throw new Error("Set POSTGRES_URL_NON_POOLING, DATABASE_URL or POSTGRES_URL in .env.local");
conn = conn.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(fs.readFileSync("supabase/migrations/20260705152922_fix_driver_escalation_trigger.sql", "utf8"));
console.log("migration applied");

// Pick a real driver row to exercise the trigger.
const { rows: [d] } = await c.query("select id, user_id, is_verified, is_available from public.drivers limit 1");
console.log("test driver:", d.id.slice(0, 8), "is_verified:", d.is_verified);

const t = async (label, claims, sql) => {
  await c.query("begin");
  try {
    if (claims) await c.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await c.query(sql, [d.id]);
    console.log(`${label}: ✅ allowed`);
  } catch (e) {
    console.log(`${label}: ⛔ ${e.message.split("\n")[0]}`);
  }
  await c.query("rollback");
};

// 1. service role changing is_verified → allowed (no total_rides crash)
await t("service_role sets is_verified", JSON.stringify({ role: "service_role" }),
  "update public.drivers set is_verified = not is_verified where id=$1");
// 2. authenticated non-admin driver changing is_verified → blocked (not total_rides)
await t("driver sets is_verified", JSON.stringify({ role: "authenticated", sub: d.user_id }),
  "update public.drivers set is_verified = not is_verified where id=$1");
// 3. authenticated driver changing only is_available → allowed
await t("driver toggles is_available", JSON.stringify({ role: "authenticated", sub: d.user_id }),
  "update public.drivers set is_available = not is_available where id=$1");

await c.end();
