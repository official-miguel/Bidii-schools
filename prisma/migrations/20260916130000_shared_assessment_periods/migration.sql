-- DropForeignKey
ALTER TABLE "AssessmentPeriod" DROP CONSTRAINT "AssessmentPeriod_frameworkId_fkey";

-- DropIndex
DROP INDEX "AssessmentPeriod_schoolId_frameworkId_idx";

-- DropIndex
DROP INDEX "AssessmentPeriod_schoolId_frameworkId_name_academicYear_key";

-- AlterTable
ALTER TABLE "AssessmentPeriod" DROP COLUMN "frameworkId";

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentPeriod_schoolId_name_academicYear_key" ON "AssessmentPeriod"("schoolId", "name", "academicYear");

