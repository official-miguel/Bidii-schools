-- CreateEnum
CREATE TYPE "SmsTransactionType" AS ENUM ('TOPUP', 'DEDUCTION', 'ADJUSTMENT');

-- CreateTable: PlatformSmsConfig
CREATE TABLE "PlatformSmsConfig" (
    "id"             TEXT NOT NULL,
    "provider"       TEXT NOT NULL DEFAULT 'AFRICAS_TALKING',
    "encryptedValue" TEXT NOT NULL,
    "keyPreview"     TEXT NOT NULL,
    "metadata"       JSONB,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSmsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SchoolSmsWallet
CREATE TABLE "SchoolSmsWallet" (
    "schoolId"               TEXT NOT NULL,
    "unitsRemaining"         INTEGER NOT NULL DEFAULT 0,
    "unitsLifetimeAllocated" INTEGER NOT NULL DEFAULT 0,
    "lowBalanceThreshold"    INTEGER NOT NULL DEFAULT 50,
    "updatedAt"              TIMESTAMP(3) NOT NULL,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolSmsWallet_pkey" PRIMARY KEY ("schoolId")
);

-- CreateTable: SmsWalletTransaction
CREATE TABLE "SmsWalletTransaction" (
    "id"                TEXT NOT NULL,
    "schoolId"          TEXT NOT NULL,
    "type"              "SmsTransactionType" NOT NULL,
    "units"             INTEGER NOT NULL,
    "reason"            TEXT NOT NULL,
    "reference"         TEXT,
    "balanceAfter"      INTEGER NOT NULL,
    "performedByUserId" TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsWalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PasswordResetOtp
CREATE TABLE "PasswordResetOtp" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "phone"      TEXT NOT NULL,
    "otpHash"    TEXT NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolSmsWallet_unitsRemaining_idx" ON "SchoolSmsWallet"("unitsRemaining");

-- CreateIndex
CREATE INDEX "SmsWalletTransaction_schoolId_createdAt_idx" ON "SmsWalletTransaction"("schoolId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SmsWalletTransaction_schoolId_type_idx" ON "SmsWalletTransaction"("schoolId", "type");

-- CreateIndex
CREATE INDEX "PasswordResetOtp_userId_createdAt_idx" ON "PasswordResetOtp"("userId", "createdAt" DESC);

-- AddForeignKey: SchoolSmsWallet → School
ALTER TABLE "SchoolSmsWallet" ADD CONSTRAINT "SchoolSmsWallet_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SmsWalletTransaction → School
ALTER TABLE "SmsWalletTransaction" ADD CONSTRAINT "SmsWalletTransaction_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SmsWalletTransaction → SchoolSmsWallet
ALTER TABLE "SmsWalletTransaction" ADD CONSTRAINT "SmsWalletTransaction_walletSchoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "SchoolSmsWallet"("schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: PasswordResetOtp → User
ALTER TABLE "PasswordResetOtp" ADD CONSTRAINT "PasswordResetOtp_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
