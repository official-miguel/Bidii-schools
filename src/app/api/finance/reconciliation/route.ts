/**
 * GET /api/finance/reconciliation — List pending M-Pesa reconciliation queue entries
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function GET() {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const items = await prisma.mpesaReconciliationQueue.findMany({
    where:   { schoolId, status: "PENDING" },
    orderBy: { paidAt: "desc" },
    select: {
      id: true, mpesaTransactionId: true, rawAccountNumber: true,
      amount: true, paidAt: true, suggestedStudentId: true, suggestedConfidence: true, status: true,
    },
  });

  // Resolve suggested student names for convenience
  const studentIds = items.map((i) => i.suggestedStudentId).filter(Boolean) as string[];
  const students   = studentIds.length > 0
    ? await prisma.student.findMany({ where: { id: { in: studentIds }, schoolId }, select: { id: true, fullName: true, admissionNumber: true } })
    : [];
  const studentMap = new Map(students.map((s) => [s.id, s]));

  return NextResponse.json({
    items: items.map((item) => ({
      ...item,
      amount: item.amount.toString(),
      suggestedStudent: item.suggestedStudentId ? studentMap.get(item.suggestedStudentId) ?? null : null,
    })),
  });
}
