-- Migration: drop_teacher_load_week_fields
--
-- Per-week lesson constraints (minLessonsPerWeek, maxLessonsPerWeek) on
-- TeacherLoadRequirement are removed. The timetable engine only enforces
-- per-day limits; the week columns were never consumed by the solver or
-- any business logic. Only minLessonsPerDay / maxLessonsPerDay remain.

ALTER TABLE "TeacherLoadRequirement"
  DROP COLUMN IF EXISTS "minLessonsPerWeek",
  DROP COLUMN IF EXISTS "maxLessonsPerWeek";
