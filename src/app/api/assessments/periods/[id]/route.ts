import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ---------------------------------------------------------------------------
// PATCH /api/assessments/periods/[id]
// Update period fields and/or mark it as the current active period.
// When isCurrent = true, all other periods in the same framework are cleared.
// Principal only.
// Body: { name?, academicYear?, term?, weight?, maxMarks?, isCurrent? }
// ---------------------------------------------------------------------------
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "PRINCIPAL") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const period = await db.assessmentPeriod.findUnique({
    where: { id: params.id },
    select: { id: true, schoolId: true, frameworkId: true },
  });
  if (!period || period.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  // If setting isCurrent = true, first clear the flag on all sibling periods.
  if (body.isCurrent === true) {
    await db.assessmentPeriod.updateMany({
      where: { schoolId: user.schoolId!, frameworkId: period.frameworkId },
      data: { isCurrent: false },
    });
  }

  const updated = await db.assessmentPeriod.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined && { name: String(body.name).trim() }),
      ...(body.academicYear !== undefined && {
        academicYear: String(body.academicYear).trim(),
      }),
      ...(body.term !== undefined && { term: body.term ?? null }),
      ...(body.weight !== undefined && { weight: Number(body.weight) }),
      ...(body.maxMarks !== undefined && { maxMarks: body.maxMarks ?? null }),
      ...(body.isCurrent !== undefined && { isCurrent: Boolean(body.isCurrent) }),
    },
    select: {
      id: true,
      name: true,
      academicYear: true,
      term: true,
      isCurrent: true,
      maxMarks: true,
      weight: true,
    },
  });

  return NextResponse.json({ period: updated });
}

// ---------------------------------------------------------------------------
// DELETE /api/assessments/periods/[id]
// Blocked if the period has any assessment items.
// Principal only.
// ---------------------------------------------------------------------------
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "PRINCIPAL") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const period = await db.assessmentPeriod.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      schoolId: true,
      _count: { select: { items: true } },
    },
  });
  if (!period || period.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (period._count.items > 0) {
    return NextResponse.json(
      { error: "Cannot delete a period that has marks entered. Clear marks first." },
      { status: 409 }
    );
  }

  await db.assessmentPeriod.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
