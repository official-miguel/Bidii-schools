import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ---------------------------------------------------------------------------
// PATCH /api/assessments/frameworks/[id]
// Update label, academicYear, or toggle isActive.
// Body: { label?, academicYear?, isActive? }
// ---------------------------------------------------------------------------
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "PRINCIPAL") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const framework = await db.assessmentFramework.findUnique({
    where: { id: params.id },
    select: { id: true, schoolId: true },
  });
  if (!framework || framework.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const updated = await db.assessmentFramework.update({
    where: { id: params.id },
    data: {
      ...(body.label !== undefined && { label: String(body.label).trim() }),
      ...(body.academicYear !== undefined && {
        academicYear: String(body.academicYear).trim(),
      }),
      ...(body.isActive !== undefined && { isActive: Boolean(body.isActive) }),
    },
    select: {
      id: true,
      type: true,
      label: true,
      academicYear: true,
      isActive: true,
      createdAt: true,
      _count: { select: { periods: true, items: true } },
    },
  });

  return NextResponse.json({ framework: updated });
}

// ---------------------------------------------------------------------------
// DELETE /api/assessments/frameworks/[id]
// Blocked if the framework has any assessment items.
// ---------------------------------------------------------------------------
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "PRINCIPAL") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const framework = await db.assessmentFramework.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      schoolId: true,
      _count: { select: { items: true } },
    },
  });
  if (!framework || framework.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (framework._count.items > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot delete a framework that has assessment data. Deactivate it instead.",
      },
      { status: 409 }
    );
  }

  await db.assessmentFramework.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
