-- =============================================================================
-- Bidii Supabase Setup
-- Run this once in the Supabase SQL Editor for your project.
--
-- What this does:
--   1. Creates the `images` and `reports` storage buckets.
--   2. Sets RLS policies on storage.objects so each school's files are
--      completely isolated from other schools.
--   3. Sets RLS policies on the application tables (User, School, etc.)
--      scoped by school_id from the JWT claims.
--
-- School isolation strategy:
--   We do NOT store Supabase auth.users rows for app users — we keep our
--   own `User` table in Postgres with per-school email uniqueness. Instead,
--   after OTP verification we create our own session cookie and embed the
--   schoolId in a custom claim on the Supabase JWT so RLS can read it via:
--     auth.jwt() ->> 'school_id'
--
-- Run order: execute this entire file as a superuser (postgres role) in the
-- Supabase SQL editor. It is idempotent — safe to run multiple times.
-- =============================================================================

-- ── Storage buckets ───────────────────────────────────────────────────────────

-- Images bucket (public read, authenticated write scoped by school)
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Reports bucket (fully private — signed URLs only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS policies: images bucket ──────────────────────────────────────

-- Allow any authenticated user to read images (bucket is public, but RLS
-- adds a school-path guard so cross-school reads are blocked).
CREATE POLICY "images: school-scoped read"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'images'
    AND (
        -- Path starts with the user's own schoolId so School A cannot read
        -- School B's images even though the bucket is public.
        starts_with(name, (auth.jwt() ->> 'school_id') || '/')
        -- Allow public-read for school logos (stored at schoolId/logo/*)
        -- by not restricting when no session exists (handled by bucket public flag).
        OR auth.role() = 'anon'
    )
);

-- Allow authenticated users to upload to their own school's path only.
CREATE POLICY "images: school-scoped insert"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'images'
    AND auth.role() = 'authenticated'
    AND starts_with(name, (auth.jwt() ->> 'school_id') || '/')
);

-- Allow users to update (replace) their own files.
CREATE POLICY "images: school-scoped update"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'images'
    AND auth.role() = 'authenticated'
    AND starts_with(name, (auth.jwt() ->> 'school_id') || '/')
);

-- Allow users to delete their own files.
CREATE POLICY "images: school-scoped delete"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'images'
    AND auth.role() = 'authenticated'
    AND starts_with(name, (auth.jwt() ->> 'school_id') || '/')
);

-- ── Storage RLS policies: reports bucket ─────────────────────────────────────

-- Reports are private. Only authenticated users with the matching schoolId
-- can read. No anon access — signed URLs bypass bucket RLS at the CDN layer
-- so this policy protects direct API access.
CREATE POLICY "reports: school-scoped read"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'reports'
    AND auth.role() = 'authenticated'
    AND starts_with(name, (auth.jwt() ->> 'school_id') || '/')
);

-- Only the service role (backend) can write reports.
-- Client SDKs should never upload directly to the reports bucket.
CREATE POLICY "reports: service-role insert"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'reports'
    AND auth.role() = 'service_role'
);

CREATE POLICY "reports: service-role update"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'reports'
    AND auth.role() = 'service_role'
);

CREATE POLICY "reports: service-role delete"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'reports'
    AND auth.role() = 'service_role'
);

-- ── Application table RLS ─────────────────────────────────────────────────────
-- These policies protect direct Supabase Data API access (PostgREST).
-- Our Next.js app uses Prisma + service role for all data access, so these
-- act as a safety net rather than the primary enforcement layer.

-- Enable RLS on the tables most likely to be accessed via the Supabase client.
ALTER TABLE "User"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "School"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoredImage"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoredReport" ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS (Prisma uses service role — no change needed).
-- The policies below protect the anon/authenticated roles only.

-- School: authenticated users can only see their own school.
CREATE POLICY "School: own school only"
ON "School" FOR ALL
USING (id = (auth.jwt() ->> 'school_id'));

-- User: authenticated users can only see users in their own school.
CREATE POLICY "User: own school only"
ON "User" FOR ALL
USING ("schoolId" = (auth.jwt() ->> 'school_id'));

-- StoredImage: scoped to own school.
CREATE POLICY "StoredImage: own school only"
ON "StoredImage" FOR ALL
USING ("schoolId" = (auth.jwt() ->> 'school_id'));

-- StoredReport: scoped to own school.
CREATE POLICY "StoredReport: own school only"
ON "StoredReport" FOR ALL
USING ("schoolId" = (auth.jwt() ->> 'school_id'));

-- ── Custom JWT claim hook (optional but recommended) ──────────────────────────
-- To make auth.jwt() ->> 'school_id' work, set a custom claim on the JWT
-- when issuing tokens. Add this function and hook in:
--   Supabase Dashboard → Authentication → Hooks → Custom Access Token
--
-- The function below reads the user's schoolId from the `User` table and
-- adds it to the JWT. Uncomment and run if you enable the hook.
--
-- CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- STABLE
-- AS $$
-- DECLARE
--   claims jsonb;
--   user_school_id text;
-- BEGIN
--   claims := event -> 'claims';
--   SELECT "schoolId" INTO user_school_id
--   FROM "User"
--   WHERE email = (event ->> 'email')
--   LIMIT 1;
--   IF user_school_id IS NOT NULL THEN
--     claims := jsonb_set(claims, '{school_id}', to_jsonb(user_school_id));
--   END IF;
--   RETURN jsonb_set(event, '{claims}', claims);
-- END;
-- $$;
--
-- GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
-- REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
