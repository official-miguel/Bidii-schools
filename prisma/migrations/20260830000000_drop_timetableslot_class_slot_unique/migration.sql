-- Migration: drop_timetableslot_class_slot_unique
--
-- Problem
-- ───────
-- TimetableSlot still has a unique constraint "class_slot" on
-- (classId, dayOfWeek, period). When publishing a timetable that contains
-- elective-group slots — where a class legitimately has multiple subjects
-- scheduled in the same period (one row per subject) — the INSERT in the
-- publish route hits this constraint and returns a 500 error.
--
-- The parallel constraint on TimetableVersionSlot was already removed by
-- migration 99999999999999_remove_class_slot_unique_constraint. This migration
-- applies the same fix to the live-slot table.
--
-- Fix
-- ───
-- Drop the unique index. A regular (non-unique) index on the same columns is
-- kept for query performance. The teacher_class_slot unique index
-- (classId, teacherId, dayOfWeek, period) still prevents a teacher being
-- double-booked for the same class at the same time.
--
-- Data safety
-- ───────────
-- Dropping a unique constraint never violates existing data — it only
-- relaxes the restriction. No backfill is required.

-- Drop the unique constraint
DROP INDEX IF EXISTS "class_slot";

-- Keep a plain index for query performance (school-wide timetable lookups)
CREATE INDEX IF NOT EXISTS "TimetableSlot_classId_dayOfWeek_period_idx"
  ON "TimetableSlot" ("classId", "dayOfWeek", "period");
