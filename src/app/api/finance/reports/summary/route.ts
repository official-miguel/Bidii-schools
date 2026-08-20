/**
 * GET /api/finance/reports/summary — Collection summary with optional termId filter
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const { searchParams } = new URL(req.url);
  const termId = searchParams.get("termId");

  const baseWhere = {
    schoolId,
    ...(termId ? { termId } : {}),
    isVoided: false,
  };

  const [invoiced, collected] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { ...baseWhere, entryType: "INVOICE" },
      _sum:  { amount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { ...baseWhere, entryType: "PAYMENT" },
      _sum:  { amount: true },
    }),
  ]);

  const totalInvoiced   = new Decimal((invoiced._sum.amount  ?? 0).toString());
  const totalCollected  = new Decimal((collected._sum.amount ?? 0).toString());
  const totalOutstanding = totalInvoiced.minus(totalCollected);
  const collectionRate  = totalInvoiced.isZero()
    ? 0
    : totalCollected.div(totalInvoiced).mul(100).toDecimalPlaces(2).toNumber();

  const debtorCount = await prisma.debtorFlag.count({
    where: { schoolId, isCurrent: true },
  });

  return NextResponse.json({
    totalInvoiced:    totalInvoiced.toString(),
    totalCollected:   totalCollected.toString(),
    totalOutstanding: totalOutstanding.toString(),
    collectionRate,
    debtorCount,
  });
}
