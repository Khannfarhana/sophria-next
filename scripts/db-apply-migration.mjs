// Apply a SINGLE migration file to the live DB, without replaying seed.sql
// (unlike db-migrate-seed.mjs). Usage:
//   node scripts/db-apply-migration.mjs 20260711120000_driver_commission_payout.sql
import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "").trim();
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/db-apply-migration.mjs <migration-file.sql>");
  process.exit(1);
}
const full = path.join("supabase", "migrations", path.basename(file));
const sql = fs.readFileSync(full, "utf8");

const raw = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
const conn = raw.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();

try {
  await c.query("begin");
  await c.query(sql);
  await c.query("commit");
  console.log(`✓ applied ${full}`);
} catch (e) {
  await c.query("rollback");
  console.error(`✗ failed (rolled back): ${e.message}`);
  process.exitCode = 1;
} finally {
  await c.end();
}
