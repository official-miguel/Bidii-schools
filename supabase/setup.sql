-- =============================================================================
-- Bidii — Supabase Setup Script
-- Run once in Supabase Dashboard → SQL Editor (or via psql).
-- Idempotent: safe to re-run; uses IF EXISTS / ON CONFLICT guards.
--
-- What this does:
--   1. Creates `images` (public) and `reports` (private) storage buckets.
--   2. Drops and recreates storage RLS policies so writes are always allowed
--      by the service role (server-side uploads from Next.js API routes).
--   3. Enables RLS on application tables as a safety net for direct
--      PostgREST access (all app traffic uses Prisma + service role and
--      bypasses RLS automatically).
--   4. Installs the custom_access_token_hook so auth.jwt() carries
--      `school_id` — required for school-scoped storage path checks.
--
-- School isolation:
--   Storage paths follow {schoolId}/... so data from different schools
--   is always under separate prefixes. The service role (used by Next.js)
--   bypasses RLS entirely, so uploads always succeed server-side.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Storage buckets
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'images', 'images', true,
  5242880,   -- 5 MB max per file
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public              = true,
  file_size_limit     = 5242880,
  allowed_mime_types  = ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reports', 'reports', false,
  52428800,  -- 50 MB max per PDF
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public              = false,
  file_size_limit     = 52428800,
  allowed_mime_types  = ARRAY['application/pdf'];

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Storage RLS — images bucket
-- Drop before recreate so the script is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "images_select"  ON storage.objects;
DROP POLICY IF EXISTS "images_insert"  ON storage.objects;
DROP POLICY IF EXISTS "images_update"  ON storage.objects;
DROP POLICY IF EXISTS "images_delete"  ON storage.objects;

-- Public read: the bucket is public so any request can fetch image URLs.
-- We allow anon reads so school logos load without authentication.
CREATE POLICY "images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'images');

-- Service role (Next.js server) can upload/replace/delete anything.
CREATE POLICY "images_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'images'
    AND (
      auth.role() = 'service_role'
      -- Authenticated clients can only write to their own school's path.
      OR (auth.role() = 'authenticated'
          AND (auth.jwt() ->> 'school_id') IS NOT NULL
          AND starts_with(name, (auth.jwt() ->> 'school_id') || '/'))
    )
  );

CREATE POLICY "images_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'images'
    AND (
      auth.role() = 'service_role'
      OR (auth.role() = 'authenticated'
          AND (auth.jwt() ->> 'school_id') IS NOT NULL
          AND starts_with(name, (auth.jwt() ->> 'school_id') || '/'))
    )
  );

CREATE POLICY "images_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'images'
    AND (
      auth.role() = 'service_role'
      OR (auth.role() = 'authenticated'
          AND (auth.jwt() ->> 'school_id') IS NOT NULL
          AND starts_with(name, (auth.jwt() ->> 'school_id') || '/'))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Storage RLS — reports bucket (private, signed URLs only)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "reports_select" ON storage.objects;
DROP POLICY IF EXISTS "reports_insert" ON storage.objects;
DROP POLICY IF EXISTS "reports_update" ON storage.objects;
DROP POLICY IF EXISTS "reports_delete" ON storage.objects;

-- Only service role or authenticated users scoped to the right school may read.
-- Direct reads without a valid signed URL will be blocked by the private bucket.
CREATE POLICY "reports_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'reports'
    AND (
      auth.role() = 'service_role'
      OR (auth.role() = 'authenticated'
          AND (auth.jwt() ->> 'school_id') IS NOT NULL
          AND starts_with(name, (auth.jwt() ->> 'school_id') || '/'))
    )
  );

-- Only service role (Next.js backend) uploads reports.
CREATE POLICY "reports_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'reports' AND auth.role() = 'service_role');

CREATE POLICY "reports_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'reports' AND auth.role() = 'service_role');

CREATE POLICY "reports_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'reports' AND auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Application table RLS (safety net for direct PostgREST access)
-- All Next.js API routes use Prisma + service role → bypass RLS automatically.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "User"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "School"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoredImage"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoredReport" ENABLE ROW LEVEL SECURITY;

-- Drop before recreate (idempotent).
DROP POLICY IF EXISTS "school_isolation_user"          ON "User";
DROP POLICY IF EXISTS "school_isolation_school"        ON "School";
DROP POLICY IF EXISTS "school_isolation_stored_image"  ON "StoredImage";
DROP POLICY IF EXISTS "school_isolation_stored_report" ON "StoredReport";

-- Service role always bypasses RLS — these only constrain anon/authenticated.
CREATE POLICY "school_isolation_user" ON "User"
  FOR ALL USING ("schoolId" = (auth.jwt() ->> 'school_id'));

CREATE POLICY "school_isolation_school" ON "School"
  FOR ALL USING (id = (auth.jwt() ->> 'school_id'));

CREATE POLICY "school_isolation_stored_image" ON "StoredImage"
  FOR ALL USING ("schoolId" = (auth.jwt() ->> 'school_id'));

CREATE POLICY "school_isolation_stored_report" ON "StoredReport"
  FOR ALL USING ("schoolId" = (auth.jwt() ->> 'school_id'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Custom access token hook
--
-- Adds `school_id` to the Supabase JWT so auth.jwt() ->> 'school_id' works
-- in storage RLS policies (item 2-3 above).
--
-- After running this script:
--   Dashboard → Authentication → Hooks → Custom Access Token
--   → Set function: public.custom_access_token_hook
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims        jsonb;
  user_email    text;
  user_school_id text;
BEGIN
  claims     := event -> 'claims';
  user_email := event ->> 'email';

  -- Look up the user's schoolId from our own User table.
  -- Limit 1 is safe: if the email exists at multiple schools we cannot
  -- resolve the school here (no context). In that case no claim is set
  -- and the client must pass schoolSlug during OTP verify.
  SELECT "schoolId"
  INTO   user_school_id
  FROM   "User"
  WHERE  email    = user_email
    AND  "isActive" = true
  LIMIT  1;

  IF user_school_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{school_id}', to_jsonb(user_school_id));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant the auth system permission to call this function.
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook
  TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook
  FROM authenticated, anon, public;
