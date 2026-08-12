-- Migration: seed_super_admin
-- 1. Adds SUPER_ADMIN to the Role enum (if not already present)
-- 2. Creates the platform school row
-- 3. Inserts the SUPER_ADMIN user
-- Fully idempotent — safe to run multiple times.

-- ── 1. Add SUPER_ADMIN to the Role enum ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'Role'::regtype
      AND enumlabel = 'SUPER_ADMIN'
  ) THEN
    ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
  END IF;
END
$$;

-- ── 2. Platform school ────────────────────────────────────────────────────────
INSERT INTO "School" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('platform_school_bidii', 'Bidii Platform', 'bidii-platform', NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET "updatedAt" = NOW();

-- ── 3. SUPER_ADMIN user ───────────────────────────────────────────────────────
-- Password: Bidii@2026  (bcrypt $2b$12$ hash)
INSERT INTO "User" (
  "id", "email", "passwordHash", "role",
  "mustChangePassword", "isActive", "schoolId", "createdAt", "updatedAt"
)
VALUES (
  'super_admin_bidii',
  'bidiisoftwares.1.ke@gmail.com',
  '$2b$12$s1nDaDbQNpMVwiHFvDUGhOCOxp5b.Ye.JOGvcedhQTwWC6umwez72',
  'SUPER_ADMIN',
  FALSE,
  TRUE,
  'platform_school_bidii',
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO UPDATE SET
  "email"        = EXCLUDED."email",
  "passwordHash" = EXCLUDED."passwordHash",
  "isActive"     = TRUE,
  "updatedAt"    = NOW();
