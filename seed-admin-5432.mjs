/**
 * Re-seeds SUPER_ADMIN using port 5432 (session pooler — works from this machine).
 */
import pg from "pg";

// bcrypt hash of "Bidii@2026" (salt rounds 12)
const HASH = "$2b$12$s1nDaDbQNpMVwiHFvDUGhOCOxp5b.Ye.JOGvcedhQTwWC6umwez72";

const client = new pg.Client({
  host:     "aws-0-us-east-1.pooler.supabase.com",
  port:     5432,
  database: "postgres",
  user:     "postgres.qakretnjeuhihodkrctq",
  password: "Ifoundme@2025",
  ssl:      { rejectUnauthorized: false },
});

async function run(sql, label) {
  await client.query(sql);
  console.log(`✓ ${label}`);
}

async function main() {
  await client.connect();
  console.log("✓ Connected to Supabase (port 5432)\n");

  // Step 1 — add SUPER_ADMIN to enum if missing
  await run(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'Role'::regtype AND enumlabel = 'SUPER_ADMIN'
      ) THEN
        ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
      END IF;
    END $$
  `, "SUPER_ADMIN enum value ensured");

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

  console.log("\n✅ Credentials:");
  console.log("   Email:    bidiisoftwares.1.ke@gmail.com");
  console.log("   Password: Bidii@2026");
  console.log("\n✅ Database: Supabase (aws-0-us-east-1.pooler.supabase.com:5432)");
  console.log("✅ No Neon — confirmed Supabase only");
}

main()
  .then(() => { console.log("\nDone."); process.exit(0); })
  .catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); })
  .finally(() => client.end());
