/**
 * scripts/apply-migrations-supabase.mjs
 *
 * Applies all Prisma migrations + supabase/setup.sql to the hosted Supabase
 * project using the Supabase Management API.
 *
 * Requires a SUPABASE_ACCESS_TOKEN (personal access token) in addition to
 * the service role key. Create one at:
 *   https://supabase.com/dashboard/account/tokens
 *
 * Usage:
 *   set SUPABASE_ACCESS_TOKEN=sbp_xxx
 *   node scripts/apply-migrations-supabase.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, "..");

// ── Load .env ─────────────────────────────────────────────────────────────────
const envRaw = readFileSync(join(ROOT, ".env"), "utf8");
const env    = Object.fromEntries(
  envRaw.split("\n")
    .filter(l => l.includes("=") && !l.trimStart().startsWith("#"))
    .map(l => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, "")];
    })
);

const PROJECT_REF  = "qakretnjeuhihodkrctq";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error(`
ERROR: SUPABASE_ACCESS_TOKEN is not set.

Create a Personal Access Token at:
  https://supabase.com/dashboard/account/tokens

Then run:
  set SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx
  node scripts/apply-migrations-supabase.mjs
`);
  process.exit(1);
}

// Management API SQL endpoint — requires PAT
const SQL_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function runSQL(sql, label) {
  const res = await fetch(SQL_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await res.text();

  if (!res.ok) {
    // Idempotency: "already exists" errors are safe to skip
    if (
      text.includes("already exists") ||
      text.includes("duplicate column") ||
      text.includes("already been applied") ||
      text.includes("DuplicateTable") ||
      text.includes("42701") ||  // duplicate_column
      text.includes("42P07")     // duplicate_table
    ) {
      process.stdout.write(`  ⚠  ${label}: already applied\n`);
      return true;
    }
    process.stderr.write(`  ✗  ${label}: HTTP ${res.status}\n     ${text.slice(0, 400)}\n`);
    return false;
  }

  process.stdout.write(`  ✓  ${label}\n`);
  return true;
}

async function main() {
  console.log(`\nApplying to project: ${PROJECT_REF}\n`);

  const migrationsDir = join(ROOT, "prisma", "migrations");
  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`Migrations: ${dirs.length} directories found\n`);

  let ok = 0, fail = 0;

  for (const dir of dirs) {
    const sqlPath = join(migrationsDir, dir.name, "migration.sql");
    let sql;
    try { sql = readFileSync(sqlPath, "utf8"); }
    catch { process.stdout.write(`  –  ${dir.name}: no SQL file\n`); continue; }

    if (!sql.trim()) { process.stdout.write(`  –  ${dir.name}: empty\n`); continue; }

    const passed = await runSQL(sql, dir.name);
    passed ? ok++ : fail++;
  }

  console.log(`\nSetup SQL (buckets + RLS + JWT hook)...`);
  const setup = readFileSync(join(ROOT, "supabase", "setup.sql"), "utf8");
  (await runSQL(setup, "setup.sql")) ? ok++ : fail++;

  console.log(`\n─────────────────────────────────────`);
  console.log(`✓ ${ok} succeeded   ✗ ${fail} failed`);
  console.log(`─────────────────────────────────────\n`);

  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
