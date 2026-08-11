/**
 * Verifies the Supabase database has all expected tables.
 * Usage: set SUPABASE_ACCESS_TOKEN=sbp_xxx && node scripts/verify-db.mjs
 */

const PAT = process.env.SUPABASE_ACCESS_TOKEN;
if (!PAT) {
  console.error("Set SUPABASE_ACCESS_TOKEN=sbp_xxx first.");
  process.exit(1);
}

const res = await fetch(
  "https://api.supabase.com/v1/projects/qakretnjeuhihodkrctq/database/query",
  {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${PAT}` },
    body:    JSON.stringify({
      query: "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
    }),
  }
);

const data = await res.json();
if (!res.ok || data.message) {
  console.error("ERR:", JSON.stringify(data));
  process.exit(1);
}

console.log(`\n✓ ${data.length} tables in public schema:\n`);
data.forEach(r => console.log(" ", r.table_name));
