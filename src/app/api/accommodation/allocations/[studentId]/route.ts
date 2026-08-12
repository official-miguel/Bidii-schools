import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function guard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("ACCOMMODATION", "view"))
  );
}
async function manageGuard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("ACCOMMODATION", "manage"))
  );
}

/** GET /api/accommodation/allocations/[studentId] — full accommodation history */
export async function GET(
  _req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const records = await prisma.allocationRecord.findMany({
    where: { studentId: params.studentId, schoolId },
    orderBy: { allocationDate: "desc" },
    include: {
      dorm: { select: { id: true, name: true } },
      cubicle: { select: { id: true, name: true } },
      bed: { select: { id: true, label: true, bedType: true } },
      sleepingPosition: { select: { id: true, position: true, customLabel: true } },
      allocatedBy: { select: { id: true, email: true } },
    },
  });

  return NextResponse.json(records);
}

const deallocateSchema = z.object({
  notes: z.string().trim().max(500).optional().nullable(),
  transferStatus: z.enum(["VACATED", "TRANSFERRED"]).default("VACATED"),
});

/** DELETE /api/accommodation/allocations/[studentId] — deallocate current student */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const body = await req.json().catch(() => ({}));
  const parsed = deallocateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const { notes, transferStatus } = parsed.data;

  const current = await prisma.allocationRecord.findFirst({
    where: {
      studentId: params.studentId,
      schoolId,
      status: "CURRENT",
    },
  });

  if (!current) {
    return NextResponse.json(
      { error: "This student has no current accommodation allocation." },
      { status: 404 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.allocationRecord.update({
      where: { id: current.id },
      data: { status: transferStatus, vacatedDate: new Date(), notes: notes ?? current.notes },
    });

    if (current.sleepingPositionId) {
      await tx.sleepingPosition.update({
        where: { id: current.sleepingPositionId },
        data: { isOccupied: false },
      });
    }
  });

  return NextResponse.json({ success: true });
}
