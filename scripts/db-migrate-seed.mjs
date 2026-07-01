// Apply SQL migrations then seed the database.
// Usage: node scripts/db-migrate-seed.mjs
// - Migrations run whole-file (they're idempotent: "add column if not exists").
// - Seed runs statement-by-statement so FK-blocked demo rows (e.g. profiles that
//   require matching auth.users) are skipped without aborting the safe inserts.
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

let conn = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
conn = conn.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await client.connect();

// ---- migrations ----
const migDir = "supabase/migrations";
const migrations = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
for (const f of migrations) {
  const sql = fs.readFileSync(path.join(migDir, f), "utf8");
  try {
    await client.query(sql);
    console.log(`migration OK: ${f}`);
  } catch (e) {
    console.log(`migration FAIL: ${f} -> ${e.message.split("\n")[0]}`);
  }
}

// ---- seed (per-statement, tolerant) ----
const seed = fs.readFileSync("supabase/seed.sql", "utf8");
const statements = seed
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

let ok = 0, fail = 0;
for (const stmt of statements) {
  const label = (stmt.match(/insert into (\S+)/i)?.[1] ?? stmt.slice(0, 40)).replace(/\s+/g, " ");
  try {
    const res = await client.query(stmt);
    ok++;
    console.log(`seed OK: ${label} (${res.rowCount} rows)`);
  } catch (e) {
    fail++;
    console.log(`seed SKIP: ${label} -> ${e.message.split("\n")[0]}`);
  }
}
console.log(`\nseed summary: ${ok} ok, ${fail} skipped`);

// ---- final counts ----
for (const t of ["vehicles", "bookings", "profiles", "drivers", "user_roles", "payments", "driver_documents"]) {
  try {
    const c = await client.query(`select count(*)::int as n from public.${t}`);
    console.log(`  ${t}: ${c.rows[0].n} rows`);
  } catch (e) {
    console.log(`  ${t}: ERROR ${e.message.split("\n")[0]}`);
  }
}

await client.end();
