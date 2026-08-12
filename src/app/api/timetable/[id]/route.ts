import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const existing = await prisma.timetableSlot.findFirst({
    where: { id: params.id, schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Slot not found." }, { status: 404 });

  try {
    await prisma.timetableSlot.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't remove slot." }, { status: 500 });
  }
}
