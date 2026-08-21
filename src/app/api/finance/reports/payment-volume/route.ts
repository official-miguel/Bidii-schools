/**
 * GET /api/finance/reports/payment-volume?from=&to=&granularity=daily|weekly
 * Returns daily aggregated payment totals within a date range for Recharts BarChart.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const from = fromParam
    ? new Date(fromParam)
    : new Date(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + "T00:00:00.000Z");
  // End of today — not current time — so payments made later today are included
  const toParam = searchParams.get("to");
  const to = toParam
    ? new Date(toParam)
    : new Date(new Date().toISOString().slice(0, 10) + "T23:59:59.999Z");

  const payments = await prisma.payment.findMany({
    where:   { schoolId, paidAt: { gte: from, lte: to } },
    select:  { amount: true, paidAt: true },
    orderBy: { paidAt: "asc" },
  });

  // Aggregate by day (ISO date string YYYY-MM-DD)
  const dailyMap = new Map<string, number>();
  for (const p of payments) {
    const key = p.paidAt.toISOString().slice(0, 10);
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + parseFloat(p.amount.toString()));
  }

  const data = Array.from(dailyMap.entries()).map(([date, total]) => ({ date, total }));

  return NextResponse.json({ data });
}
