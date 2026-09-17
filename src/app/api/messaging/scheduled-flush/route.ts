/**
 * GET /api/messaging/scheduled-flush
 *
 * Cron-triggered route that dispatches all scheduled messages whose
 * scheduledAt <= now().
 *
 * Protected by Authorization: Bearer ${CRON_SECRET} — same pattern as
 * /api/finance/jobs/debtor-refresh.
 *
 * NOTE ON FREQUENCY: a message scheduled for 3pm only goes out on the next
 * run of this job, so it must be called often — every 5 minutes, alongside
 * /api/notifications/tick, from the same external scheduler. vercel.json's
 * cron entry is a daily backstop only (Vercel Hobby allows nothing finer).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deliverMessage } from "@/lib/messaging/deliver";

// Never statically pre-rendered — always runs at request time
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth: require CRON_SECRET bearer token ───────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";

  // Reject if CRON_SECRET is not set or the header doesn't match
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // take: 100 — cap messages processed per tick to bound memory and execution
  // time; the remainder is picked up by the next run.
  const due = await prisma.message.findMany({
    where: {
      status:      "PENDING",
      scheduledAt: { not: null, lte: new Date() },
    },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });

  let dispatched = 0;
  let failed = 0;

  for (const { id } of due) {
    try {
      await deliverMessage(id);
      dispatched++;
    } catch {
      failed++;
      await prisma.message.update({ where: { id }, data: { status: "FAILED" } }).catch(() => {});
    }
  }

  return NextResponse.json({ dispatched, failed });
}
