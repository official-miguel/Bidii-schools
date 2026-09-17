-- Own contact number for User — currently only meaningful for SUPER_ADMIN,
-- who has no Teacher/Parent row to hold one. Used by Settings → My Profile.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
