import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

async function guard() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "view"))
  );
}
async function manageGuard() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "manage"))
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { inspectionId: string } }
) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const inspection = await prisma.dormInspection.findFirst({
    where: { id: params.inspectionId, schoolId },
    include: {
      dorm: { select: { id: true, name: true, genderPolicy: true } },
      inspectedBy: { select: { id: true, email: true } },
      items: { orderBy: { category: "asc" } },
    },
  });

  if (!inspection) return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
  return NextResponse.json(inspection);
}

const updateSchema = z.object({
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  overallRating: z
    .enum(["EXCELLENT", "GOOD", "SATISFACTORY", "NEEDS_IMPROVEMENT", "POOR"])
    .optional()
    .nullable(),
  overallScore: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  recommendations: z.string().trim().max(2000).optional().nullable(),
  nextInspectionDate: z.string().optional().nullable(),
  inspectionDate: z.string().optional(),
  items: z
    .array(z.object({
      category: z.string().trim().min(1).max(100),
      item: z.string().trim().min(1).max(200),
      rating: z.enum(["EXCELLENT", "GOOD", "SATISFACTORY", "NEEDS_IMPROVEMENT", "POOR"]),
      score: z.number().min(0).max(100).optional().nullable(),
      notes: z.string().trim().max(500).optional().nullable(),
    }))
    .optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { inspectionId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const existing = await prisma.dormInspection.findFirst({
    where: { id: params.inspectionId, schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Inspection not found." }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const { items, inspectionDate, nextInspectionDate, ...rest } = parsed.data;

  const updated = await prisma.dormInspection.update({
    where: { id: params.inspectionId },
    data: {
      ...rest,
      ...(inspectionDate ? { inspectionDate: new Date(inspectionDate) } : {}),
      ...(nextInspectionDate !== undefined
        ? { nextInspectionDate: nextInspectionDate ? new Date(nextInspectionDate) : null }
        : {}),
      ...(items !== undefined
        ? { items: { deleteMany: {}, create: items } }
        : {}),
    },
    include: {
      dorm: { select: { id: true, name: true } },
      inspectedBy: { select: { id: true, email: true } },
      items: true,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { inspectionId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const existing = await prisma.dormInspection.findFirst({
    where: { id: params.inspectionId, schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Inspection not found." }, { status: 404 });

  await prisma.dormInspection.delete({ where: { id: params.inspectionId } });
  return NextResponse.json({ success: true });
}
