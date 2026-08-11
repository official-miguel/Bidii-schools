-- Migration: supabase_otp_storage
-- Adds OTP-based auth support and Supabase Storage metadata tables.
-- Applies cleanly on top of existing schema.

-- ── 1. Make User.passwordHash nullable ───────────────────────────────────────
-- OTP login does not require a password. Existing rows keep their hash;
-- new OTP-only users will have NULL.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- ── 2. Make User.mustChangePassword default false ────────────────────────────
-- OTP users have no password to change; the flag is only meaningful for
-- admin-created accounts that were assigned a temporary password.
ALTER TABLE "User" ALTER COLUMN "mustChangePassword" SET DEFAULT false;

-- ── 3. Add avatarStoragePath to User ─────────────────────────────────────────
-- Raw Supabase Storage path for the user's avatar image (images bucket).
-- avatarUrl retains the resolved public/signed URL for display.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarStoragePath" TEXT;

-- ── 3b. Add photoStoragePath to Student ──────────────────────────────────────
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "photoStoragePath" TEXT;

-- ── 4. StoredImage table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "StoredImage" (
    "id"          TEXT NOT NULL,
    "schoolId"    TEXT NOT NULL,
    "ownerId"     TEXT,
    "storagePath" TEXT NOT NULL,
    "mimeType"    TEXT NOT NULL DEFAULT 'image/jpeg',
    "sizeBytes"   INTEGER,
    "label"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoredImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoredImage_storagePath_key"
    ON "StoredImage"("storagePath");

CREATE INDEX IF NOT EXISTS "StoredImage_schoolId_idx"
    ON "StoredImage"("schoolId");

CREATE INDEX IF NOT EXISTS "StoredImage_ownerId_idx"
    ON "StoredImage"("ownerId");

CREATE INDEX IF NOT EXISTS "StoredImage_schoolId_ownerId_idx"
    ON "StoredImage"("schoolId", "ownerId");

ALTER TABLE "StoredImage"
    ADD CONSTRAINT "StoredImage_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 5. StoredReport table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "StoredReport" (
    "id"            TEXT NOT NULL,
    "schoolId"      TEXT NOT NULL,
    "subjectUserId" TEXT,
    "storagePath"   TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "periodLabel"   TEXT,
    "sizeBytes"     INTEGER,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoredReport_storagePath_key"
    ON "StoredReport"("storagePath");

CREATE INDEX IF NOT EXISTS "StoredReport_schoolId_idx"
    ON "StoredReport"("schoolId");

CREATE INDEX IF NOT EXISTS "StoredReport_subjectUserId_idx"
    ON "StoredReport"("subjectUserId");

CREATE INDEX IF NOT EXISTS "StoredReport_schoolId_subjectUserId_idx"
    ON "StoredReport"("schoolId", "subjectUserId");

CREATE INDEX IF NOT EXISTS "StoredReport_schoolId_createdAt_idx"
    ON "StoredReport"("schoolId", "createdAt" DESC);

ALTER TABLE "StoredReport"
    ADD CONSTRAINT "StoredReport_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
