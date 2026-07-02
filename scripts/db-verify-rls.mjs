// Verify the load-bearing RLS controls as a real authenticated (non-admin) user.
// Simulates a customer's Supabase JWT claims. All writes rolled back.
import { Client } from "pg";
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "").trim();
}
let conn = process.env.POSTGRES_URL_NON_POOLING.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();

const JORDAN = "00000000-0000-4000-a000-000000000002"; // customer1 (has only 'customer' role)
const asUser = async (uid) => {
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
  await c.query("set local role authenticated");
};
const tryStmt = async (label, sql, params = []) => {
  await c.query("savepoint sp");
  try {
    const r = await c.query(sql, params);
    console.log(`${label}: rowcount=${r.rowCount}  ${r.rowCount > 0 ? "⚠ SUCCEEDED" : "✅ no rows affected"}`);
  } catch (e) {
    console.log(`${label}: ✅ BLOCKED → ${e.message.split("\n")[0]}`);
  }
  await c.query("rollback to savepoint sp");
};

// grab a booking NOT owned by Jordan (Priya's)
const { rows: [foreign] } = await c.query(
  "select id, reference from public.bookings where customer_id <> $1 and status in ('pending','confirmed') limit 1", [JORDAN]);

await c.query("begin");
await asUser(JORDAN);

console.log("=== As customer Jordan (should all be BLOCKED) ===");
await tryStmt("1. self-grant admin role",
  "insert into public.user_roles (user_id, role) values ($1,'admin')", [JORDAN]);
await tryStmt("2. update existing role to admin",
  "update public.user_roles set role='admin' where user_id=$1", [JORDAN]);
await tryStmt("3. self-grant driver role",
  "insert into public.user_roles (user_id, role) values ($1,'driver')", [JORDAN]);
if (foreign) {
  await tryStmt(`4. hijack someone else's booking (${foreign.reference})`,
    "update public.bookings set driver_id=null, status='cancelled' where id=$1", [foreign.id]);
  await tryStmt(`5. read another customer's booking otp`,
    "select start_otp from public.bookings where id=$1", [foreign.id]);
}
await tryStmt("6. self-verify as a driver (drivers insert)",
  "insert into public.drivers (user_id, license_number, experience_years, is_verified, is_available, rating) values ($1,'HACK',1,true,true,5)", [JORDAN]);
await tryStmt("7. read all profiles (PII harvest)",
  "select count(*) from public.profiles");

await c.query("rollback");
console.log("\n(all rolled back — no changes persisted)");
await c.end();
