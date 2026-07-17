// Create demo auth.users so the seed's profiles/drivers/bookings FKs resolve.
// Idempotent. Safe on a dev/demo database.
import { Client } from "pg";
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
let conn = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!conn) throw new Error("Set POSTGRES_URL_NON_POOLING, DATABASE_URL or POSTGRES_URL in .env.local");
conn = conn.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await client.connect();

const users = [
  ["00000000-0000-4000-a000-000000000001", "ops@sophria.example", "SophRia Operations"],
  ["00000000-0000-4000-a000-000000000002", "jordan.avery@example.com", "Jordan Avery"],
  ["00000000-0000-4000-a000-000000000003", "priya.nair@example.com", "Priya Nair"],
  ["00000000-0000-4000-a000-000000000011", "marcus.bennett@example.com", "Marcus Bennett"],
  ["00000000-0000-4000-a000-000000000012", "elena.rossi@example.com", "Elena Rossi"],
  ["00000000-0000-4000-a000-000000000013", "sam.okafor@example.com", "Sam Okafor"],
];

for (const [id, email, name] of users) {
  try {
    const res = await client.query(
      `insert into auth.users (id, email, aud, role, raw_user_meta_data, created_at, updated_at)
       values ($1, $2, 'authenticated', 'authenticated', jsonb_build_object('full_name', $3::text), now(), now())
       on conflict (id) do nothing`,
      [id, email, name],
    );
    console.log(`auth.users ${email}: ${res.rowCount ? "created" : "exists"}`);
  } catch (e) {
    console.log(`auth.users ${email}: FAIL ${e.message.split("\n")[0]}`);
  }
}
await client.end();
