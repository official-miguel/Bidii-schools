/**
 * PATCH /api/finance/expense-items/[id]/deactivate  — Soft-deactivate an expense item
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const existing = await prisma.expenseItem.findFirst({
    where: { id: params.id, schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const updated = await prisma.expenseItem.update({
    where:  { id: params.id },
    data:   { isActive: false },
    select: { id: true, isActive: true },
  });

  return NextResponse.json({ item: updated });
}
