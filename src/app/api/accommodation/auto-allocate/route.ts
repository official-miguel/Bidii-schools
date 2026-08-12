import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole , requireSchoolRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import {
  type GenderPolicy,
  studentMatchesDormGender,
} from "@/lib/accommodation/genderPolicy";

async function manageGuard() {
  return (
    (await requireRole("PRINCIPAL")) ??
    (await requirePermission("ACCOMMODATION", "manage"))
  );
}

const schema = z.object({
  /** List of dorm IDs to distribute students across. If empty, uses all ACTIVE dorms. */
  dormIds: z.array(z.string()).optional(),
  /** Filter students to auto-allocate */
  filter: z
    .object({
      forms: z.array(z.number().int().min(1).max(12)).optional(),
      classIds: z.array(z.string()).optional(),
      unallocatedOnly: z.boolean().default(true),
    })
    .optional(),
  /** Strategy: FILL_FIRST fills each dorm before moving on; DISTRIBUTE_EVENLY spreads students */
  strategy: z.enum(["FILL_FIRST", "DISTRIBUTE_EVENLY"]).default("DISTRIBUTE_EVENLY"),
  /** Only perform a dry run — return what would be allocated without writing */
  dryRun: z.boolean().default(false),
  notes: z.string().trim().max(500).optional().nullable(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

type FreePosEntry = { id: string; dormId: string; bedId: string; cubicleId: string | null };

/**
 * Round-robin interleave.
 * Given [[a1,a2],[b1,b2],[c1]], returns [a1,b1,c1,a2,b2].
 * Used to stripe items from different buckets into a single sequence.
 */
function interleave<T>(buckets: T[][]): T[] {
  const result: T[] = [];
  const maxLen = Math.max(0, ...buckets.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of buckets) {
      if (i < bucket.length) result.push(bucket[i]);
    }
  }
  return result;
}

/**
 * For MIXED_FORMS + CUBICLE_BASED:
 *   Reorder free positions so they interleave across cubicles.
 *   e.g. [cub-A pos1, cub-B pos1, cub-C pos1, cub-A pos2, …]
 *   This means consecutive allocations land in different cubicles,
 *   so each cubicle ends up with a spread of forms.
 */
function orderPositionsForMixedCubicle(positions: FreePosEntry[]): FreePosEntry[] {
  const byCubicle = new Map<string, FreePosEntry[]>();
  for (const p of positions) {
    const key = p.cubicleId ?? "__none__";
    if (!byCubicle.has(key)) byCubicle.set(key, []);
    byCubicle.get(key)!.push(p);
  }
  return interleave([...byCubicle.values()]);
}

/**
 * For MIXED_FORMS + OPEN_HALL:
 *   Reorder students so consecutive allocations come from different forms.
 *   Sort students into per-form buckets then interleave them.
 *   e.g. [F1-student1, F2-student1, F3-student1, F4-student1, F1-student2, …]
 *   Positions stay in their natural order; the student ordering drives the spread.
 */
function interleaveStudentsByForm<T extends { form: number }>(students: T[]): T[] {
  const byForm = new Map<number, T[]>();
  for (const s of students) {
    if (!byForm.has(s.form)) byForm.set(s.form, []);
    byForm.get(s.form)!.push(s);
  }
  // Sort form buckets for deterministic output
  const sortedBuckets = [...byForm.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, v]) => v);
  return interleave(sortedBuckets);
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * POST /api/accommodation/auto-allocate
 *
 * Automatically distributes students across dormitories according to each
 * dorm's configured rules (form restrictions, capacity, structure).
 *
 * MIXED_FORMS + CUBICLE_BASED: positions are interleaved across cubicles so
 *   each cubicle receives a spread of forms rather than one form per cubicle.
 *
 * MIXED_FORMS + OPEN_HALL: students are interleaved by form so no single form
 *   clusters together in one area of the hall.
 *
 * RESTRICTED_BY_FORM: students are only placed in dorms whose permitted forms
 *   include their own form (unchanged behaviour).
 *
 * Each student is assigned to a specific free SleepingPosition so that
 * SleepingPosition.isOccupied is kept accurate and bed-level occupancy is
 * correctly reflected in the UI.
 *
 * Returns a preview (plan) when dryRun=true, or executes allocations when false.
 */
export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const { dormIds, filter, strategy, dryRun, notes } = parsed.data;

  // ── Load school gender policy ──────────────────────────────────────────────
  // This is the outer constraint: a BOYS_ONLY school never needs per-student
  // gender checks because all enrolled students are boys by definition.
  // For MIXED schools we check each student's gender against the dorm policy.
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { genderPolicy: true },
  });
  const schoolGenderPolicy = (school?.genderPolicy ?? "MIXED") as GenderPolicy;

  // ── Resolve target dorms ───────────────────────────────────────────────────
  const dormQuery = dormIds && dormIds.length > 0 ? { id: { in: dormIds } } : {};
  const dorms = await prisma.dormitory.findMany({
    where: { ...dormQuery, schoolId, status: "ACTIVE" },
    include: { permittedForms: true },
    orderBy: { name: "asc" },
  });

  if (dorms.length === 0) {
    return NextResponse.json({ error: "No active dormitories available." }, { status: 400 });
  }

  // ── Load free sleeping positions per dorm ─────────────────────────────────
  const freePosRows = await prisma.sleepingPosition.findMany({
    where: {
      schoolId,
      dormId: { in: dorms.map((d) => d.id) },
      isOccupied: false,
    },
    select: { id: true, dormId: true, bedId: true, cubicleId: true },
    orderBy: { id: "asc" },
  });

  // Build per-dorm position queues, applying the mixing strategy for each dorm.
  // For MIXED_FORMS + CUBICLE_BASED: interleave across cubicles so each cubicle
  //   gets consecutive allocations from different forms.
  // For MIXED_FORMS + OPEN_HALL: positions stay sequential; student ordering handles mixing.
  // For RESTRICTED_BY_FORM: positions stay sequential (form enforcement is the gate).
  const freePosQueues = new Map<string, FreePosEntry[]>();
  const dormMap = new Map(dorms.map((d) => [d.id, d]));

  for (const d of dorms) {
    const dormPositions = freePosRows.filter((p) => p.dormId === d.id);
    if (d.allocationPolicy === "MIXED_FORMS" && d.structure === "CUBICLE_BASED") {
      freePosQueues.set(d.id, orderPositionsForMixedCubicle(dormPositions));
    } else {
      freePosQueues.set(d.id, [...dormPositions]);
    }
  }

  // ── Resolve students to allocate ───────────────────────────────────────────
  const studentWhere: Record<string, unknown> = {
    schoolId,
    archivedAt: null,
  };
  if (filter?.forms && filter.forms.length > 0) {
    studentWhere.schoolClass = { form: { in: filter.forms } };
  }
  if (filter?.classIds && filter.classIds.length > 0) {
    studentWhere.classId = { in: filter.classIds };
  }

  const allStudents = await prisma.student.findMany({
    where: studentWhere,
    select: {
      id: true,
      fullName: true,
      admissionNumber: true,
      gender: true,
      schoolClass: { select: { name: true, form: true } },
      accommodationAllocations: {
        where: { status: "CURRENT" },
        select: { dormId: true },
        take: 1,
      },
    },
    orderBy: { fullName: "asc" },
  });

  const studentsToAllocate =
    filter?.unallocatedOnly !== false
      ? allStudents.filter((s) => s.accommodationAllocations.length === 0)
      : allStudents;

  if (studentsToAllocate.length === 0) {
    return NextResponse.json({
      message: "No students require allocation.",
      allocated: 0,
      unplaceable: 0,
      plan: [],
    });
  }

  // ── Phase 1: assign each student to a dorm ────────────────────────────────
  // We collect (student, chosenDorm) pairs first, then re-order per dorm for
  // OPEN_HALL mixing before assigning concrete positions in Phase 2.

  type DormAssignment = {
    student: (typeof studentsToAllocate)[0];
    dorm: (typeof dorms)[0];
  };

  type PlanEntry = {
    studentId: string;
    studentName: string;
    admissionNumber: string;
    className: string;
    dormId: string;
    dormName: string;
    position: FreePosEntry;
  };

  const dormAssignments: DormAssignment[] = [];
  const unplaceable: Array<{ studentId: string; studentName: string; reason: string }> = [];

  // Temporary capacity counters (positions remaining) — used only for dorm selection.
  // We'll dequeue actual positions in Phase 2.
  const availableCount = new Map<string, number>(
    dorms.map((d) => [d.id, freePosQueues.get(d.id)!.length])
  );

  // Round-robin cursor: one pointer per (gender, form-group) key so that
  // students with different constraints each get their own rotation state.
  // Key = "<genderPolicy>|<formKey>" where formKey is the dorm's permitted
  // forms joined (or "any" for MIXED_FORMS dorms).
  // In practice, for DISTRIBUTE_EVENLY we maintain a global rotation index
  // over the eligible dorm list for each student so that successive students
  // are sent to different dorms before any dorm receives a second student.
  const rrIndexMap = new Map<string, number>();

  for (const student of studentsToAllocate) {
    const studentForm = student.schoolClass.form;

    const eligibleDorms = dorms.filter((d) => {
      if ((availableCount.get(d.id) ?? 0) <= 0) return false;

      // ── Gender check via school-aware helper ──────────────────────────────
      // Single-gender school → helper always returns true (no per-student check).
      // Mixed school → compares student.gender against the dorm's effective policy.
      if (
        !studentMatchesDormGender(
          schoolGenderPolicy,
          d.genderPolicy as GenderPolicy,
          student.gender,
        )
      ) return false;

      // ── Form restriction check ────────────────────────────────────────────
      if (
        d.allocationPolicy === "RESTRICTED_BY_FORM" &&
        d.permittedForms.length > 0
      ) {
        if (!d.permittedForms.some((pf) => pf.form === studentForm)) return false;
      }

      return true;
    });

    if (eligibleDorms.length === 0) {
      // Build a useful reason string
      const genderNote =
        schoolGenderPolicy === "MIXED" && student.gender
          ? ` / ${student.gender}`
          : "";
      unplaceable.push({
        studentId: student.id,
        studentName: student.fullName,
        reason: `No eligible dormitory with available capacity for Form ${studentForm}${genderNote}`,
      });
      continue;
    }

    let chosenDorm: (typeof dorms)[0];

    if (strategy === "FILL_FIRST") {
      // Fill each dorm to capacity before moving to the next.
      const sorted = [...eligibleDorms].sort((a, b) => {
        const ca = availableCount.get(a.id)!;
        const cb = availableCount.get(b.id)!;
        return ca - cb; // least free first
      });
      chosenDorm = sorted[0];
    } else {
      // DISTRIBUTE_EVENLY — true round-robin: each consecutive student goes to
      // the next eligible dorm in rotation, cycling back to the first once all
      // have received one student.  This guarantees that dorm 1, dorm 2, dorm 3,
      // dorm 1, dorm 2, … rather than bulk-filling one dorm at a time.
      //
      // The rotation key is stable across students with the same eligible-dorm
      // set so the cursor advances correctly regardless of form/gender filtering.
      const rrKey = eligibleDorms.map((d) => d.id).join("|");
      const cursor = rrIndexMap.get(rrKey) ?? 0;
      chosenDorm = eligibleDorms[cursor % eligibleDorms.length];
      rrIndexMap.set(rrKey, cursor + 1);
    }

    availableCount.set(chosenDorm.id, availableCount.get(chosenDorm.id)! - 1);
    dormAssignments.push({ student, dorm: chosenDorm });
  }

  // ── Phase 2: assign positions within each dorm ────────────────────────────
  // Group assignments by dorm, apply per-dorm ordering, then pair with positions.

  const plan: PlanEntry[] = [];

  // Group by dorm
  const byDorm = new Map<string, DormAssignment[]>();
  for (const a of dormAssignments) {
    if (!byDorm.has(a.dorm.id)) byDorm.set(a.dorm.id, []);
    byDorm.get(a.dorm.id)!.push(a);
  }

  for (const [dormId, assignments] of byDorm) {
    const dorm = dormMap.get(dormId)!;
    const posQueue = freePosQueues.get(dormId)!;

    // For MIXED_FORMS + OPEN_HALL: interleave students by form so consecutive
    // positions in the hall go to different forms.
    const orderedAssignments =
      dorm.allocationPolicy === "MIXED_FORMS" && dorm.structure === "OPEN_HALL"
        ? interleaveStudentsByForm(assignments.map((a) => ({ ...a, form: a.student.schoolClass.form })))
        : assignments;

    for (const assignment of orderedAssignments) {
      const position = posQueue.shift();
      if (!position) break; // safety — shouldn't happen given Phase 1 accounting

      plan.push({
        studentId: assignment.student.id,
        studentName: assignment.student.fullName,
        admissionNumber: assignment.student.admissionNumber,
        className: assignment.student.schoolClass.name,
        dormId: dorm.id,
        dormName: dorm.name,
        position,
      });
    }
  }

  // ── Dry-run: return plan without writing ───────────────────────────────────
  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      toAllocate: plan.length,
      unplaceable: unplaceable.length,
      plan: plan.map((e) => ({
        studentId: e.studentId,
        studentName: e.studentName,
        admissionNumber: e.admissionNumber,
        className: e.className,
        dormId: e.dormId,
        dormName: e.dormName,
      })),
      unplaceableStudents: unplaceable,
    });
  }

  // ── Execute the plan ───────────────────────────────────────────────────────
  const allocDate = new Date();
  let allocated = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const entry of plan) {
        // Vacate any existing CURRENT allocation for this student
        const existing = await tx.allocationRecord.findFirst({
          where: { studentId: entry.studentId, schoolId, status: "CURRENT" },
        });
        if (existing) {
          await tx.allocationRecord.update({
            where: { id: existing.id },
            data: { status: "TRANSFERRED", vacatedDate: new Date() },
          });
          if (existing.sleepingPositionId) {
            await tx.sleepingPosition.update({
              where: { id: existing.sleepingPositionId },
              data: { isOccupied: false },
            });
          }
        }

        // Create the new allocation with a specific bed + sleeping position
        await tx.allocationRecord.create({
          data: {
            schoolId,
            studentId: entry.studentId,
            dormId: entry.dormId,
            cubicleId: entry.position.cubicleId ?? null,
            bedId: entry.position.bedId,
            sleepingPositionId: entry.position.id,
            notes: notes ?? `Auto-allocated (${strategy.replace("_", " ").toLowerCase()})`,
            allocatedById: user.id,
            allocationDate: allocDate,
            status: "CURRENT",
          },
        });

        // Mark the sleeping position as occupied
        await tx.sleepingPosition.update({
          where: { id: entry.position.id },
          data: { isOccupied: true },
        });

        allocated++;
      }
    },
    { timeout: 60_000 }
  );

  return NextResponse.json({
    dryRun: false,
    allocated,
    unplaceable: unplaceable.length,
    plan: plan.map((e) => ({
      studentId: e.studentId,
      studentName: e.studentName,
      admissionNumber: e.admissionNumber,
      className: e.className,
      dormId: e.dormId,
      dormName: e.dormName,
    })),
    unplaceableStudents: unplaceable,
  });
}
