/**
 * GET /api/finance/jobs/balance-reconcile — Daily cron: repair balance drift.
 *
 * Protected by Authorization: Bearer ${CRON_SECRET}, same pattern as
 * /api/finance/jobs/debtor-refresh.
 *
 * StudentFinanceAccount holds a materialised balance that postLedgerEntry and
 * voidLedgerEntry keep in step with the ledger. This job is the safety net for
 * the cases they can't cover — a transaction that died mid-write, or a manual
 * SQL fix applied out of band. Without it, drift is silent and permanent.
 *
 * Returns { scanned, drifted, examples } so a non-zero `drifted` is visible in
 * the cron log rather than being quietly repaired forever.
 */
import { NextRequest, NextResponse } from "next/server";
import { runBalanceReconcileJob } from "@/lib/finance/balance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";

  // Fail closed: no secret configured means no access, never open access.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const report = await runBalanceReconcileJob();

    if (report.drifted > 0) {
      console.warn(
        `[CRON/BALANCE-RECONCILE] repaired ${report.drifted} of ${report.scanned} accounts`,
        report.examples
      );
    }

    return NextResponse.json(report);
  } catch (err) {
    console.error("[CRON/BALANCE-RECONCILE]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
