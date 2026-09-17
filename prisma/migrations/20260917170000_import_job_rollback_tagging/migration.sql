-- True import rollback.
--
-- Every model the import processor can CREATE gets a nullable "importJobId"
-- pointing at the ImportJob that produced the row, so a rollback deletes
-- exactly those rows and nothing else. ON DELETE SET NULL: purging an old job
-- must never cascade into real school data.
--
-- ImportJob."changeLog" holds the previous values of rows the importer UPDATED
-- rather than created, so a rollback can restore them.

ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "changeLog" JSONB;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Department', 'SchoolClass', 'Subject', 'Teacher', 'TeacherSubject',
    'Student', 'StudentElective', 'Dormitory', 'Cubicle', 'Bed',
    'SleepingPosition', 'AllocationRecord'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "importJobId" TEXT', t);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I ("importJobId")',
      t || '_importJobId_idx', t
    );

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = t || '_importJobId_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("importJobId")
           REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE',
        t, t || '_importJobId_fkey'
      );
    END IF;
  END LOOP;
END $$;
