-- Migration: add_teacher_load_requirement
--
-- Creates the TeacherLoadRequirement table, which stores per-teacher lesson
-- load constraints (min/max lessons per day and per week) used by the
-- timetable generator. One row per teacher — upserted on save via the
-- /api/timetable/teacher-requirements API route.
--
-- The table was present in schema.prisma but was never created in a migration,
-- causing the GET /api/timetable/teacher-requirements endpoint to throw a 500.

CREATE TABLE IF NOT EXISTS "TeacherLoadRequirement" (
  "id"                TEXT        NOT NULL,
  "schoolId"          TEXT        NOT NULL,
  "teacherId"         TEXT        NOT NULL,
  "minLessonsPerWeek" INTEGER,
  "maxLessonsPerWeek" INTEGER,
  "minLessonsPerDay"  INTEGER,
  "maxLessonsPerDay"  INTEGER,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeacherLoadRequirement_pkey" PRIMARY KEY ("id")
);

-- One row per teacher
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherLoadRequirement_teacherId_key"
  ON "TeacherLoadRequirement" ("teacherId");

-- Fast lookup by school (used in bulk queries)
CREATE INDEX IF NOT EXISTS "TeacherLoadRequirement_schoolId_idx"
  ON "TeacherLoadRequirement" ("schoolId");

-- Foreign keys
ALTER TABLE "TeacherLoadRequirement"
  ADD CONSTRAINT "TeacherLoadRequirement_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeacherLoadRequirement"
  ADD CONSTRAINT "TeacherLoadRequirement_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
