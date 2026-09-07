/**
 * PATCH /api/library/cards/[studentId]/unsuspend
 * Reactivates a suspended student library card.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";

type Params = { params: { studentId: string } };

async function manageGuard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"));
}

export async function PATCH(_req: NextRequest, { params }: Params) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const card = await prisma.libraryCard.findFirst({
    where: { studentId: params.studentId, schoolId: user.schoolId! },
  });
  if (!card) return NextResponse.json({ error: "Library card not found." }, { status: 404 });

  const updated = await prisma.libraryCard.update({
    where: { id: card.id },
    data: { status: "ACTIVE", suspensionReason: null },
  });

  emitSSE(user.schoolId!, "libraryCard.updated", updated);
  return NextResponse.json(updated);
}