/**
 * PATCH /api/finance/accounts/[studentId]/complete-setup
 * Marks a student's finance setup as complete.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function PATCH(_req: NextRequest, { params }: { params: { studentId: string } }) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;
  if (user.role === "PRINCIPAL") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const account = await prisma.studentFinanceAccount.findFirst({
    where: { studentId: params.studentId, schoolId },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Finance account not found." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.studentFinanceAccount.update({
      where: { id: account.id },
      data:  { financeSetupCompletedAt: new Date() },
    });

    // Mark the SETUP_REQUIRED notification as read
    await tx.financeNotification.updateMany({
      where:  { schoolId, studentId: params.studentId, type: "SETUP_REQUIRED", isRead: false },
      data:   { isRead: true },
    });
  });

  return NextResponse.json({ success: true });
}
