import { Client } from "pg";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
let conn = process.env.POSTGRES_URL_NON_POOLING.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await client.connect();
const v = await client.query(`select name, type, base_rate, hourly_rate, is_active from public.vehicles order by base_rate`);
console.log("VEHICLES:"); v.rows.forEach((r) => console.log(`  ${r.name} (${r.type}) $${r.base_rate}/base $${r.hourly_rate}/hr active=${r.is_active}`));
const p = await client.query(`select full_name, email from public.profiles where email like '%example%' or email like '%sophria%' order by email`);
console.log("\nDEMO PROFILES:"); p.rows.forEach((r) => console.log(`  ${r.full_name ?? "(null name)"} — ${r.email}`));
const r2 = await client.query(`select pr.full_name, ur.role from public.user_roles ur join public.profiles pr on pr.id=ur.user_id where pr.email like '%example%' or pr.email like '%sophria%' order by ur.role`);
console.log("\nDEMO ROLES:"); r2.rows.forEach((r) => console.log(`  ${r.full_name}: ${r.role}`));
const b = await client.query(`select reference, trip_type, pickup_location, dropoff_location, distance_km, status from public.bookings order by created_at desc limit 6`);
console.log("\nBOOKINGS:"); b.rows.forEach((r) => console.log(`  ${r.reference} [${r.trip_type}] ${r.pickup_location} -> ${r.dropoff_location} ${r.distance_km ?? "-"}km (${r.status})`));
await client.end();
