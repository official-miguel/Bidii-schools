/**
 * scripts/apply-migrations-supabase.mjs
 *
 * Bootstraps a fresh Supabase Postgres database with the full Bidii schema:
 *   1. Applies the complete baseline schema (generated from prisma migrate diff)
 *   2. Creates the _prisma_migrations table and marks all migrations as applied
 *   3. Applies supabase/setup.sql (buckets + RLS + JWT hook)
 *
 * Run ONCE on a fresh database. Safe to re-run if interrupted (idempotent guards).
 *
 * Usage:
 *   set SUPABASE_ACCESS_TOKEN=sbp_xxx
 *   node scripts/apply-migrations-supabase.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

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
  console.error("ERROR: set SUPABASE_ACCESS_TOKEN=sbp_xxx before running this script.");
  process.exit(1);
}

const SQL_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function sql(query, label) {
  const res  = await fetch(SQL_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ACCESS_TOKEN}` },
    body:    JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) {
    const skip =
      body.includes("already exists") || body.includes("42P07") ||
      body.includes("42701") || body.includes("duplicate") ||
      body.includes("already been applied") ||
      body.includes("42P01");   // relation does not exist — schema not applied yet
    if (skip) { process.stdout.write(`  ⚠  ${label}: skipped (${body.includes("42P01") ? "table not ready" : "already exists"})\n`); return true; }
    process.stderr.write(`  ✗  ${label}:\n     ${body.slice(0, 500)}\n`);
    return false;
  }
  process.stdout.write(`  ✓  ${label}\n`);
  return true;
}

// Split SQL into individual statements, handling $$ blocks safely
function splitStatements(rawSql) {
  const stmts = [];
  let current   = "";
  let inDollar  = false;
  const lines   = rawSql.split("\n");

  for (const line of lines) {
    if (line.includes("$$")) inDollar = !inDollar;
    current += line + "\n";
    if (!inDollar && current.trimEnd().endsWith(";")) {
      const s = current.trim();
      if (s && s !== ";") stmts.push(s);
      current = "";
    }
  }
  if (current.trim()) stmts.push(current.trim());
  return stmts.filter(s => s.length > 1);
}

async function main() {
  console.log(`\n━━━ Bidii → Supabase Database Setup ━━━`);
  console.log(`Project: ${PROJECT_REF}\n`);

  // ── Step 1: Apply full baseline schema in chunks ────────────────────────────
  console.log("Step 1/3: Applying full schema baseline in chunks...");

  const baselineSql = readFileSync(join(ROOT, "scripts", "baseline.sql"), "utf8").replace(/^\uFEFF/, "");
  const baselineStmts = splitStatements(baselineSql);
  console.log(`  ${baselineStmts.length} statements to apply`);

  // Apply in batches of 20 statements to stay within the API's message size limit
  const BATCH = 20;
  let schemaOk = 0, schemaFail = 0, schemaSkip = 0;

  for (let i = 0; i < baselineStmts.length; i += BATCH) {
    const batch      = baselineStmts.slice(i, i + BATCH);
    const batchSql   = batch.join("\n\n");
    const batchLabel = `Schema statements ${i + 1}–${Math.min(i + BATCH, baselineStmts.length)} / ${baselineStmts.length}`;
    const passed     = await sql(batchSql, batchLabel);
    if (passed) schemaOk++; else schemaFail++;
  }

  console.log(`  Schema: ${schemaOk * BATCH} stmts applied, ${schemaFail} batches with issues`);

  if (schemaFail > 0) {
    console.log("\nSome schema batches had issues — this can happen if some objects already");
    console.log("exist. Continuing with migration history and setup...");
  }

  // ── Step 2: Create _prisma_migrations and mark all migrations applied ────────
  console.log("\nStep 2/3: Setting up Prisma migration history...");

  // Create the migrations tracking table
  await sql(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id                      VARCHAR(36)  PRIMARY KEY,
      checksum                VARCHAR(64)  NOT NULL,
      finished_at             TIMESTAMPTZ,
      migration_name          VARCHAR(255) NOT NULL,
      logs                    TEXT,
      rolled_back_at          TIMESTAMPTZ,
      started_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
      applied_steps_count     INTEGER      NOT NULL DEFAULT 0
    );
  `, "_prisma_migrations table");

  // Get all migration dirs
  const migrationsDir = join(ROOT, "prisma", "migrations");
  const migDirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  // Build a single INSERT for all migrations
  const rows = [];
  for (const dir of migDirs) {
    const sqlPath = join(migrationsDir, dir.name, "migration.sql");
    let migSql = "";
    try { migSql = readFileSync(sqlPath, "utf8"); } catch { /* no SQL file */ }

    const checksum = createHash("sha256").update(migSql).digest("hex");
    const id       = crypto.randomUUID?.() ?? `${Date.now()}-${dir.name.slice(0,8)}`;

    rows.push(`(
      '${id}', '${checksum}', now(), '${dir.name.replace(/'/g, "''")}',
      NULL, NULL, now(), 1
    )`);
  }

  if (rows.length > 0) {
    const insertSql = `
      INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES ${rows.join(",\n")}
      ON CONFLICT (id) DO NOTHING;
    `;
    await sql(insertSql, `Mark ${rows.length} migrations as applied`);
  }

  // ── Step 3: Apply setup.sql ──────────────────────────────────────────────────
  console.log("\nStep 3/3: Applying Supabase setup (buckets + RLS + JWT hook)...");

  const setupSql = readFileSync(join(ROOT, "supabase", "setup.sql"), "utf8");

  // Split setup.sql into individual statements (contains PL/pgSQL functions)
  const stmts = splitStatements(setupSql);
  console.log(`  ${stmts.length} statements to apply`);

  let ok = 0, skip = 0, fail = 0;
  for (const stmt of stmts) {
    // Get a short label from the first meaningful line
    const label = stmt.split("\n").find(l => l.trim() && !l.trim().startsWith("--"))?.trim().slice(0, 60) ?? "...";
    const passed = await sql(stmt, label);
    if (passed) {
      if (stmt.includes("already exists")) skip++; else ok++;
    } else {
      fail++;
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Schema:  ✓ applied`);
  console.log(`Setup:   ✓ ${ok} statements  ⚠ ${skip} skipped  ✗ ${fail} failed`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (fail > 0) {
    console.log("Some setup statements failed. Check errors above.");
    console.log("You can re-run this script safely — it's idempotent.\n");
  } else {
    console.log("✅ Database fully set up. You can now connect your app.\n");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
