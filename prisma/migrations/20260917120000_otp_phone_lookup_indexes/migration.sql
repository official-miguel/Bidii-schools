-- Phone-based lookups in src/lib/identity.ts (used by login and the
-- forgot-password OTP request/verify flow) filter Teacher/Parent by phone,
-- with or without a schoolId in the WHERE clause. Neither table had an
-- index that covered the phone-only case, so every such lookup was a full
-- table scan — the biggest single cause of OTP/login latency as these
-- tables grow.

-- Teacher: no index touched `phone` at all.
CREATE INDEX IF NOT EXISTS "Teacher_schoolId_phone_idx" ON "Teacher"("schoolId", "phone");
CREATE INDEX IF NOT EXISTS "Teacher_phone_idx" ON "Teacher"("phone");

-- Parent: the existing unique index is (schoolId, phone) — schoolId leads,
-- so a phone-only WHERE (the no-slug identify path) can't use it efficiently.
CREATE INDEX IF NOT EXISTS "Parent_phone_idx" ON "Parent"("phone");
