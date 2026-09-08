-- Migration: add_stk_push_support
-- Adds:
--   1. StkPushStatus enum
--   2. StkPushRequest model (tracks parent-initiated Daraja STK Push requests)
--   3. stkCallbackToken column on School (stable UUID for Daraja callback URL)

-- 1. StkPushStatus enum
CREATE TYPE "StkPushStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- 2. StkPushRequest table
CREATE TABLE "StkPushRequest" (
    "id"                 TEXT NOT NULL,
    "schoolId"           TEXT NOT NULL,
    "studentId"          TEXT NOT NULL,
    "parentId"           TEXT NOT NULL,
    "checkoutRequestId"  TEXT NOT NULL,
    "merchantRequestId"  TEXT NOT NULL,
    "amount"             INTEGER NOT NULL,
    "phone"              TEXT NOT NULL,
    "status"             "StkPushStatus" NOT NULL DEFAULT 'PENDING',
    "mpesaReceiptNumber" TEXT,
    "failureReason"      TEXT,
    "completedAt"        TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StkPushRequest_pkey" PRIMARY KEY ("id")
);

-- Unique index on checkoutRequestId (Daraja guarantee — one callback per request)
CREATE UNIQUE INDEX "StkPushRequest_checkoutRequestId_key"
    ON "StkPushRequest"("checkoutRequestId");

-- Indexes for query patterns used in the callback handler and admin views
CREATE INDEX "StkPushRequest_schoolId_status_idx"
    ON "StkPushRequest"("schoolId", "status");

CREATE INDEX "StkPushRequest_schoolId_studentId_idx"
    ON "StkPushRequest"("schoolId", "studentId");

-- Foreign keys
ALTER TABLE "StkPushRequest"
    ADD CONSTRAINT "StkPushRequest_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StkPushRequest"
    ADD CONSTRAINT "StkPushRequest_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. stkCallbackToken on School
ALTER TABLE "School"
    ADD COLUMN "stkCallbackToken" TEXT;

-- Generate a unique token for each existing school row
UPDATE "School"
    SET "stkCallbackToken" = gen_random_uuid()::text
    WHERE "stkCallbackToken" IS NULL;

-- Unique index (callback URL token must be globally unique)
CREATE UNIQUE INDEX "School_stkCallbackToken_key"
    ON "School"("stkCallbackToken");
