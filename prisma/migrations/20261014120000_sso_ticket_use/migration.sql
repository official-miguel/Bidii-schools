-- One-time sign-in passes from the Trillionaire Designs finance app.
CREATE TABLE "SsoTicketUse" (
    "jti" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoTicketUse_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "SsoTicketUse_expiresAt_idx" ON "SsoTicketUse"("expiresAt");

-- Not reachable through Supabase's public API; Prisma's owner connection is unaffected.
ALTER TABLE "SsoTicketUse" ENABLE ROW LEVEL SECURITY;
