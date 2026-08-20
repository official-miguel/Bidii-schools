-- Migration: add_performance_indexes
-- Adds 7 composite indexes for pilot-readiness performance hardening.
-- All statements use IF NOT EXISTS — safe to re-apply.
-- Contains only CREATE INDEX statements: no DROP, ALTER TABLE, or DML.

-- Requirements: 9.1
-- Speeds up attendance queries filtered by school + date + status
-- (e.g. dashboard "today's absences" widget).
CREATE INDEX IF NOT EXISTS "Attendance_schoolId_date_status_idx"
  ON "Attendance"("schoolId", "date", "status");

-- Requirements: 9.2
-- Speeds up attendance queries filtered by school + class + date
-- (e.g. class-level attendance register).
CREATE INDEX IF NOT EXISTS "Attendance_schoolId_classId_date_idx"
  ON "Attendance"("schoolId", "classId", "date");

-- Requirements: 9.3
-- Speeds up student history queries filtered by school + class + archival date
-- (e.g. history module listing graduated/transferred students by class).
CREATE INDEX IF NOT EXISTS "Student_schoolId_classId_archivedAt_idx"
  ON "Student"("schoolId", "classId", "archivedAt");

-- Requirements: 9.4
-- Speeds up library return queries filtered by school + returnedAt
-- (e.g. "currently borrowed" list: WHERE returnedAt IS NULL).
CREATE INDEX IF NOT EXISTS "LibraryBorrow_schoolId_returnedAt_idx"
  ON "LibraryBorrow"("schoolId", "returnedAt");

-- Requirements: 9.5
-- Speeds up overdue library queries filtered by school + returnedAt + dueAt
-- (e.g. overdue books dashboard: WHERE returnedAt IS NULL AND dueAt < NOW()).
CREATE INDEX IF NOT EXISTS "LibraryBorrow_schoolId_returnedAt_dueAt_idx"
  ON "LibraryBorrow"("schoolId", "returnedAt", "dueAt");

-- Requirements: 9.6
-- Speeds up discipline record queries filtered by school + status
-- (e.g. "open cases" list: WHERE status = 'OPEN').
CREATE INDEX IF NOT EXISTS "DisciplineRecord_schoolId_status_idx"
  ON "DisciplineRecord"("schoolId", "status");

-- Requirements: 9.7
-- Speeds up marksheet and department analytics queries filtered by
-- school + assessment period + subject.
CREATE INDEX IF NOT EXISTS "AssessmentItem_schoolId_periodId_subjectId_idx"
  ON "AssessmentItem"("schoolId", "periodId", "subjectId");
