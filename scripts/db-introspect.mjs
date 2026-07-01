import { Client } from "pg";
import fs from "node:fs";

// Load .env.local manually.
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

let conn = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
// Drop sslmode so our explicit ssl config (accept Supabase's self-signed chain) wins.
conn = conn.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

await client.connect();

const tables = await client.query(
  `select table_name from information_schema.tables where table_schema='public' order by table_name`,
);
console.log("public tables:", tables.rows.map((r) => r.table_name).join(", ") || "(none)");

for (const t of ["vehicles", "bookings", "profiles", "drivers", "user_roles", "payments", "driver_documents"]) {
  try {
    const c = await client.query(`select count(*)::int as n from public.${t}`);
    console.log(`  ${t}: ${c.rows[0].n} rows`);
  } catch (e) {
    console.log(`  ${t}: MISSING (${e.message.split("\n")[0]})`);
  }
}

// Do the geo columns exist on bookings yet?
try {
  const cols = await client.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name='bookings' order by column_name`,
  );
  console.log("bookings columns:", cols.rows.map((r) => r.column_name).join(", "));
} catch {}

await client.end();
