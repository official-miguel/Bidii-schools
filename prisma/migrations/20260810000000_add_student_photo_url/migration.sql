-- Add optional photo URL to the Student table
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
