// Backfill public.profiles for any auth.users missing one (mirrors handle_new_user).
import { Client } from "pg";
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
let conn = process.env.POSTGRES_URL_NON_POOLING.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await client.connect();

const res = await client.query(`
  insert into public.profiles (id, email, full_name)
  select u.id, u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))
  from auth.users u
  left join public.profiles p on p.id = u.id
  where p.id is null
  returning email, full_name
`);
console.log("backfilled profiles:", res.rowCount);
res.rows.forEach((r) => console.log("  +", r.email, "→", r.full_name));

await client.end();
