import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import {
  type GenderPolicy,
  validateDormGenderPolicy,
  requiredDormGenderPolicy,
} from "@/lib/accommodation/genderPolicy";

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
  { params }: { params: { dormId: string } }
) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const dorm = await prisma.dormitory.findFirst({
    where: { id: params.dormId, schoolId },
    include: {
      permittedForms: true,
      boardingMaster: { select: { id: true, fullName: true, staffId: true } },
      dormCaptain: {
        select: {
          id: true,
          fullName: true,
          admissionNumber: true,
          schoolClass: { select: { name: true } },
        },
      },
      cubicles: {
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
      },
      beds: {
        where: { cubicleId: null }, // top-level beds (OPEN_HALL or uncubicled)
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
      },
      _count: {
        select: {
          allocations: { where: { status: "CURRENT" } },
          sleepingPositions: true,
        },
      },
    },
  });

  if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });

  return NextResponse.json(dorm);
}

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  // MIXED is never a valid dorm gender policy.
  genderPolicy: z.enum(["BOYS_ONLY", "GIRLS_ONLY"], {
    errorMap: () => ({ message: "Dormitory gender must be Boys Only or Girls Only." }),
  }).optional(),
  structure: z.enum(["OPEN_HALL", "CUBICLE_BASED"]).optional(),
  status: z.enum(["ACTIVE", "UNDER_MAINTENANCE", "CLOSED"]).optional(),
  allocationPolicy: z.enum(["RESTRICTED_BY_FORM", "MIXED_FORMS"]).optional(),
  cubiclesInheritPolicy: z.boolean().optional(),
  description: z.string().trim().max(500).optional().nullable(),
  boardingMasterId: z.preprocess((v) => (v == null ? v : String(v)), z.string().optional().nullable()),
  dormCaptainId: z.preprocess((v) => (v == null ? v : String(v)), z.string().optional().nullable()),
  permittedForms: z.array(z.coerce.number().int().min(1).max(12)).optional(),
});

export async function PATCH(
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

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const { permittedForms, ...rest } = parsed.data;

  // ── Enforce school gender policy on genderPolicy changes ──────────────────
  // Only run when the caller is actually changing the gender policy.
  // Fetch School.genderPolicy once; validate + coerce the requested value.
  let resolvedGenderPolicy: string | undefined = rest.genderPolicy;
  if (rest.genderPolicy !== undefined) {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { genderPolicy: true },
    });
    const schoolGenderPolicy = (school?.genderPolicy ?? "MIXED") as GenderPolicy;

    const genderError = validateDormGenderPolicy(
      schoolGenderPolicy,
      rest.genderPolicy as GenderPolicy,
    );
    if (genderError) {
      return NextResponse.json({ error: genderError }, { status: 409 });
    }

    // Coerce to the required value for single-gender schools
    resolvedGenderPolicy = requiredDormGenderPolicy(schoolGenderPolicy) ?? rest.genderPolicy;
  }

  // Build the data payload, substituting the coerced gender policy when it changed.
  // boardingMasterId / dormCaptainId are kept separate — they must go through
  // Prisma's connect/disconnect API and must NOT appear in the scalar spread.
  const { boardingMasterId, dormCaptainId, ...scalarRest } = rest;
  const updateData = resolvedGenderPolicy !== rest.genderPolicy
    ? { ...scalarRest, genderPolicy: resolvedGenderPolicy as "BOYS_ONLY" | "GIRLS_ONLY" | undefined }
    : scalarRest;

  // ── Status transition side-effects ────────────────────────────────────────
  // When a dorm is changed to UNDER_MAINTENANCE or CLOSED via the generic PATCH
  // (e.g. the dormitories edit form), automatically snapshot all CURRENT
  // allocations as MAINTENANCE_HOLD so students become "unallocated" in the UI
  // and can be restored when the dorm is reactivated.
  //
  // When a dorm is changed back to ACTIVE, restore any MAINTENANCE_HOLD
  // allocations for students who are still enrolled, skipping those who have
  // since been archived (graduated / transferred / expelled).
  const newStatus = rest.status;
  const statusChangingToInactive =
    newStatus !== undefined &&
    newStatus !== dorm.status &&
    (newStatus === "UNDER_MAINTENANCE" || newStatus === "CLOSED") &&
    dorm.status === "ACTIVE";

  const statusChangingToActive =
    newStatus === "ACTIVE" &&
    newStatus !== dorm.status &&
    (dorm.status === "UNDER_MAINTENANCE" || dorm.status === "CLOSED");

  const updated = await prisma.$transaction(async (tx) => {
    // ── Snapshot: ACTIVE → inactive ─────────────────────────────────────────
    if (statusChangingToInactive) {
      const currentAllocations = await tx.allocationRecord.findMany({
        where: { dormId: params.dormId, status: "CURRENT", schoolId },
      });
      for (const alloc of currentAllocations) {
        await tx.allocationRecord.update({
          where: { id: alloc.id },
          data: {
            status: "MAINTENANCE_HOLD",
            vacatedDate: new Date(),
            notes: `Auto-snapshot: dorm status changed to ${newStatus}`,
          },
        });
        if (alloc.sleepingPositionId) {
          await tx.sleepingPosition.update({
            where: { id: alloc.sleepingPositionId },
            data: { isOccupied: false },
          });
        }
      }
    }

    // ── Restore: inactive → ACTIVE ──────────────────────────────────────────
    if (statusChangingToActive) {
      const heldAllocations = await tx.allocationRecord.findMany({
        where: { dormId: params.dormId, status: "MAINTENANCE_HOLD", schoolId },
        include: {
          student: { select: { archivedAt: true } },
          sleepingPosition: { select: { id: true, isOccupied: true } },
        },
      });

      for (const alloc of heldAllocations) {
        // Skip students who have left the school
        if (alloc.student.archivedAt !== null) {
          await tx.allocationRecord.update({
            where: { id: alloc.id },
            data: { status: "VACATED", notes: "Student no longer enrolled at time of dorm reactivation." },
          });
          continue;
        }

        // Skip students who got a new allocation while the dorm was closed
        const activeCurrent = await tx.allocationRecord.findFirst({
          where: { studentId: alloc.studentId, schoolId, status: "CURRENT" },
        });
        if (activeCurrent) {
          await tx.allocationRecord.update({
            where: { id: alloc.id },
            data: { status: "VACATED", notes: "Student already re-allocated during dorm closure." },
          });
          continue;
        }

        // Skip if the bed was taken by someone else in the meantime
        if (alloc.sleepingPositionId && alloc.sleepingPosition?.isOccupied) {
          await tx.allocationRecord.update({
            where: { id: alloc.id },
            data: { status: "VACATED", notes: "Original sleeping position was re-assigned during dorm closure." },
          });
          continue;
        }

        // Restore to CURRENT
        await tx.allocationRecord.update({
          where: { id: alloc.id },
          data: { status: "CURRENT", vacatedDate: null, notes: "Restored on dorm reactivation." },
        });
        if (alloc.sleepingPositionId) {
          await tx.sleepingPosition.update({
            where: { id: alloc.sleepingPositionId },
            data: { isOccupied: true },
          });
        }
      }
    }

    // ── Apply permitted forms update ─────────────────────────────────────────
    if (permittedForms !== undefined) {
      await tx.dormPermittedForm.deleteMany({ where: { dormId: params.dormId } });
      if (permittedForms.length > 0) {
        await tx.dormPermittedForm.createMany({
          data: permittedForms.map((form) => ({ dormId: params.dormId, form })),
        });
      }
    }

    // boardingMasterId / dormCaptainId were already separated from updateData above.
    // Use Prisma connect/disconnect so the data object satisfies DormitoryUpdateInput.
    return tx.dormitory.update({
      where: { id: params.dormId },
      data: {
        ...updateData,
        ...(boardingMasterId !== undefined
          ? boardingMasterId === null
            ? { boardingMaster: { disconnect: true } }
            : { boardingMaster: { connect: { id: boardingMasterId } } }
          : {}),
        ...(dormCaptainId !== undefined
          ? dormCaptainId === null
            ? { dormCaptain: { disconnect: true } }
            : { dormCaptain: { connect: { id: dormCaptainId } } }
          : {}),
      },
      include: {
        permittedForms: true,
        boardingMaster: { select: { id: true, fullName: true, staffId: true } },
        dormCaptain: { select: { id: true, fullName: true, admissionNumber: true } },
      },
    });
  }, { timeout: 30_000 });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { dormId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const dorm = await prisma.dormitory.findFirst({
    where: { id: params.dormId, schoolId },
    include: { _count: { select: { allocations: { where: { status: "CURRENT" } } } } },
  });
  if (!dorm) return NextResponse.json({ error: "Dormitory not found." }, { status: 404 });

  if (dorm._count.allocations > 0) {
    return NextResponse.json(
      { error: "Cannot delete a dormitory with active student allocations. Deallocate all students first." },
      { status: 409 }
    );
  }

  await prisma.dormitory.delete({ where: { id: params.dormId } });
  return NextResponse.json({ success: true });
}
