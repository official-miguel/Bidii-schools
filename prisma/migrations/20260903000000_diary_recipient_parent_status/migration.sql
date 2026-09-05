-- Add parentStatus and parentCompletedAt to DiaryRecipient
-- These track the parent's "Mark done" action separately from the legacy teacher-side status.

ALTER TABLE "DiaryRecipient"
  ADD COLUMN "parentStatus"      "DiaryRecipientStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "parentCompletedAt" TIMESTAMP(3);

-- Replace the (studentId, status) index with (studentId, parentStatus) for the teacher view query
DROP INDEX IF EXISTS "DiaryRecipient_studentId_status_idx";
CREATE INDEX "DiaryRecipient_studentId_parentStatus_idx" ON "DiaryRecipient"("studentId", "parentStatus");
