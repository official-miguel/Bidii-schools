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

const itemSchema = z.object({
  category: z.string().trim().min(1).max(100),
  item: z.string().trim().min(1).max(200),
  rating: z.enum(["EXCELLENT", "GOOD", "SATISFACTORY", "NEEDS_IMPROVEMENT", "POOR"]),
  score: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const createSchema = z.object({
  dormId: z.string().min(1),
  inspectionDate: z.string(),
  inspectedById: z.string().optional().nullable(),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).default("SCHEDULED"),
  overallRating: z
    .enum(["EXCELLENT", "GOOD", "SATISFACTORY", "NEEDS_IMPROVEMENT", "POOR"])
    .optional()
    .nullable(),
  overallScore: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  recommendations: z.string().trim().max(2000).optional().nullable(),
  nextInspectionDate: z.string().optional().nullable(),
  items: z.array(itemSchema).optional(),
});

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;
  const { searchParams } = req.nextUrl;
  const dormId = searchParams.get("dormId");
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);

  const inspections = await prisma.dormInspection.findMany({
    where: {
      schoolId,
      ...(dormId ? { dormId } : {}),
      ...(status ? { status: status as "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" } : {}),
    },
    orderBy: { inspectionDate: "desc" },
    take: limit,
    include: {
      dorm: { select: { id: true, name: true } },
      inspectedBy: { select: { id: true, email: true } },
      items: true,
    },
  });

  return NextResponse.json(inspections);
}

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const {
    dormId, inspectionDate, inspectedById, status,
    overallRating, overallScore, notes, recommendations,
    nextInspectionDate, items,
  } = parsed.data;

  const dorm = await prisma.dormitory.findFirst({
    where: { id: dormId, schoolId },
  });
  if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });

  const inspection = await prisma.dormInspection.create({
    data: {
      schoolId,
      dormId,
      inspectionDate: new Date(inspectionDate),
      inspectedById: inspectedById ?? user.id,
      status,
      overallRating: overallRating ?? null,
      overallScore: overallScore ?? null,
      notes: notes ?? null,
      recommendations: recommendations ?? null,
      nextInspectionDate: nextInspectionDate ? new Date(nextInspectionDate) : null,
      items: items && items.length > 0 ? { create: items } : undefined,
    },
    include: {
      dorm: { select: { id: true, name: true } },
      inspectedBy: { select: { id: true, email: true } },
      items: true,
    },
  });

  return NextResponse.json(inspection, { status: 201 });
}
