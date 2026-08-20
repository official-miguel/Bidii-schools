/**
 * DELETE /api/finance/expense-attachments/[id]  — Soft-detach an expense attachment
 *
 * Never hard-deletes. Refunds for already-invoiced expenses must be posted
 * manually as offsetting CREDIT_ADJUSTMENT ledger entries.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const attachment = await prisma.studentExpenseAttachment.findFirst({
    where: { id: params.id, schoolId, detachedAt: null },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  // Soft-detach — never hard-delete. Refunds are manual via offsetting entries.
  await prisma.studentExpenseAttachment.update({
    where: { id: params.id },
    data:  { detachedAt: new Date(), detachedById: user.id },
  });

  return NextResponse.json({ success: true });
}
