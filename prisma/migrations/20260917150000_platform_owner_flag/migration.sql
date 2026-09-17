-- The platform owner: the single super admin allowed into
-- /super-admin/settings (OTP SMS provider, super-admin accounts, and the
-- admin action history). Every other super admin gets the rest of the
-- console without that section.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPlatformOwner" BOOLEAN NOT NULL DEFAULT false;

-- Promote the existing (earliest-created) super admin so whoever runs this
-- migration keeps access to Settings instead of locking themselves out.
UPDATE "User"
SET "isPlatformOwner" = true
WHERE id = (
  SELECT id FROM "User"
  WHERE role = 'SUPER_ADMIN' AND "isActive" = true
  ORDER BY "createdAt" ASC
  LIMIT 1
);
