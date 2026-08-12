-- Migration: super_admin_nullable_school
-- Makes User.schoolId nullable so SUPER_ADMIN accounts don't need a school.
-- Also drops the school FK constraint for null-schoolId rows.

-- Drop old FK and unique index first
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_schoolId_fkey";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_schoolId_email_key";

-- Make schoolId nullable
ALTER TABLE "User" ALTER COLUMN "schoolId" DROP NOT NULL;

-- Re-add FK (only fires when schoolId is not null)
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id")
  ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- Re-add unique constraint scoped to non-null schoolId rows only
CREATE UNIQUE INDEX IF NOT EXISTS "User_schoolId_email_key"
  ON "User"("schoolId", "email")
  WHERE "schoolId" IS NOT NULL;

-- Update the existing SUPER_ADMIN row to have no schoolId
UPDATE "User" SET "schoolId" = NULL WHERE id = 'super_admin_bidii';
