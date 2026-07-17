// Inspect auth.users required columns (NOT NULL, no default).
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

const r = await client.query(
  `select column_name, data_type, is_nullable, column_default
   from information_schema.columns
   where table_schema='auth' and table_name='users'
   order by ordinal_position`,
);
console.log("auth.users NOT NULL without default:");
for (const c of r.rows) {
  if (c.is_nullable === "NO" && !c.column_default) console.log(`  ${c.column_name} (${c.data_type})`);
}
const existing = await client.query(`select id, email from auth.users order by created_at limit 10`);
console.log("\nexisting auth.users:", existing.rows.length);
existing.rows.forEach((u) => console.log("  ", u.id, u.email));
await client.end();
