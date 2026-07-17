// Verify the OTP flow as the assigned driver would experience it.
// Simulates the driver's JWT (role + claims) inside a transaction, then rolls back.
import { Client } from "pg";
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
let conn = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!conn) throw new Error("Set POSTGRES_URL_NON_POOLING, DATABASE_URL or POSTGRES_URL in .env.local");
conn = conn.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();

const MARCUS = "00000000-0000-4000-a000-000000000011";
const { rows: [bk] } = await c.query(
  "select id, status, start_otp from public.bookings where reference='SR-70A8DE02'",
);
// Hardcoded seed fixture. It is absent from any DB that wasn't seeded with it
// (the live one included), which surfaced as a TypeError on `bk.id` that read
// like a connection fault. Say what's actually wrong instead.
if (!bk) {
  console.error("Fixture booking SR-70A8DE02 not found — seed it (scripts/db-migrate-seed.mjs) or point this script at an existing reference.");
  await c.end();
  process.exit(1);
}
console.log("booking:", bk.id.slice(0, 8), "status:", bk.status, "otp:", bk.start_otp);

await c.query("begin");
try {
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: MARCUS, role: "authenticated" })]);
  await c.query("set local role authenticated");

  // 1. Driver must NOT be able to read start_otp
  try {
    await c.query("select start_otp from public.bookings where id=$1", [bk.id]);
    console.log("1. read start_otp: ❌ ALLOWED (should be denied)");
  } catch (e) {
    console.log("1. read start_otp: ✅ denied →", e.message.split("\n")[0]);
  }
  await c.query("rollback to savepoint sp1").catch(() => {});
} catch {}
await c.query("rollback");

// Fresh txn for the remaining checks (previous error aborted the txn).
await c.query("begin");
await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: MARCUS, role: "authenticated" })]);
await c.query("set local role authenticated");

// 2. Driver CAN read permitted columns of their ride (RLS row + column grant)
const r2 = await c.query("select id, status from public.bookings where id=$1", [bk.id]);
console.log("2. read own ride (permitted cols): " + (r2.rows.length ? "✅ visible" : "❌ hidden"));

// 3. Wrong OTP rejected
await c.query("savepoint sp");
try {
  await c.query("select public.start_ride_with_otp($1, $2)", [bk.id, "0000"]);
  console.log("3. wrong OTP: ❌ ACCEPTED (should be rejected)");
} catch (e) {
  console.log("3. wrong OTP: ✅ rejected →", e.message.split("\n")[0]);
  await c.query("rollback to savepoint sp");
}

// 4. Correct OTP starts the ride
try {
  await c.query("select public.start_ride_with_otp($1, $2)", [bk.id, bk.start_otp]);
  const st = await c.query("select status from public.bookings where id=$1", [bk.id]);
  console.log("4. correct OTP: ✅ status →", st.rows[0].status);
} catch (e) {
  console.log("4. correct OTP: ❌ failed →", e.message.split("\n")[0]);
}

// 5. Starting again from in_progress must fail (status guard)
await c.query("savepoint sp2");
try {
  await c.query("select public.start_ride_with_otp($1, $2)", [bk.id, bk.start_otp]);
  console.log("5. re-start in_progress: ❌ ALLOWED");
} catch (e) {
  console.log("5. re-start in_progress: ✅ blocked →", e.message.split("\n")[0]);
  await c.query("rollback to savepoint sp2");
}

await c.query("rollback"); // discard everything — verification only
const { rows: [after] } = await c.query("select status from public.bookings where reference='SR-70A8DE02'");
console.log("rolled back — booking status still:", after.status);
await c.end();
