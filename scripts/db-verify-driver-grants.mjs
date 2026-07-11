// Confirm the driver column-lock: legit become-chauffeur insert still works,
// privileged-column writes are blocked. Simulates a customer's JWT. Rolled back.
import { Client } from "pg";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "").trim();
}
let conn = process.env.POSTGRES_URL_NON_POOLING.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();

// A user with NO existing driver row (use a fresh customer id that exists in profiles).
const JORDAN = "00000000-0000-4000-a000-000000000002";
await c.query("begin");
await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: JORDAN, role: "authenticated" })]);
await c.query("set local role authenticated");

const t = async (label, sql, params = []) => {
  await c.query("savepoint sp");
  try { const r = await c.query(sql, params); console.log(`${label}: rows=${r.rowCount} ${r.rowCount ? "SUCCEEDED" : "no-op"}`); }
  catch (e) { console.log(`${label}: BLOCKED → ${e.message.split("\n")[0]}`); }
  await c.query("rollback to savepoint sp");
};

console.log("=== As customer Jordan (no driver row) ===");
await t("A. legit apply (safe columns only) — should SUCCEED",
  "insert into public.drivers (user_id, license_number, experience_years, is_available, city_of_residence) values ($1,'ON-123',3,false,'Toronto')", [JORDAN]);
await t("B. apply but sneak is_verified=true — should BLOCK",
  "insert into public.drivers (user_id, license_number, experience_years, is_verified) values ($1,'ON-123',3,true)", [JORDAN]);
await t("C. apply but sneak total_earnings — should BLOCK",
  "insert into public.drivers (user_id, license_number, experience_years, total_earnings) values ($1,'ON-123',3,99999)", [JORDAN]);
await t("D. apply but sneak commission_rate — should BLOCK",
  "insert into public.drivers (user_id, license_number, experience_years, commission_rate) values ($1,'ON-123',3,1)", [JORDAN]);

await c.query("rollback");

// Driver payout columns: a driver must not be able to raise their own
// commission_rate or a booking's driver_payout, but CAN read driver_payout.
const MARCUS = "00000000-0000-4000-a000-000000000011"; // driver row b000-…0011, assigned booking d000-…0003
await c.query("begin");
await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: MARCUS, role: "authenticated" })]);
await c.query("set local role authenticated");

console.log("=== As driver Marcus ===");
await t("E. update own commission_rate — should BLOCK",
  "update public.drivers set commission_rate = 1 where user_id = $1", [MARCUS]);
await t("F. update own booking driver_payout — should BLOCK",
  "update public.bookings set driver_payout = 999999 where id = '00000000-0000-4000-d000-000000000003'");
await t("G. select own booking driver_payout — should SUCCEED",
  "select driver_payout from public.bookings where id = '00000000-0000-4000-d000-000000000003'");

await c.query("rollback");
console.log("(rolled back)");
await c.end();
