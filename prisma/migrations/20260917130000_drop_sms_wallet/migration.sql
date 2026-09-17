-- Drop the per-school SMS wallet/credit ledger.
--
-- Every school shares one Mobivas (PlatformSmsConfig) account, and Mobivas
-- already tracks the real balance on its own dashboard — the local
-- SchoolSmsWallet/SmsWalletTransaction tables were a second, redundant
-- accounting layer that just went out of sync with the provider's own
-- number. If the Mobivas account runs dry, individual sends fail with a
-- real provider error (already surfaced per-recipient in MessageLog);
-- that's the actual gate now.

DROP TABLE IF EXISTS "SmsWalletTransaction";
DROP TABLE IF EXISTS "SchoolSmsWallet";
DROP TYPE IF EXISTS "SmsTransactionType";
