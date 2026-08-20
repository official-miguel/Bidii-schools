/**
 * GET /api/finance/jobs/debtor-refresh — Daily cron: refresh debtor flags
 *
 * Protected by Authorization: Bearer ${CRON_SECRET}.
 * Called daily by Vercel Cron (vercel.json) or any external scheduler.
 *
 * Internally delegates to runDailyDebtorJob() which:
 * - Iterates all schools with active debtor flags
 * - Recalculates daysOverdueAtFlag from the oldest unpaid INVOICE entry date
 * - Clears flags for students whose balance has recovered
 *
 * Returns { updated: number } — the count of flag rows touched.
 */
import { NextRequest, NextResponse } from "next/server";
import { runDailyDebtorJob } from "@/lib/finance/debtor";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";

  // Reject if CRON_SECRET is not set or the header doesn't match
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const updated = await runDailyDebtorJob();
    return NextResponse.json({ updated });
  } catch (err) {
    console.error("[CRON/DEBTOR-REFRESH]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
