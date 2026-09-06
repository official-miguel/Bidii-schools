-- CreateTable: CbeGradingScale
-- Stores the per-school (or government-default) CBE grading band table.
-- Rows with schoolId = NULL are the immutable government default.
-- Rows with schoolId set are school-specific custom scales.

CREATE TABLE "CbeGradingScale" (
    "id"               TEXT        NOT NULL,
    "schoolId"         TEXT,
    "bandName"         TEXT        NOT NULL,
    "achievementLevel" INTEGER     NOT NULL,
    "minPercentage"    DOUBLE PRECISION NOT NULL,
    "maxPercentage"    DOUBLE PRECISION NOT NULL,
    "points"           INTEGER     NOT NULL,
    "description"      TEXT        NOT NULL DEFAULT '',
    "isActive"         BOOLEAN     NOT NULL DEFAULT true,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CbeGradingScale_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: schoolId → School (nullable, cascade on delete)
ALTER TABLE "CbeGradingScale"
    ADD CONSTRAINT "CbeGradingScale_schoolId_fkey"
    FOREIGN KEY ("schoolId")
    REFERENCES "School"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CbeGradingScale_schoolId_isActive_idx"   ON "CbeGradingScale"("schoolId", "isActive");
CREATE INDEX "CbeGradingScale_schoolId_bandName_isActive_idx" ON "CbeGradingScale"("schoolId", "bandName", "isActive");

-- -------------------------------------------------------------------------
-- Seed: Government Default scale
-- These rows exactly mirror the GRADE_BANDS constant in grading844.ts so
-- that existing grading outcomes are unchanged after this migration.
--
-- GRADE_BANDS (from grading844.ts, highest → lowest):
--   [75, 'A',  12]  → minPct=75, maxPct=100
--   [70, 'A-', 11]  → minPct=70, maxPct=74.99
--   [65, 'B+', 10]  → minPct=65, maxPct=69.99
--   [60, 'B',   9]  → minPct=60, maxPct=64.99
--   [55, 'B-',  8]  → minPct=55, maxPct=59.99
--   [50, 'C+',  7]  → minPct=50, maxPct=54.99
--   [45, 'C',   6]  → minPct=45, maxPct=49.99
--   [40, 'C-',  5]  → minPct=40, maxPct=44.99
--   [35, 'D+',  4]  → minPct=35, maxPct=39.99
--   [30, 'D',   3]  → minPct=30, maxPct=34.99
--   [25, 'D-',  2]  → minPct=25, maxPct=29.99
--   [ 0, 'E',   1]  → minPct=0,  maxPct=24.99
--
-- schoolId IS NULL means government default.
-- updatedAt is set at seed time; will update on any future migration.
-- -------------------------------------------------------------------------

INSERT INTO "CbeGradingScale" (
    "id", "schoolId", "bandName", "achievementLevel",
    "minPercentage", "maxPercentage", "points",
    "description", "isActive", "createdAt", "updatedAt"
)
VALUES
    ('govt_cbe_A',    NULL, 'A',    12, 75, 100,   12, 'Excellent',        true, NOW(), NOW()),
    ('govt_cbe_Aminus', NULL, 'A-', 11, 70, 74.99, 11, 'Very Good',        true, NOW(), NOW()),
    ('govt_cbe_Bplus',  NULL, 'B+', 10, 65, 69.99, 10, 'Good Plus',        true, NOW(), NOW()),
    ('govt_cbe_B',    NULL, 'B',     9, 60, 64.99,  9, 'Good',             true, NOW(), NOW()),
    ('govt_cbe_Bminus', NULL, 'B-',  8, 55, 59.99,  8, 'Above Average',    true, NOW(), NOW()),
    ('govt_cbe_Cplus',  NULL, 'C+',  7, 50, 54.99,  7, 'Average Plus',     true, NOW(), NOW()),
    ('govt_cbe_C',    NULL, 'C',     6, 45, 49.99,  6, 'Average',          true, NOW(), NOW()),
    ('govt_cbe_Cminus', NULL, 'C-',  5, 40, 44.99,  5, 'Below Average',    true, NOW(), NOW()),
    ('govt_cbe_Dplus',  NULL, 'D+',  4, 35, 39.99,  4, 'Below Average',    true, NOW(), NOW()),
    ('govt_cbe_D',    NULL, 'D',     3, 30, 34.99,  3, 'Pass',             true, NOW(), NOW()),
    ('govt_cbe_Dminus', NULL, 'D-',  2, 25, 29.99,  2, 'Bare Pass',        true, NOW(), NOW()),
    ('govt_cbe_E',    NULL, 'E',     1,  0, 24.99,  1, 'Fail',             true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
