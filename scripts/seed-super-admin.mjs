/**
 * scripts/seed-super-admin.mjs
 * Run: node scripts/seed-super-admin.mjs
 *
 * 1. Adds SUPER_ADMIN to the Role enum in Postgres (if not present)
 * 2. Upserts the platform school row
 * 3. Upserts the SUPER_ADMIN user with the given credentials
 */

import pg from "pg";
import { readFileSync } from "fs";

// Load .env manually
const envFile = readFileSync(".env", "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m) process.env[m[1]] = m[2];
}

// bcrypt hash of "Bidii@2026" with salt rounds 12
const HASH = "$2b$12$s1nDaDbQNpMVwiHFvDUGhOCOxp5b.Ye.JOGvcedhQTwWC6umwez72";

// Parse the DATABASE_URL manually to avoid SSL string override issues
const rawUrl = (process.env.DATABASE_URL || "").replace(":5432/", ":6543/");
const url = new URL(rawUrl.replace("postgresql://", "http://"));

const client = new pg.Client({
  host:     url.hostname,
  port:     parseInt(url.port) || 6543,
  database: url.pathname.replace("/", ""),
  user:     decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  ssl:      { rejectUnauthorized: false },
});

async function run(sql, label) {
  await client.query(sql);
  console.log(`✓ ${label}`);
}

async function main() {
  await client.connect();
  console.log("Connected to database\n");

  // Step 1 — add enum value (must be outside a transaction)
  await run(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'Role'::regtype AND enumlabel = 'SUPER_ADMIN'
      ) THEN
        ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
      END IF;
    END
    $$
  `, "SUPER_ADMIN added to Role enum");

  // Step 2 — platform school
  await run(`
    INSERT INTO "School" ("id","name","slug","createdAt","updatedAt")
    VALUES ('platform_school_bidii','Bidii Platform','bidii-platform',NOW(),NOW())
    ON CONFLICT ("id") DO UPDATE SET "updatedAt" = NOW()
  `, "Platform school upserted");

  // Step 3 — super admin user
  await run(`
    INSERT INTO "User" (
      "id","email","passwordHash","role",
      "mustChangePassword","isActive","schoolId","createdAt","updatedAt"
    )
    VALUES (
      'super_admin_bidii',
      'bidiisoftwares.1.ke@gmail.com',
      '${HASH}',
      'SUPER_ADMIN',
      false, true,
      'platform_school_bidii',
      NOW(), NOW()
    )
    ON CONFLICT ("id") DO UPDATE SET
      "email"        = EXCLUDED."email",
      "passwordHash" = EXCLUDED."passwordHash",
      "isActive"     = true,
      "updatedAt"    = NOW()
  `, "SUPER_ADMIN user upserted");

  console.log("\nCredentials:");
  console.log("  Email:    bidiisoftwares.1.ke@gmail.com");
  console.log("  Password: Bidii@2026");
}

main()
  .then(() => { console.log("\nDone."); process.exit(0); })
  .catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); })
  .finally(() => client.end());
