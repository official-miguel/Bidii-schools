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

  // Only pull accounts with a negative balance (students who owe money)
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

  const now = new Date();

  const rows = await Promise.all(
    accounts.map(async (acc) => {
      // Find the oldest unpaid INVOICE entry to calculate days overdue
      const oldest = await prisma.ledgerEntry.findFirst({
        where:   { schoolId, studentId: acc.student.id, entryType: "INVOICE", isVoided: false },
        orderBy: { postedAt: "asc" },
        select:  { postedAt: true },
      });

      const daysOverdue = oldest
        ? Math.floor((now.getTime() - oldest.postedAt.getTime()) / (1000 * 60 * 60 * 24))
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
    })
  );

  return NextResponse.json({ rows });
}
