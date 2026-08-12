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

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user || !user.schoolId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dormId = req.nextUrl.searchParams.get("dormId");
  const status = req.nextUrl.searchParams.get("status") ?? "CURRENT";
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const allocations = await prisma.allocationRecord.findMany({
    where: {
      schoolId: user.schoolId,
      ...(dormId ? { dormId } : {}),
      status: status as "CURRENT" | "VACATED" | "TRANSFERRED",
      ...(q
        ? {
            student: {
              OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { admissionNumber: { contains: q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    orderBy: { allocationDate: "desc" },
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          admissionNumber: true,
          schoolClass: { select: { name: true, form: true } },
        },
      },
      dorm: { select: { id: true, name: true } },
      cubicle: { select: { id: true, name: true } },
      bed: { select: { id: true, label: true, bedType: true } },
      sleepingPosition: { select: { id: true, position: true, customLabel: true } },
      allocatedBy: { select: { id: true, email: true } },
    },
    take: 200,
  });

  return NextResponse.json(allocations);
}

const allocateSchema = z.object({
  studentId: z.string().min(1, "Student is required."),
  dormId: z.string().min(1, "Dormitory is required."),
  cubicleId: z.string().optional().nullable(),
  bedId: z.string().optional().nullable(),
  sleepingPositionId: z.string().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  allocationDate: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user || !user.schoolId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = allocateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const { studentId, dormId, cubicleId, bedId, sleepingPositionId, notes, allocationDate } =
    parsed.data;

  // Verify student belongs to this school
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  // Verify dorm belongs to this school
  const dorm = await prisma.dormitory.findFirst({
    where: { id: dormId, schoolId: user.schoolId },
    include: { _count: { select: { allocations: { where: { status: "CURRENT" } } } } },
  });
  if (!dorm) {
    return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });
  }

  // Block allocation if the dorm is already at or above capacity
  // (only enforced when the dorm has sleeping positions configured)
  if (dorm.totalCapacity > 0 && dorm._count.allocations >= dorm.totalCapacity) {
    return NextResponse.json(
      {
        error: `${dorm.name} is at full capacity (${dorm._count.allocations}/${dorm.totalCapacity} positions occupied). Free up a space or add more beds before allocating another student.`,
      },
      { status: 409 }
    );
  }

  // If a sleeping position is specified, check it's not already occupied
  if (sleepingPositionId) {
    const pos = await prisma.sleepingPosition.findFirst({
      where: { id: sleepingPositionId, dormId, schoolId: user.schoolId },
    });
    if (!pos) {
      return NextResponse.json({ error: "Sleeping position not found." }, { status: 404 });
    }
    if (pos.isOccupied) {
      return NextResponse.json(
        { error: "This sleeping position is already occupied." },
        { status: 409 }
      );
    }
  }

  const allocation = await prisma.$transaction(async (tx) => {
    // Vacate any existing CURRENT allocation for this student
    await tx.allocationRecord.updateMany({
      where: { studentId, schoolId: user.schoolId, status: "CURRENT" },
      data: { status: "VACATED", vacatedDate: new Date() },
    });

    // If student had a previous sleeping position, mark it free
    const previousAllocation = await tx.allocationRecord.findFirst({
      where: { studentId, schoolId: user.schoolId, status: "VACATED" },
      orderBy: { updatedAt: "desc" },
    });
    if (previousAllocation?.sleepingPositionId) {
      await tx.sleepingPosition.update({
        where: { id: previousAllocation.sleepingPositionId },
        data: { isOccupied: false },
      });
    }

    // Create new allocation
    const newAllocation = await tx.allocationRecord.create({
      data: {
        schoolId: user.schoolId!,
        studentId,
        dormId,
        cubicleId: cubicleId ?? null,
        bedId: bedId ?? null,
        sleepingPositionId: sleepingPositionId ?? null,
        notes,
        allocatedById: user.id,
        allocationDate: allocationDate ? new Date(allocationDate) : new Date(),
        status: "CURRENT",
      },
    });

    // Mark sleeping position as occupied
    if (sleepingPositionId) {
      await tx.sleepingPosition.update({
        where: { id: sleepingPositionId },
        data: { isOccupied: true },
      });
    }

    return newAllocation;
  });

  return NextResponse.json(allocation, { status: 201 });
}
