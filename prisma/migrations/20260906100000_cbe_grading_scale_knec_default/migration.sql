-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Replace KCSE 12-band government default with real KNEC CBE scale
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Context:
--   The previous migration (20260906000000_cbe_grading_scale) seeded the
--   government-default scale (schoolId IS NULL) using the 8-4-4 / KCSE letter-
--   grade table from grading844.ts (A, A-, B+, … E — 12 bands).  That is
--   correct for 8-4-4 reports but is NOT the right default for the CBE pathway.
--
--   The real government CBE grading scale is the KNEC Achievement Level (AL)
--   rubric that uses EE/ME/AE/BE categories with numeric sub-bands:
--       EE1 (AL 8) · EE2 (AL 7) · ME1 (AL 6) · ME2 (AL 5)
--       AE1 (AL 4) · AE2 (AL 3) · BE1 (AL 2) · BE2 (AL 1)
--
-- What this migration does:
--   1. Hard-deletes the 12 old KCSE default rows (govt_cbe_A … govt_cbe_E).
--      These rows have fixed IDs so the DELETE is idempotent.
--   2. Inserts the 8 correct KNEC rows (all schoolId IS NULL, isActive = true).
--      Uses ON CONFLICT DO NOTHING so re-running the migration is safe.
--
-- No school-specific custom rows (schoolId NOT NULL) are touched.
-- The 8-4-4 grading844.ts / scoreToGrade() function is completely unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Remove the 12 incorrect KCSE default rows.
DELETE FROM "CbeGradingScale"
WHERE "id" IN (
    'govt_cbe_A',
    'govt_cbe_Aminus',
    'govt_cbe_Bplus',
    'govt_cbe_B',
    'govt_cbe_Bminus',
    'govt_cbe_Cplus',
    'govt_cbe_C',
    'govt_cbe_Cminus',
    'govt_cbe_Dplus',
    'govt_cbe_D',
    'govt_cbe_Dminus',
    'govt_cbe_E'
);

-- Step 2: Insert the 8 correct KNEC CBE Achievement Level default rows.
--
-- Boundaries (inclusive on both ends for display; lookup uses minPercentage
-- floor semantics — see resolveCbeGrade() in gradingScale.ts):
--
--   EE1: 90–100 %   AL 8   8 pts   Exceptional
--   EE2: 75–89  %   AL 7   7 pts   Very Good
--   ME1: 58–74  %   AL 6   6 pts   Good
--   ME2: 41–57  %   AL 5   5 pts   Fair
--   AE1: 31–40  %   AL 4   4 pts   Needs Improvement
--   AE2: 21–30  %   AL 3   3 pts   Below Average
--   BE1: 11–20  %   AL 2   2 pts   Well Below Average
--   BE2:  0–10  %   AL 1   1 pt    Minimal

INSERT INTO "CbeGradingScale" (
    "id", "schoolId", "bandName", "achievementLevel",
    "minPercentage", "maxPercentage", "points",
    "description", "isActive", "createdAt", "updatedAt"
)
VALUES
    ('govt_knec_EE1', NULL, 'EE1', 8, 90,  100, 8, 'Exceptional',        true, NOW(), NOW()),
    ('govt_knec_EE2', NULL, 'EE2', 7, 75,   89, 7, 'Very Good',          true, NOW(), NOW()),
    ('govt_knec_ME1', NULL, 'ME1', 6, 58,   74, 6, 'Good',               true, NOW(), NOW()),
    ('govt_knec_ME2', NULL, 'ME2', 5, 41,   57, 5, 'Fair',               true, NOW(), NOW()),
    ('govt_knec_AE1', NULL, 'AE1', 4, 31,   40, 4, 'Needs Improvement',  true, NOW(), NOW()),
    ('govt_knec_AE2', NULL, 'AE2', 3, 21,   30, 3, 'Below Average',      true, NOW(), NOW()),
    ('govt_knec_BE1', NULL, 'BE1', 2, 11,   20, 2, 'Well Below Average', true, NOW(), NOW()),
    ('govt_knec_BE2', NULL, 'BE2', 1,  0,   10, 1, 'Minimal',            true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
