/**
 * GET /api/finance/reports/aging — Aging report with 0-30, 31-60, 61-90, 90+ day buckets
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

function agingBucket(days: number): string {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export async function GET() {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  // Only pull accounts with a negative balance (students who owe money).
  const accounts = await prisma.studentFinanceAccount.findMany({
    where: { schoolId, currentBalance: { lt: 0 } },
    select: {
      currentBalance: true,
      totalInvoiced:  true,
      totalPaid:      true,
      student: {
        select: {
          id:              true,
          fullName:        true,
          admissionNumber: true,
          schoolClass:     { select: { name: true } },
        },
      },
    },
  });

  if (accounts.length === 0) return NextResponse.json({ rows: [] });

  const studentIds = accounts.map((a) => a.student.id);

  // PERF: instead of N parallel findFirst queries (one per debtor), fetch the
  // oldest un-voided INVOICE date per student in a single DB groupBy aggregate.
  const oldestInvoices = await prisma.ledgerEntry.groupBy({
    by: ["studentId"],
    where: {
      schoolId,
      studentId: { in: studentIds },
      entryType: "INVOICE",
      isVoided: false,
    },
    _min: { postedAt: true },
  });

  const oldestByStudent = new Map(
    oldestInvoices.map((r) => [r.studentId, r._min.postedAt])
  );

  const now = new Date();

  const rows = accounts.map((acc) => {
    const oldest = oldestByStudent.get(acc.student.id) ?? null;
    const daysOverdue = oldest
      ? Math.floor((now.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      studentId:       acc.student.id,
      fullName:        acc.student.fullName,
      admissionNumber: acc.student.admissionNumber,
      className:       acc.student.schoolClass?.name ?? null,
      totalInvoiced:   acc.totalInvoiced.toString(),
      totalPaid:       acc.totalPaid.toString(),
      balance:         acc.currentBalance.toString(),
      daysOverdue,
      bucket:          agingBucket(daysOverdue),
    };
  });

  return NextResponse.json({ rows });
}
