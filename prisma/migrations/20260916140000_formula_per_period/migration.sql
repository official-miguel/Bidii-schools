-- Department formulas move from being scoped to an assessment framework to
-- being scoped to an exam period, so each exam period keeps its own formulas
-- and a period that has never been configured starts empty.
--
-- There is no meaningful mapping from a framework to a period (a framework
-- spans many periods), so existing rows are discarded rather than guessed at.

DELETE FROM "DepartmentFormulaConfig";

DROP INDEX IF EXISTS "DepartmentFormulaConfig_departmentId_subjectId_form_framewo_key";
DROP INDEX IF EXISTS "DepartmentFormulaConfig_subjectId_form_frameworkId_idx";

ALTER TABLE "DepartmentFormulaConfig" DROP COLUMN "frameworkId";
ALTER TABLE "DepartmentFormulaConfig" ADD COLUMN "periodId" TEXT NOT NULL;

ALTER TABLE "DepartmentFormulaConfig"
  ADD CONSTRAINT "DepartmentFormulaConfig_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "AssessmentPeriod"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "DepartmentFormulaConfig_departmentId_subjectId_form_periodId_key"
  ON "DepartmentFormulaConfig"("departmentId", "subjectId", "form", "periodId");
CREATE INDEX "DepartmentFormulaConfig_subjectId_form_periodId_idx"
  ON "DepartmentFormulaConfig"("subjectId", "form", "periodId");
CREATE INDEX "DepartmentFormulaConfig_periodId_idx"
  ON "DepartmentFormulaConfig"("periodId");
