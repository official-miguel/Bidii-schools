import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function manageGuard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("ACCOMMODATION", "manage"))
  );
}

/**
 * The dorm-management route handles complex operational actions that go
 * beyond simple CRUD. Each action is distinguished by the `action` field.
 *
 * Supported actions:
 *   TRANSFER_STUDENT       — move one student from their current dorm to another
 *   EMERGENCY_RELOCATION   — bulk-move all students out of a dorm (marks dorm UNDER_MAINTENANCE)
 *   MAINTENANCE_CLOSE      — set dorm to UNDER_MAINTENANCE; students become MAINTENANCE_HOLD
 *                            (preserves their exact bed so they can be restored on reopen)
 *   MAINTENANCE_REOPEN     — set dorm back to ACTIVE; restores MAINTENANCE_HOLD students to
 *                            their original beds (skips archived/graduated/expelled students)
 *   DORM_CLOSE             — permanently CLOSE a dorm; students become MAINTENANCE_HOLD
 *                            (same snapshot logic — they can still be restored if reopened)
 *   BULK_REMOVE            — remove allocations from all students in a dorm (VACATED — permanent)
 *   STUDENT_REASSIGN       — change a student's cubicle/bed/position within the same dorm
 */

const transferSchema = z.object({
  action: z.literal("TRANSFER_STUDENT"),
  studentId: z.string().min(1),
  toDormId: z.string().min(1),
  toCubicleId: z.string().optional().nullable(),
  toSleepingPositionId: z.string().optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const emergencySchema = z.object({
  action: z.literal("EMERGENCY_RELOCATION"),
  fromDormId: z.string().min(1),
  toDormId: z.string().min(1).optional().nullable(),
  reason: z.string().trim().min(1, "Reason is required for emergency relocation.").max(500),
  notes: z.string().trim().max(500).optional().nullable(),
});

const maintenanceCloseSchema = z.object({
  action: z.literal("MAINTENANCE_CLOSE"),
  dormId: z.string().min(1),
  reason: z.string().trim().min(1, "Reason is required.").max(500),
  notes: z.string().trim().max(500).optional().nullable(),
  /** @deprecated Use snapshot behaviour instead. Kept for UI back-compat. */
  relocateStudents: z.boolean().default(false),
  toDormId: z.string().optional().nullable(),
});

const maintenanceReopenSchema = z.object({
  action: z.literal("MAINTENANCE_REOPEN"),
  dormId: z.string().min(1),
  notes: z.string().trim().max(500).optional().nullable(),
});

const dormCloseSchema = z.object({
  action: z.literal("DORM_CLOSE"),
  dormId: z.string().min(1),
  reason: z.string().trim().min(1, "Reason is required.").max(500),
  notes: z.string().trim().max(500).optional().nullable(),
});

const bulkRemoveSchema = z.object({
  action: z.literal("BULK_REMOVE"),
  dormId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(500).optional().nullable(),
});

const reassignSchema = z.object({
  action: z.literal("STUDENT_REASSIGN"),
  studentId: z.string().min(1),
  cubicleId: z.string().optional().nullable(),
  sleepingPositionId: z.string().optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const bodySchema = z.discriminatedUnion("action", [
  transferSchema,
  emergencySchema,
  maintenanceCloseSchema,
  maintenanceReopenSchema,
  dormCloseSchema,
  bulkRemoveSchema,
  reassignSchema,
]);

// ── Shared helper: snapshot CURRENT allocations as MAINTENANCE_HOLD ───────────
/**
 * For every CURRENT allocation in `dormId`, transition it to MAINTENANCE_HOLD
 * and free the SleepingPosition.isOccupied flag so queries that look for free
 * beds don't count held beds as occupied.
 *
 * The dormId / cubicleId / bedId / sleepingPositionId columns are intentionally
 * NOT cleared — they are the snapshot that MAINTENANCE_REOPEN uses to restore.
 */
async function snapshotDormAllocations(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  dormId: string,
  schoolId: string,
  reason: string,
): Promise<number> {
  const current = await tx.allocationRecord.findMany({
    where: { dormId, status: "CURRENT", schoolId },
  });

  for (const alloc of current) {
    await tx.allocationRecord.update({
      where: { id: alloc.id },
      data: {
        status: "MAINTENANCE_HOLD",
        vacatedDate: new Date(),
        notes: reason,
      },
    });
    // Free the position so the UI shows it as available (for other dorms) and
    // so auto-allocate / bulk-allocate don't count it as occupied.
    if (alloc.sleepingPositionId) {
      await tx.sleepingPosition.update({
        where: { id: alloc.sleepingPositionId },
        data: { isOccupied: false },
      });
    }
  }

  return current.length;
}

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // ── TRANSFER_STUDENT ──────────────────────────────────────────────────────
  if (data.action === "TRANSFER_STUDENT") {
    const { studentId, toDormId, toCubicleId, toSleepingPositionId, reason, notes } = data;

    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
    });
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    const toDorm = await prisma.dormitory.findFirst({
      where: { id: toDormId, schoolId },
      include: { permittedForms: true },
    });
    if (!toDorm) return NextResponse.json({ error: "Destination dormitory not found." }, { status: 404 });
    if (toDorm.status !== "ACTIVE") {
      return NextResponse.json({ error: "Destination dormitory is not active." }, { status: 409 });
    }

    const currentOccupancy = await prisma.allocationRecord.count({
      where: { dormId: toDormId, status: "CURRENT", schoolId },
    });
    if (toDorm.totalCapacity > 0 && currentOccupancy >= toDorm.totalCapacity) {
      return NextResponse.json({ error: "Destination dormitory is at full capacity." }, { status: 409 });
    }

    if (toSleepingPositionId) {
      const pos = await prisma.sleepingPosition.findFirst({
        where: { id: toSleepingPositionId, dormId: toDormId, schoolId },
      });
      if (!pos) return NextResponse.json({ error: "Sleeping position not found." }, { status: 404 });
      if (pos.isOccupied) {
        return NextResponse.json({ error: "That sleeping position is already occupied." }, { status: 409 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Vacate / clear existing allocation (including any MAINTENANCE_HOLD)
      const existing = await tx.allocationRecord.findFirst({
        where: {
          studentId,
          schoolId,
          status: { in: ["CURRENT", "MAINTENANCE_HOLD"] },
        },
      });

      let fromDormId: string | null = null;
      if (existing) {
        fromDormId = existing.dormId;
        await tx.allocationRecord.update({
          where: { id: existing.id },
          data: { status: "TRANSFERRED", vacatedDate: new Date(), notes: reason ?? notes ?? null },
        });
        if (existing.sleepingPositionId) {
          await tx.sleepingPosition.update({
            where: { id: existing.sleepingPositionId },
            data: { isOccupied: false },
          });
        }
      }

      const allocation = await tx.allocationRecord.create({
        data: {
          schoolId,
          studentId,
          dormId: toDormId,
          cubicleId: toCubicleId ?? null,
          sleepingPositionId: toSleepingPositionId ?? null,
          notes: notes ?? null,
          allocatedById: user.id,
          status: "CURRENT",
        },
      });

      if (toSleepingPositionId) {
        await tx.sleepingPosition.update({
          where: { id: toSleepingPositionId },
          data: { isOccupied: true },
        });
      }

      return { allocation, fromDormId };
    });

    return NextResponse.json({
      success: true,
      action: "TRANSFER_STUDENT",
      allocationId: result.allocation.id,
      fromDormId: result.fromDormId,
      toDormId,
    });
  }

  // ── EMERGENCY_RELOCATION ──────────────────────────────────────────────────
  if (data.action === "EMERGENCY_RELOCATION") {
    const { fromDormId, toDormId, reason, notes } = data;

    const fromDorm = await prisma.dormitory.findFirst({
      where: { id: fromDormId, schoolId },
    });
    if (!fromDorm) return NextResponse.json({ error: "Source dormitory not found." }, { status: 404 });

    const currentAllocations = await prisma.allocationRecord.findMany({
      where: { dormId: fromDormId, status: "CURRENT", schoolId },
    });

    let relocated = 0;

    await prisma.$transaction(async (tx) => {
      for (const alloc of currentAllocations) {
        // Permanently vacate (not a snapshot — this is an emergency)
        await tx.allocationRecord.update({
          where: { id: alloc.id },
          data: {
            status: "VACATED",
            vacatedDate: new Date(),
            notes: `Emergency relocation: ${reason}`,
          },
        });
        if (alloc.sleepingPositionId) {
          await tx.sleepingPosition.update({
            where: { id: alloc.sleepingPositionId },
            data: { isOccupied: false },
          });
        }

        if (toDormId) {
          await tx.allocationRecord.create({
            data: {
              schoolId,
              studentId: alloc.studentId,
              dormId: toDormId,
              notes: notes ?? `Emergency relocation from ${fromDorm.name}: ${reason}`,
              allocatedById: user.id,
              status: "CURRENT",
            },
          });
        }

        relocated++;
      }

      await tx.dormitory.update({
        where: { id: fromDormId },
        data: { status: "UNDER_MAINTENANCE" },
      });
    }, { timeout: 30_000 });

    return NextResponse.json({
      success: true,
      action: "EMERGENCY_RELOCATION",
      relocated,
      fromDormId,
      toDormId: toDormId ?? null,
    });
  }

  // ── MAINTENANCE_CLOSE ─────────────────────────────────────────────────────
  // Snapshot all CURRENT allocations as MAINTENANCE_HOLD so beds are
  // remembered. If relocateStudents=true (legacy option) the snapshotted
  // students are additionally moved to another dorm as CURRENT allocations.
  if (data.action === "MAINTENANCE_CLOSE") {
    const { dormId, reason, notes, relocateStudents, toDormId } = data;

    const dorm = await prisma.dormitory.findFirst({
      where: { id: dormId, schoolId },
    });
    if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });
    if (dorm.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Dormitory is already inactive." },
        { status: 409 }
      );
    }

    let snapshotted = 0;
    let relocated = 0;

    await prisma.$transaction(async (tx) => {
      // Snapshot every CURRENT allocation in this dorm
      const current = await tx.allocationRecord.findMany({
        where: { dormId, status: "CURRENT", schoolId },
      });

      for (const alloc of current) {
        await tx.allocationRecord.update({
          where: { id: alloc.id },
          data: {
            status: "MAINTENANCE_HOLD",
            vacatedDate: new Date(),
            notes: `Maintenance closure: ${reason}`,
          },
        });
        if (alloc.sleepingPositionId) {
          await tx.sleepingPosition.update({
            where: { id: alloc.sleepingPositionId },
            data: { isOccupied: false },
          });
        }
        snapshotted++;

        // Optionally assign a temporary CURRENT allocation in another dorm
        if (relocateStudents && toDormId) {
          await tx.allocationRecord.create({
            data: {
              schoolId,
              studentId: alloc.studentId,
              dormId: toDormId,
              notes: notes ?? `Temporarily relocated from ${dorm.name} during maintenance`,
              allocatedById: user.id,
              status: "CURRENT",
            },
          });
          relocated++;
        }
      }

      await tx.dormitory.update({
        where: { id: dormId },
        data: {
          status: "UNDER_MAINTENANCE",
          ...(notes ? { description: notes } : {}),
        },
      });
    }, { timeout: 30_000 });

    return NextResponse.json({
      success: true,
      action: "MAINTENANCE_CLOSE",
      dormId,
      snapshotted,
      relocated,
    });
  }

  // ── MAINTENANCE_REOPEN ────────────────────────────────────────────────────
  // Restore MAINTENANCE_HOLD allocations back to CURRENT for every student
  // who is still active (not archived). Students who graduated, were expelled,
  // or transferred since the snapshot are skipped — their snapshot record is
  // marked VACATED and the bed is left free.
  if (data.action === "MAINTENANCE_REOPEN") {
    const { dormId, notes } = data;

    const dorm = await prisma.dormitory.findFirst({
      where: { id: dormId, schoolId },
    });
    if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });

    // Find every snapshot for this dorm
    const heldAllocations = await prisma.allocationRecord.findMany({
      where: { dormId, status: "MAINTENANCE_HOLD", schoolId },
      include: {
        student: { select: { id: true, archivedAt: true } },
        sleepingPosition: { select: { id: true, isOccupied: true } },
      },
    });

    let restored = 0;
    let skipped = 0;

    await prisma.$transaction(async (tx) => {
      for (const alloc of heldAllocations) {
        const isArchived = alloc.student.archivedAt !== null;

        if (isArchived) {
          // Student left the school — vacate the snapshot, leave bed free
          await tx.allocationRecord.update({
            where: { id: alloc.id },
            data: {
              status: "VACATED",
              notes: "Student no longer enrolled at time of dorm reactivation.",
            },
          });
          skipped++;
          continue;
        }

        // Check if the student acquired a new CURRENT allocation while the dorm
        // was closed (e.g. via emergency relocation or manual allocation)
        const activeCurrent = await tx.allocationRecord.findFirst({
          where: {
            studentId: alloc.studentId,
            schoolId,
            status: "CURRENT",
          },
        });

        if (activeCurrent) {
          // Student is already housed somewhere — don't displace them.
          // Vacate the old snapshot so it doesn't linger.
          await tx.allocationRecord.update({
            where: { id: alloc.id },
            data: {
              status: "VACATED",
              notes: "Student already re-allocated during dorm closure.",
            },
          });
          skipped++;
          continue;
        }

        // Check whether the sleeping position is still free.
        // If another student is now in it (should be rare), skip gracefully.
        if (alloc.sleepingPositionId && alloc.sleepingPosition?.isOccupied) {
          await tx.allocationRecord.update({
            where: { id: alloc.id },
            data: {
              status: "VACATED",
              notes: "Original sleeping position was re-assigned during dorm closure.",
            },
          });
          skipped++;
          continue;
        }

        // Restore: flip the snapshot back to CURRENT and mark the position occupied
        await tx.allocationRecord.update({
          where: { id: alloc.id },
          data: {
            status: "CURRENT",
            vacatedDate: null,
            notes: notes ?? "Restored on dorm reactivation.",
          },
        });

        if (alloc.sleepingPositionId) {
          await tx.sleepingPosition.update({
            where: { id: alloc.sleepingPositionId },
            data: { isOccupied: true },
          });
        }

        restored++;
      }

      // Activate the dorm
      await tx.dormitory.update({
        where: { id: dormId },
        data: {
          status: "ACTIVE",
          ...(notes ? { description: notes } : {}),
        },
      });
    }, { timeout: 30_000 });

    return NextResponse.json({
      success: true,
      action: "MAINTENANCE_REOPEN",
      dormId,
      restored,
      skipped,
    });
  }

  // ── DORM_CLOSE ────────────────────────────────────────────────────────────
  // Permanently close a dorm. Uses the same snapshot logic as MAINTENANCE_CLOSE
  // so the allocations are remembered and can be restored if the dorm is
  // ever reactivated via MAINTENANCE_REOPEN.
  if (data.action === "DORM_CLOSE") {
    const { dormId, reason, notes } = data;

    const dorm = await prisma.dormitory.findFirst({
      where: { id: dormId, schoolId },
    });
    if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });
    if (dorm.status === "CLOSED") {
      return NextResponse.json({ error: "Dormitory is already closed." }, { status: 409 });
    }

    let snapshotted = 0;

    await prisma.$transaction(async (tx) => {
      snapshotted = await snapshotDormAllocations(
        tx,
        dormId,
        schoolId,
        `Dorm permanently closed: ${reason}`,
      );

      await tx.dormitory.update({
        where: { id: dormId },
        data: {
          status: "CLOSED",
          ...(notes ? { description: notes } : {}),
        },
      });
    }, { timeout: 30_000 });

    return NextResponse.json({
      success: true,
      action: "DORM_CLOSE",
      dormId,
      snapshotted,
    });
  }

  // ── BULK_REMOVE ───────────────────────────────────────────────────────────
  if (data.action === "BULK_REMOVE") {
    const { dormId, reason, notes } = data;

    const dorm = await prisma.dormitory.findFirst({
      where: { id: dormId, schoolId },
    });
    if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });

    // Vacate both CURRENT and MAINTENANCE_HOLD allocations
    const activeAllocations = await prisma.allocationRecord.findMany({
      where: {
        dormId,
        status: { in: ["CURRENT", "MAINTENANCE_HOLD"] },
        schoolId,
      },
    });

    let removed = 0;

    await prisma.$transaction(async (tx) => {
      for (const alloc of activeAllocations) {
        await tx.allocationRecord.update({
          where: { id: alloc.id },
          data: {
            status: "VACATED",
            vacatedDate: new Date(),
            notes: notes ?? reason,
          },
        });
        if (alloc.sleepingPositionId) {
          await tx.sleepingPosition.update({
            where: { id: alloc.sleepingPositionId },
            data: { isOccupied: false },
          });
        }
        removed++;
      }
    }, { timeout: 30_000 });

    return NextResponse.json({
      success: true,
      action: "BULK_REMOVE",
      dormId,
      removed,
    });
  }

  // ── STUDENT_REASSIGN ──────────────────────────────────────────────────────
  if (data.action === "STUDENT_REASSIGN") {
    const { studentId, cubicleId, sleepingPositionId, notes } = data;

    const current = await prisma.allocationRecord.findFirst({
      where: {
        studentId,
        schoolId,
        status: { in: ["CURRENT", "MAINTENANCE_HOLD"] },
      },
    });
    if (!current) {
      return NextResponse.json({ error: "Student has no current accommodation." }, { status: 404 });
    }

    if (sleepingPositionId) {
      const pos = await prisma.sleepingPosition.findFirst({
        where: { id: sleepingPositionId, dormId: current.dormId, schoolId },
      });
      if (!pos) return NextResponse.json({ error: "Sleeping position not found in this dorm." }, { status: 404 });
      if (pos.isOccupied && sleepingPositionId !== current.sleepingPositionId) {
        return NextResponse.json({ error: "That sleeping position is already occupied." }, { status: 409 });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (current.sleepingPositionId && current.sleepingPositionId !== sleepingPositionId) {
        await tx.sleepingPosition.update({
          where: { id: current.sleepingPositionId },
          data: { isOccupied: false },
        });
      }

      await tx.allocationRecord.update({
        where: { id: current.id },
        data: {
          cubicleId: cubicleId !== undefined ? cubicleId : current.cubicleId,
          sleepingPositionId: sleepingPositionId !== undefined ? sleepingPositionId : current.sleepingPositionId,
          notes: notes ?? current.notes,
        },
      });

      if (sleepingPositionId && sleepingPositionId !== current.sleepingPositionId) {
        await tx.sleepingPosition.update({
          where: { id: sleepingPositionId },
          data: { isOccupied: true },
        });
      }
    });

    return NextResponse.json({ success: true, action: "STUDENT_REASSIGN", studentId });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
