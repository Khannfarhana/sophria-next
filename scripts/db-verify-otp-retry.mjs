// Verify pickup-code retry + lockout as the assigned driver. Rolled back.
import { Client } from "pg";
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
let conn = process.env.POSTGRES_URL_NON_POOLING.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();

const MARCUS = "00000000-0000-4000-a000-000000000011";
const { rows: [bk] } = await c.query(
  "select id, status, start_otp from public.bookings where reference='SR-70A8DE02'",
);
console.log("booking:", bk.id.slice(0, 8), bk.status, "otp:", bk.start_otp);

await c.query("begin");
await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: MARCUS, role: "authenticated" })]);
await c.query("set local role authenticated");

const call = async (otp) =>
  (await c.query("select public.start_ride_with_otp($1,$2) r", [bk.id, otp])).rows[0].r;

// 1. Wrong code → soft failure with attempts remaining (counter persists)
for (let i = 1; i <= 5; i++) {
  const r = await call("0000");
  console.log(`attempt ${i}:`, r.error);
}
// 2. Even the CORRECT code is locked out now
const locked = await call(bk.start_otp);
console.log("correct code during lockout:", locked.ok ? "❌ STARTED" : `✅ blocked → ${locked.error}`);
await c.query("rollback");

// 3. Fresh: one wrong, then correct succeeds
await c.query("begin");
await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: MARCUS, role: "authenticated" })]);
await c.query("set local role authenticated");
const w = await call("1111");
console.log("fresh wrong:", w.error);
const ok = await call(bk.start_otp);
const st = await c.query("select status, otp_attempts from public.bookings where id=$1", [bk.id]);
console.log("then correct:", ok.ok ? `✅ status=${st.rows[0].status}, attempts reset=${st.rows[0].otp_attempts}` : `❌ ${ok.error}`);
await c.query("rollback");

const { rows: [after] } = await c.query("select status, otp_attempts from public.bookings where reference='SR-70A8DE02'");
console.log("rolled back — status:", after.status, "attempts:", after.otp_attempts);
await c.end();
