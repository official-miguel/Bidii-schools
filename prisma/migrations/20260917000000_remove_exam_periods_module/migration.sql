-- Remove the legacy EXAM_PERIODS value from the Module enum.
-- Postgres has no ALTER TYPE ... DROP VALUE, so we rebuild the enum:
-- rename the old type, create the new one without EXAM_PERIODS, repoint the
-- RolePermission.module column at it, then drop the old type.
--
-- Any RolePermission rows still on EXAM_PERIODS were already migrated away
-- (their access was a pure duplicate of an existing ASSESSMENTS row) before
-- this migration was written, so no data rewrite is needed here.

ALTER TYPE "Module" RENAME TO "Module_old";

CREATE TYPE "Module" AS ENUM (
  'DEPARTMENTS',
  'SUBJECTS',
  'STAFF',
  'STAFF_ROLES',
  'CLASSES',
  'STUDENTS',
  'TIMETABLE',
  'RESULTS',
  'TOD',
  'COMMUNICATION',
  'CALENDAR',
  'AI_TOOLS',
  'REPORTS',
  'RECORDS',
  'RECORDS_DISCIPLINE',
  'RECORDS_ACHIEVEMENTS',
  'ANALYTICS',
  'ASSESSMENTS',
  'ASSESSMENT_FRAMEWORK',
  'LIBRARY',
  'HISTORY',
  'ACCOMMODATION',
  'ATTENDANCE',
  'FEES',
  'DIARY'
);

ALTER TABLE "RolePermission"
  ALTER COLUMN "module" TYPE "Module" USING ("module"::text::"Module");

ALTER TABLE "PermissionAuditLog"
  ALTER COLUMN "module" TYPE "Module" USING ("module"::text::"Module");

DROP TYPE "Module_old";
