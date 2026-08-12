import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import {
  type GenderPolicy,
  validateDormGenderPolicy,
  requiredDormGenderPolicy,
} from "@/lib/accommodation/genderPolicy";

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

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const dormitories = await prisma.dormitory.findMany({
    where: {
      schoolId,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      permittedForms: true,
      boardingMaster: {
        select: { id: true, fullName: true, staffId: true },
      },
      dormCaptain: {
        select: { id: true, fullName: true, admissionNumber: true },
      },
      _count: {
        select: {
          cubicles: true,
          beds: true,
          sleepingPositions: true,
          allocations: { where: { status: "CURRENT" } },
        },
      },
    },
  });

  return NextResponse.json(
    dormitories.map((d) => ({
      id: d.id,
      name: d.name,
      genderPolicy: d.genderPolicy,
      structure: d.structure,
      status: d.status,
      totalCapacity: d.totalCapacity,
      allocationPolicy: d.allocationPolicy,
      cubiclesInheritPolicy: d.cubiclesInheritPolicy,
      description: d.description,
      boardingMaster: d.boardingMaster,
      dormCaptain: d.dormCaptain,
      permittedForms: d.permittedForms.map((p) => p.form),
      cubicleCount: d._count.cubicles,
      bedCount: d._count.beds,
      positionCount: d._count.sleepingPositions,
      occupiedCount: d._count.allocations,
      availableCount: Math.max(0, d.totalCapacity - d._count.allocations),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }))
  );
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Dorm name is required.").max(100),
  // MIXED is never a valid dorm gender policy — every dorm must be dedicated
  // to one gender. The school-level policy enforces which one is required.
  genderPolicy: z.enum(["BOYS_ONLY", "GIRLS_ONLY"], {
    errorMap: () => ({ message: "Dormitory gender must be Boys Only or Girls Only." }),
  }),
  structure: z.enum(["OPEN_HALL", "CUBICLE_BASED"]),
  status: z.enum(["ACTIVE", "UNDER_MAINTENANCE", "CLOSED"]).default("ACTIVE"),
  allocationPolicy: z.enum(["RESTRICTED_BY_FORM", "MIXED_FORMS"]).default("MIXED_FORMS"),
  cubiclesInheritPolicy: z.boolean().default(true),
  description: z.string().trim().max(500).optional().nullable(),
  boardingMasterId: z.string().optional().nullable(),
  dormCaptainId: z.string().optional().nullable(),
  permittedForms: z.array(z.coerce.number().int().min(1).max(12)).default([]),
});

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
    name, genderPolicy, structure, status, allocationPolicy,
    cubiclesInheritPolicy, description, boardingMasterId, dormCaptainId, permittedForms,
  } = parsed.data;

  // Check uniqueness
  const existing = await prisma.dormitory.findFirst({
    where: { schoolId, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    return NextResponse.json(
      { error: `A dormitory named "${name}" already exists.` },
      { status: 409 }
    );
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { genderPolicy: true },
  });
  const schoolGenderPolicy = (school?.genderPolicy ?? "MIXED") as GenderPolicy;

  const genderError = validateDormGenderPolicy(schoolGenderPolicy, genderPolicy as GenderPolicy);
  if (genderError) {
    return NextResponse.json({ error: genderError }, { status: 409 });
  }

  // For single-gender schools, coerce the dorm policy to the required value
  // as a safety net (even though the UI already locks the field).
  const resolvedGenderPolicy =
    (requiredDormGenderPolicy(schoolGenderPolicy) ?? genderPolicy) as "BOYS_ONLY" | "GIRLS_ONLY";

  const dorm = await prisma.dormitory.create({
    data: {
      schoolId,
      name,
      genderPolicy: resolvedGenderPolicy,
      structure,
      status,
      allocationPolicy,
      cubiclesInheritPolicy,
      description,
      boardingMasterId: boardingMasterId || null,
      dormCaptainId: dormCaptainId || null,
      permittedForms:
        allocationPolicy === "RESTRICTED_BY_FORM" && permittedForms.length > 0
          ? { create: permittedForms.map((form) => ({ form })) }
          : undefined,
    },
    include: {
      permittedForms: true,
      boardingMaster: { select: { id: true, fullName: true, staffId: true } },
      dormCaptain: { select: { id: true, fullName: true, admissionNumber: true } },
    },
  });

  return NextResponse.json(dorm, { status: 201 });
}
