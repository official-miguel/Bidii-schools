import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

async function manageGuard() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "manage"))
  );
}

const createSchema = z.object({
  label: z.string().trim().min(1, "Bed label is required.").max(50),
  bedType: z.enum(["SINGLE", "DOUBLE_DECKER", "CUSTOM"]).default("SINGLE"),
  customOccupancy: z.coerce.number().int().min(1).max(20).optional().nullable(),
  cubicleId: z.string().optional().nullable(),
});

const bulkCreateSchema = z.object({
  mode: z.enum(["bulk", "auto"]),
  names: z.array(z.string().trim().min(1)).optional(),
  count: z.coerce.number().int().min(1).max(500).optional(),
  prefix: z.string().trim().max(20).optional(),
  bedType: z.enum(["SINGLE", "DOUBLE_DECKER", "CUSTOM"]).default("SINGLE"),
  customOccupancy: z.coerce.number().int().min(1).max(20).optional().nullable(),
  cubicleId: z.string().optional().nullable(),
});

// Create sleeping positions for bed
async function createPositionsForBed(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  bedId: string,
  dormId: string,
  cubicleId: string | null | undefined,
  schoolId: string,
  bedType: "SINGLE" | "DOUBLE_DECKER" | "CUSTOM",
  customOccupancy?: number | null
) {
  if (bedType === "SINGLE") {
    await tx.sleepingPosition.create({
      data: { bedId, dormId, cubicleId: cubicleId ?? null, schoolId, position: null },
    });
  } else if (bedType === "DOUBLE_DECKER") {
    await tx.sleepingPosition.createMany({
      data: [
        { bedId, dormId, cubicleId: cubicleId ?? null, schoolId, position: "UPPER" },
        { bedId, dormId, cubicleId: cubicleId ?? null, schoolId, position: "LOWER" },
      ],
    });
  } else if (bedType === "CUSTOM" && customOccupancy && customOccupancy > 0) {
    await tx.sleepingPosition.createMany({
      data: Array.from({ length: customOccupancy }, (_, i) => ({
        bedId,
        dormId,
        cubicleId: cubicleId ?? null,
        schoolId,
        position: null,
        customLabel: `Space ${i + 1}`,
      })),
    });
  }
}

// Update dormitory total capacity
async function recalcCapacity(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  dormId: string
) {
  const count = await tx.sleepingPosition.count({ where: { dormId } });
  await tx.dormitory.update({
    where: { id: dormId },
    data: { totalCapacity: count },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { dormId: string } }
) {
  const user =
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const cubicleId = req.nextUrl.searchParams.get("cubicleId");

  const beds = await prisma.bed.findMany({
    where: {
      dormId: params.dormId,
      schoolId,
      ...(cubicleId ? { cubicleId } : {}),
    },
    orderBy: { label: "asc" },
    include: {
      positions: {
        include: {
          allocations: {
            where: { status: "CURRENT" },
            include: {
              student: {
                select: {
                  id: true,
                  fullName: true,
                  admissionNumber: true,
                  schoolClass: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  return NextResponse.json(beds);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { dormId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const dorm = await prisma.dormitory.findFirst({
    where: { id: params.dormId, schoolId },
  });
  if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });

  const body = await req.json().catch(() => null);

  if (body?.mode === "bulk" || body?.mode === "auto") {
    const parsed = bulkCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid input." },
        { status: 400 }
      );
    }
    const { mode, names, count, bedType, customOccupancy, cubicleId } = parsed.data;

    let bedLabels: string[] = [];
    if (mode === "bulk" && names && names.length > 0) {
      bedLabels = names;
    } else if (mode === "auto" && count) {
      // Get the highest bed number in the dormitory to continue sequencing
      const lastBed = await prisma.bed.findFirst({
        where: { dormId: params.dormId },
        orderBy: { createdAt: "desc" },
      });
      let nextBedNumber = 1;
      if (lastBed && lastBed.label) {
        // Extract number from label like "Bed 42"
        const match = lastBed.label.match(/Bed (\d+)/);
        if (match) {
          nextBedNumber = parseInt(match[1]) + 1;
        }
      }
      // Generate sequential labels
      bedLabels = Array.from({ length: count }, (_, i) => `Bed ${nextBedNumber + i}`);
    }

    if (bedLabels.length === 0) {
      return NextResponse.json({ error: "No bed labels provided." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const beds = [];
      for (const label of bedLabels) {
        const bed = await tx.bed.create({
          data: {
            label,
            bedType,
            customOccupancy: bedType === "CUSTOM" ? customOccupancy : null,
            dormId: params.dormId,
            cubicleId: cubicleId ?? null,
            schoolId,
          },
        });
        await createPositionsForBed(
          tx, bed.id, params.dormId, cubicleId, schoolId, bedType, customOccupancy
        );
        beds.push(bed);
      }
      await recalcCapacity(tx, params.dormId);
      return beds;
    });

    return NextResponse.json({ created: result.length, beds: result }, { status: 201 });
  }

  // Single bed
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const { label, bedType, customOccupancy, cubicleId } = parsed.data;

  const existing = await prisma.bed.findUnique({
    where: { dormId_label: { dormId: params.dormId, label } },
  });
  if (existing) {
    return NextResponse.json(
      { error: `A bed labelled "${label}" already exists in this dormitory.` },
      { status: 409 }
    );
  }

  const bed = await prisma.$transaction(async (tx) => {
    const newBed = await tx.bed.create({
      data: {
        label,
        bedType,
        customOccupancy: bedType === "CUSTOM" ? customOccupancy : null,
        dormId: params.dormId,
        cubicleId: cubicleId ?? null,
        schoolId,
      },
    });
    await createPositionsForBed(
      tx, newBed.id, params.dormId, cubicleId, schoolId, bedType, customOccupancy
    );
    await recalcCapacity(tx, params.dormId);
    return newBed;
  });

  return NextResponse.json(bed, { status: 201 });
}
