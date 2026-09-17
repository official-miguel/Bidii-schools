-- Track when a parent last opened /parent/messages, to compute an unread badge.
ALTER TABLE "Parent" ADD COLUMN "messagesLastReadAt" TIMESTAMP(3);

-- Track when a results SMS/WhatsApp batch for a period completed, to gate
-- the parent-facing Results Analysis tile.
ALTER TABLE "AssessmentPeriod" ADD COLUMN "resultsSmsSentAt" TIMESTAMP(3);
