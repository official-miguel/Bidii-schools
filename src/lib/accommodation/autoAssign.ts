import { prisma } from "@/lib/prisma";
import { studentMatchesDormGender, type GenderPolicy } from "./genderPolicy";

export interface AutoAssignResult {
  dormId: string;
  dormName: string;
  cubicleId: string | null;
  bedId: string;
  sleepingPositionId: string;
}

/**
 * Attempt to auto-assign a single boarding student to an eligible dormitory
 * and a specific free sleeping position, respecting:
 *  - GENDER: in a mixed school the dorm's gender policy must match the
 *    student's recorded gender. A student with no gender recorded is never
 *    auto-assigned — eligibility cannot be confirmed, so they are left for
 *    manual placement rather than guessed into a dorm.
 *  - RESTRICTED_BY_FORM: dorm's permitted forms must include the student's form
 *  - MIXED_FORMS + CUBICLE_BASED: prefer the cubicle that currently has the
 *    fewest occupants so each cubicle fills proportionally (mix of forms)
 *  - MIXED_FORMS + OPEN_HALL: pick the dorm with the most free positions
 *    (fills proportionally, spreading students across the hall)
 *
 * Creates the AllocationRecord and marks the SleepingPosition as occupied
 * inside a single transaction.
 *
 * Returns null (non-fatal) when no eligible dorm or free position is found.
 */
export async function autoAssignDorm({
  schoolId,
  studentId,
  studentForm,
  studentGender,
  allocatedById,
}: {
  schoolId: string;
  studentId: string;
  studentForm: number;
  /**
   * The student's recorded gender. Optional only so existing callers keep
   * compiling; when omitted it is read from the student record, never assumed.
   */
  studentGender?: string | null;
  allocatedById: string;
}): Promise<AutoAssignResult | null> {
  // ── Load school policy, dorms, and the student's gender ───────────────────
  const [school, dorms, studentRow] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { genderPolicy: true },
    }),
    prisma.dormitory.findMany({
      where: { schoolId, status: "ACTIVE" },
      include: { permittedForms: true },
      orderBy: { name: "asc" },
    }),
    studentGender === undefined
      ? prisma.student.findUnique({
          where: { id: studentId },
          select: { gender: true },
        })
      : Promise.resolve(null),
  ]);

  if (dorms.length === 0) return null;

  const schoolPolicy = (school?.genderPolicy ?? "MIXED") as GenderPolicy;
  const gender = studentGender === undefined ? studentRow?.gender ?? null : studentGender;

  // Mixed school with no gender on record: there is no dorm we can safely pick.
  // Leave the student unallocated for staff to place by hand.
  if (schoolPolicy === "MIXED" && !gender) return null;

  // ── Load all free positions in one query ──────────────────────────────────
  const freePosRows = await prisma.sleepingPosition.findMany({
    where: {
      schoolId,
      dormId: { in: dorms.map((d) => d.id) },
      isOccupied: false,
    },
    select: { id: true, dormId: true, bedId: true, cubicleId: true },
    orderBy: { id: "asc" },
  });

  // Index free positions by dorm
  const freeByDorm = new Map<string, typeof freePosRows>();
  for (const d of dorms) freeByDorm.set(d.id, []);
  for (const p of freePosRows) freeByDorm.get(p.dormId)?.push(p);

  // ── Filter eligible dorms ─────────────────────────────────────────────────
  const eligible = dorms.filter((d) => {
    const free = freeByDorm.get(d.id);
    if (!free || free.length === 0) return false;

    // Never place a student in a dorm of the wrong gender.
    if (!studentMatchesDormGender(schoolPolicy, d.genderPolicy as GenderPolicy, gender)) {
      return false;
    }

    if (
      d.allocationPolicy === "RESTRICTED_BY_FORM" &&
      d.permittedForms.length > 0
    ) {
      if (!d.permittedForms.some((pf) => pf.form === studentForm)) return false;
    }

    return true;
  });

  if (eligible.length === 0) return null;

  // ── Pick the best dorm (most free positions = most room for spread) ───────
  const chosenDorm = eligible.reduce((best, d) => {
    const fb = freeByDorm.get(best.id)!.length;
    const fd = freeByDorm.get(d.id)!.length;
    return fd > fb ? d : best;
  });

  const dormFreePos = freeByDorm.get(chosenDorm.id)!;

  // ── Pick the best position within the dorm ────────────────────────────────
  // CUBICLE_BASED + MIXED_FORMS: prefer the cubicle with the fewest current
  // occupants so new students are spread across cubicles.
  // Everything else: just take the first free position.
  let chosenPos: (typeof freePosRows)[0];

  if (
    chosenDorm.structure === "CUBICLE_BASED" &&
    chosenDorm.allocationPolicy === "MIXED_FORMS"
  ) {
    // Count current occupants per cubicle
    const cubicleOccupancy = await prisma.allocationRecord.groupBy({
      by: ["cubicleId"],
      where: {
        dormId: chosenDorm.id,
        schoolId,
        status: "CURRENT",
        cubicleId: { not: null },
      },
      _count: { _all: true },
    });
    const occMap = new Map(
      cubicleOccupancy.map((r) => [r.cubicleId as string, r._count._all])
    );

    // Group free positions by cubicle
    const byCubicle = new Map<string, typeof freePosRows>();
    for (const p of dormFreePos) {
      const key = p.cubicleId ?? "__none__";
      if (!byCubicle.has(key)) byCubicle.set(key, []);
      byCubicle.get(key)!.push(p);
    }

    // Pick the cubicle with the fewest occupants (ties broken by cubicle key order)
    let bestCubicleKey: string | null = null;
    let bestOcc = Infinity;
    for (const [key] of byCubicle) {
      const occ = key === "__none__" ? 0 : (occMap.get(key) ?? 0);
      if (occ < bestOcc) {
        bestOcc = occ;
        bestCubicleKey = key;
      }
    }

    chosenPos = byCubicle.get(bestCubicleKey!)![0];
  } else {
    chosenPos = dormFreePos[0];
  }

  // ── Execute in a transaction ──────────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    await tx.allocationRecord.create({
      data: {
        schoolId,
        studentId,
        dormId: chosenDorm.id,
        cubicleId: chosenPos.cubicleId ?? null,
        bedId: chosenPos.bedId,
        sleepingPositionId: chosenPos.id,
        status: "CURRENT",
        allocationDate: new Date(),
        notes: "Auto-assigned on registration",
        allocatedById,
      },
    });

    await tx.sleepingPosition.update({
      where: { id: chosenPos.id },
      data: { isOccupied: true },
    });
  });

  return {
    dormId: chosenDorm.id,
    dormName: chosenDorm.name,
    cubicleId: chosenPos.cubicleId ?? null,
    bedId: chosenPos.bedId,
    sleepingPositionId: chosenPos.id,
  };
}
