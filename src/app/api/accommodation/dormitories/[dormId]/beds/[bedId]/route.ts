import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

async function manageGuard() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "manage"))
  );
}

/** Recalculates and updates Dormitory.totalCapacity based on SleepingPosition count. */
async function recalcCapacity(
  tx: Omit<
    typeof prisma,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >,
  dormId: string
) {
  const count = await tx.sleepingPosition.count({ where: { dormId } });
  await tx.dormitory.update({
    where: { id: dormId },
    data: { totalCapacity: count },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { dormId: string; bedId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  // Verify the bed belongs to this dorm and school
  const bed = await prisma.bed.findFirst({
    where: { id: params.bedId, dormId: params.dormId, schoolId },
    include: {
      positions: {
        select: {
          id: true,
          isOccupied: true,
          _count: { select: { allocations: { where: { status: "CURRENT" } } } },
        },
      },
    },
  });

  if (!bed) {
    return NextResponse.json({ error: "Bed not found." }, { status: 404 });
  }

  // Block deletion if any position is currently occupied by a student
  const occupiedCount = bed.positions.filter((p) => p.isOccupied).length;
  if (occupiedCount > 0) {
    return NextResponse.json(
      {
        error:
          occupiedCount === 1
            ? "This bed has a student allocated to it. Remove the allocation first."
            : `This bed has ${occupiedCount} students allocated to it. Remove all allocations first.`,
      },
      { status: 409 }
    );
  }

  // Delete bed (positions cascade via schema onDelete: Cascade), then recalc
  await prisma.$transaction(async (tx) => {
    await tx.bed.delete({ where: { id: params.bedId } });
    await recalcCapacity(tx, params.dormId);
  });

  return NextResponse.json({ success: true });
}
