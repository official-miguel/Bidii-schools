import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function manageGuard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("ACCOMMODATION", "manage"))
  );
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Cubicle name is required.").max(50),
  capacity: z.coerce.number().int().min(1).max(100).default(4),
  allocationPolicy: z.enum(["RESTRICTED_BY_FORM", "MIXED_FORMS"]).nullable().optional(),
  description: z.string().trim().max(300).optional().nullable(),
  permittedForms: z.array(z.coerce.number().int().min(1).max(12)).default([]),
  bedType: z.enum(["SINGLE", "DOUBLE_DECKER", "CUSTOM"]).default("SINGLE"),
  customOccupancy: z.coerce.number().int().min(1).max(20).optional(),
});

const bulkCreateSchema = z.object({
  mode: z.enum(["bulk", "auto"]),
  names: z.array(z.string().trim().min(1)).optional(),
  count: z.coerce.number().int().min(1).max(200).optional(),
  prefix: z.string().trim().max(20).optional(),
  capacityEach: z.coerce.number().int().min(1).max(100).default(4),
  bedType: z.enum(["SINGLE", "DOUBLE_DECKER", "CUSTOM"]).default("SINGLE"),
  customOccupancy: z.coerce.number().int().min(1).max(20).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { dormId: string } }
) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("ACCOMMODATION", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const cubicles = await prisma.cubicle.findMany({
    where: { dormId: params.dormId, schoolId },
    orderBy: { name: "asc" },
    include: {
      permittedForms: true,
      _count: {
        select: {
          beds: true,
          sleepingPositions: true,
          allocations: { where: { status: "CURRENT" } },
        },
      },
    },
  });

  const result = cubicles.map((c) => ({
    ...c,
    _count: {
      ...c._count,
      sleepingPositions: c._count.sleepingPositions,
      allocations: c._count.allocations,
    },
  }));

  return NextResponse.json(result);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { dormId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const body = await req.json().catch(() => null);

  if (body?.mode === "bulk" || body?.mode === "auto") {
    const parsed = bulkCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid input." },
        { status: 400 }
      );
    }

    const { mode, names, count, prefix, capacityEach, bedType, customOccupancy } = parsed.data;

    let cubicleNames: string[] = [];
    if (mode === "bulk" && names && names.length > 0) {
      cubicleNames = names;
    } else if (mode === "auto" && count) {
      const p = prefix?.trim() || "Cubicle ";
      cubicleNames = Array.from({ length: count }, (_, i) => `${p}${i + 1}`);
    }

    if (cubicleNames.length === 0) {
      return NextResponse.json({ error: "No cubicle names provided." }, { status: 400 });
    }

    function getPositionsPerBed(type: string, customOcc: number | undefined) {
      if (type === "DOUBLE_DECKER") return 2;
      if (type === "CUSTOM") return Math.max(1, customOcc || 1);
      return 1;
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const lastBed = await tx.bed.findFirst({
          where: { dormId: params.dormId },
          orderBy: { createdAt: "desc" },
        });
        let nextBedNumber = 1;
        if (lastBed?.label) {
          const match = lastBed.label.match(/Bed (\d+)/);
          if (match) nextBedNumber = parseInt(match[1]) + 1;
        }

        const cubicles = await Promise.all(
          cubicleNames.map((name) =>
            tx.cubicle.create({
              data: { dormId: params.dormId, schoolId, name, capacity: capacityEach },
            })
          )
        );

        for (const cubicle of cubicles) {
          for (let i = 1; i <= capacityEach; i++) {
            const bed = await tx.bed.create({
              data: {
                dormId: params.dormId,
                cubicleId: cubicle.id,
                schoolId,
                label: `Bed ${nextBedNumber}`,
                bedType,
                customOccupancy: bedType === "CUSTOM" ? (customOccupancy || 1) : null,
              },
            });
            nextBedNumber++;

            const positionsCount = getPositionsPerBed(bedType, customOccupancy);
            if (bedType === "DOUBLE_DECKER") {
              await tx.sleepingPosition.create({ data: { bedId: bed.id, dormId: params.dormId, cubicleId: cubicle.id, schoolId, position: "UPPER" } });
              await tx.sleepingPosition.create({ data: { bedId: bed.id, dormId: params.dormId, cubicleId: cubicle.id, schoolId, position: "LOWER" } });
            } else if (bedType === "CUSTOM") {
              for (let j = 1; j <= positionsCount; j++) {
                await tx.sleepingPosition.create({ data: { bedId: bed.id, dormId: params.dormId, cubicleId: cubicle.id, schoolId, position: null, customLabel: `Space ${j}` } });
              }
            } else {
              await tx.sleepingPosition.create({ data: { bedId: bed.id, dormId: params.dormId, cubicleId: cubicle.id, schoolId, position: null } });
            }
          }
        }

        const positionCount = await tx.sleepingPosition.count({ where: { dormId: params.dormId } });
        await tx.dormitory.update({ where: { id: params.dormId }, data: { totalCapacity: positionCount } });

        return tx.cubicle.findMany({
          where: { id: { in: cubicles.map(c => c.id) } },
          include: {
            permittedForms: true,
            _count: { select: { beds: true, sleepingPositions: true, allocations: { where: { status: "CURRENT" } } } },
          },
        });
      });

      return NextResponse.json({ created: created.length, cubicles: created }, { status: 201 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ error: "One or more cubicle names already exist in this dormitory." }, { status: 409 });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        return NextResponse.json({ error: "Dormitory not found or does not belong to your school." }, { status: 404 });
      }
      console.error("[POST /cubicles] bulk create error:", err);
      return NextResponse.json({ error: `Failed to create cubicles: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
    }
  }

  // Single cubicle
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || "Invalid input." }, { status: 400 });
  }

  const { name, capacity, allocationPolicy, description, permittedForms, bedType, customOccupancy } = parsed.data;

  const existing = await prisma.cubicle.findUnique({ where: { dormId_name: { dormId: params.dormId, name } } });
  if (existing) {
    return NextResponse.json({ error: `A cubicle named "${name}" already exists in this dormitory.` }, { status: 409 });
  }

  function getPositionsPerBed(type: string, customOcc: number | undefined) {
    if (type === "DOUBLE_DECKER") return 2;
    if (type === "CUSTOM") return Math.max(1, customOcc || 1);
    return 1;
  }

  try {
    const cubicle = await prisma.$transaction(async (tx) => {
      const newCubicle = await tx.cubicle.create({
        data: {
          dormId: params.dormId,
          schoolId,
          name,
          capacity,
          allocationPolicy: allocationPolicy ?? null,
          description,
          permittedForms:
            allocationPolicy === "RESTRICTED_BY_FORM" && permittedForms.length > 0
              ? { create: permittedForms.map((form) => ({ form })) }
              : undefined,
        },
      });

      const lastBed = await tx.bed.findFirst({ where: { dormId: params.dormId }, orderBy: { createdAt: "desc" } });
      let nextBedNumber = 1;
      if (lastBed?.label) {
        const match = lastBed.label.match(/Bed (\d+)/);
        if (match) nextBedNumber = parseInt(match[1]) + 1;
      }

      for (let i = 1; i <= capacity; i++) {
        const bed = await tx.bed.create({
          data: {
            dormId: params.dormId,
            cubicleId: newCubicle.id,
            schoolId,
            label: `Bed ${nextBedNumber}`,
            bedType,
            customOccupancy: bedType === "CUSTOM" ? (customOccupancy || 1) : null,
          },
        });
        nextBedNumber++;

        const positionsCount = getPositionsPerBed(bedType, customOccupancy);
        if (bedType === "DOUBLE_DECKER") {
          await tx.sleepingPosition.create({ data: { bedId: bed.id, dormId: params.dormId, cubicleId: newCubicle.id, schoolId, position: "UPPER" } });
          await tx.sleepingPosition.create({ data: { bedId: bed.id, dormId: params.dormId, cubicleId: newCubicle.id, schoolId, position: "LOWER" } });
        } else if (bedType === "CUSTOM") {
          for (let j = 1; j <= positionsCount; j++) {
            await tx.sleepingPosition.create({ data: { bedId: bed.id, dormId: params.dormId, cubicleId: newCubicle.id, schoolId, position: null, customLabel: `Space ${j}` } });
          }
        } else {
          await tx.sleepingPosition.create({ data: { bedId: bed.id, dormId: params.dormId, cubicleId: newCubicle.id, schoolId, position: null } });
        }
      }

      const positionCount = await tx.sleepingPosition.count({ where: { dormId: params.dormId } });
      await tx.dormitory.update({ where: { id: params.dormId }, data: { totalCapacity: positionCount } });

      return tx.cubicle.findUnique({
        where: { id: newCubicle.id },
        include: {
          permittedForms: true,
          _count: { select: { beds: true, sleepingPositions: true, allocations: { where: { status: "CURRENT" } } } },
        },
      });
    });

    return NextResponse.json(cubicle, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: `A cubicle named "${name}" already exists in this dormitory.` }, { status: 409 });
    }
    console.error("[POST /cubicles] single create error:", err);
    return NextResponse.json({ error: `Failed to create cubicle: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
