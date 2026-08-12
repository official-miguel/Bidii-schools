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

const patchSchema = z.object({
  name:     z.string().trim().min(1).max(50).optional(),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { dormId: string; cubicleId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const cubicle = await prisma.cubicle.findFirst({
    where: { id: params.cubicleId, dormId: params.dormId, schoolId },
    include: { _count: { select: { beds: true } } },
  });
  if (!cubicle) return NextResponse.json({ error: "Cubicle not found." }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { name, capacity } = parsed.data;

  // If renaming, make sure the new name doesn't clash with another cubicle in the same dorm
  if (name && name !== cubicle.name) {
    const clash = await prisma.cubicle.findUnique({
      where: { dormId_name: { dormId: params.dormId, name } },
    });
    if (clash) {
      return NextResponse.json(
        { error: `A cubicle named "${name}" already exists in this dormitory.` },
        { status: 409 }
      );
    }
  }

  // Handle capacity changes: add/remove beds accordingly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {
    ...(name !== undefined ? { name } : {}),
    ...(capacity !== undefined ? { capacity } : {}),
  };

  // If capacity changed, adjust beds
  if (capacity !== undefined && capacity !== cubicle.capacity) {
    const updated = await prisma.$transaction(async (tx) => {
      // Get current cubicle with bed count
      const current = await tx.cubicle.findUnique({
        where: { id: params.cubicleId },
        include: {
          beds: { select: { id: true, label: true } },
          _count: { select: { beds: true } },
        },
      });

      if (!current) throw new Error("Cubicle not found");

      const currentBedCount = current._count.beds;
      const newBedCount = capacity;
      const bedDifference = newBedCount - currentBedCount;

      if (bedDifference > 0) {
        // Add new beds
        for (let i = 0; i < bedDifference; i++) {
          const bedNumber = currentBedCount + i + 1;
          const bedName = name || current.name;
          const bed = await tx.bed.create({
            data: {
              dormId: params.dormId,
              cubicleId: params.cubicleId,
              schoolId,
              label: `${bedName} - Bed ${bedNumber}`,
              bedType: "SINGLE",
            },
          });

          await tx.sleepingPosition.create({
            data: {
              bedId: bed.id,
              dormId: params.dormId,
              cubicleId: params.cubicleId,
              schoolId,
              position: null,
            },
          });
        }
      } else if (bedDifference < 0) {
        // Remove beds (and their sleeping positions) — only if they're not occupied
        const bedsToRemove = await tx.bed.findMany({
          where: {
            cubicleId: params.cubicleId,
          },
          include: {
            positions: {
              include: {
                allocations: { where: { status: "CURRENT" } },
              },
            },
          },
          orderBy: { label: "desc" },
          take: Math.abs(bedDifference),
        });

        for (const bed of bedsToRemove) {
          // Check if any sleeping position has active allocations
          const hasAllocations = bed.positions.some((pos) => pos.allocations.length > 0);
          if (hasAllocations) {
            throw new Error("Cannot remove beds with active student allocations");
          }

          // Delete sleeping positions first, then the bed
          await tx.sleepingPosition.deleteMany({
            where: { bedId: bed.id },
          });
          await tx.bed.delete({
            where: { id: bed.id },
          });
        }
      }

      // Update cubicle
      const updatedCubicle = await tx.cubicle.update({
        where: { id: params.cubicleId },
        data: updateData,
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

      // Recalculate dorm's totalCapacity
      const positionCount = await tx.sleepingPosition.count({
        where: { dormId: params.dormId },
      });
      await tx.dormitory.update({
        where: { id: params.dormId },
        data: { totalCapacity: positionCount },
      });

      return updatedCubicle;
    });

    return NextResponse.json(updated);
  }

  // No capacity change — just update name/other fields
  const updated = await prisma.cubicle.update({
    where: { id: params.cubicleId },
    data: updateData,
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

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { dormId: string; cubicleId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const cubicle = await prisma.cubicle.findFirst({
    where: { id: params.cubicleId, dormId: params.dormId, schoolId },
    include: { _count: { select: { allocations: { where: { status: "CURRENT" } } } } },
  });
  if (!cubicle) return NextResponse.json({ error: "Cubicle not found." }, { status: 404 });

  if (cubicle._count.allocations > 0) {
    return NextResponse.json(
      { error: "Cannot delete a cubicle with active student allocations. Remove them first." },
      { status: 409 }
    );
  }

  await prisma.cubicle.delete({ where: { id: params.cubicleId } });
  return NextResponse.json({ success: true });
}
