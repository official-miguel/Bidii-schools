-- Migration: 20260907000000_perf_indexes
-- Performance indexes identified during the September 2026 audit.
-- All statements use IF NOT EXISTS so they are safe to re-run.

-- ── SleepingPosition ─────────────────────────────────────────────────────────
-- auto-allocate free-position lookup:
--   WHERE dormId = ? AND isOccupied = false (AND schoolId = ?)
-- The existing (dormId) index helps but does not cover isOccupied.
-- This composite lets Postgres satisfy the full filter from index alone.
CREATE INDEX IF NOT EXISTS "SleepingPosition_dormId_isOccupied_idx"
  ON "SleepingPosition"("dormId", "isOccupied");

CREATE INDEX IF NOT EXISTS "SleepingPosition_schoolId_dormId_isOccupied_idx"
  ON "SleepingPosition"("schoolId", "dormId", "isOccupied");

-- ── AllocationRecord ─────────────────────────────────────────────────────────
-- dorm-management bulk ops (MAINTENANCE_CLOSE / BULK_REMOVE / EMERGENCY_RELOCATION):
--   WHERE schoolId = ? AND dormId = ? AND status = 'CURRENT'
-- The existing (dormId, status) index doesn't include schoolId.
-- RLS also filters on schoolId, so leading it keeps RLS fast.
CREATE INDEX IF NOT EXISTS "AllocationRecord_schoolId_dormId_status_idx"
  ON "AllocationRecord"("schoolId", "dormId", "status");

-- ── LedgerEntry ──────────────────────────────────────────────────────────────
-- aging report groupBy: WHERE schoolId = ? AND studentId IN (...) AND entryType = 'INVOICE' AND isVoided = false
-- This composite covers all four filter columns in one index scan.
CREATE INDEX IF NOT EXISTS "LedgerEntry_schoolId_studentId_entryType_isVoided_idx"
  ON "LedgerEntry"("schoolId", "studentId", "entryType", "isVoided");

-- Separate index for the common "all entries for a student" pattern used by
-- the balance sheet and statement routes.
CREATE INDEX IF NOT EXISTS "LedgerEntry_schoolId_studentId_postedAt_desc_idx"
  ON "LedgerEntry"("schoolId", "studentId", "postedAt" DESC);

-- ── Student admissionNumber lookup ───────────────────────────────────────────
-- C2B webhook exact-match: WHERE schoolId = ? AND admissionNumber = ? AND archivedAt IS NULL
-- The existing (schoolId, admissionNumber) index doesn't include archivedAt.
CREATE INDEX IF NOT EXISTS "Student_schoolId_admissionNumber_archivedAt_idx"
  ON "Student"("schoolId", "admissionNumber", "archivedAt");
