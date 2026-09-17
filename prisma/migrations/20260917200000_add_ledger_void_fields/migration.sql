-- Reversal support for the Fees & Ledger module.
--
-- LedgerEntry.isVoided already existed but nothing could ever set it. These
-- columns record when and why a reversal happened; the acting user is written
-- to AuditLog as FINANCE_LEDGER_VOIDED.
ALTER TABLE "LedgerEntry" ADD COLUMN "voidedAt"   TIMESTAMP(3);
ALTER TABLE "LedgerEntry" ADD COLUMN "voidReason" TEXT;

-- Payment mirrors the flag so reports that read Payment directly (the
-- payment-volume report) never count a reversed payment.
ALTER TABLE "Payment" ADD COLUMN "isVoided" BOOLEAN NOT NULL DEFAULT false;

-- Supports the payment-volume report's (schoolId, paidAt) range scan now that
-- it also filters on isVoided.
CREATE INDEX "Payment_schoolId_isVoided_paidAt_idx"
  ON "Payment" ("schoolId", "isVoided", "paidAt");
