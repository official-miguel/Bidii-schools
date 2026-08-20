import { NextRequest, NextResponse } from "next/server";
import { z }                        from "zod";
import { prisma }                   from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { randomUUID }               from "crypto";

type Ctx = { params: { id: string } };

const schema = z.object({
  /** The slot being dragged */
  slotAId: z.string().min(1),
  /** The slot in the target cell (must belong to the same version) */
  slotBId: z.string().min(1),
});

/**
 * PATCH /api/timetable/v2/versions/[id]/swap
 *
 * Atomically swaps the (dayOfWeek, period) of two slots within the same
 * timetable version — keeping each slot's subjectId + teacherId intact.
 *
 * Business rules enforced:
 *  1. Both slots must belong to the version and the caller's school.
 *  2. Neither slot may be locked.
 *  3. After the swap, no teacher may be double-booked:
 *       - teacherA must not already occupy slotB's (day, period) in any
 *         other class row (ignoring slotA and slotB themselves).
 *       - teacherB must not already occupy slotA's (day, period) in any
 *         other class row (ignoring slotA and slotB themselves).
 *  4. Class-level double-booking is also checked (same class, same period).
 *
 * On success the updated pair is returned as { slotA, slotB }.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: body.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  const { slotAId, slotBId } = body.data;

  if (slotAId === slotBId)
    return NextResponse.json({ error: "Cannot swap a slot with itself." }, { status: 400 });

  // ── Verify version ownership and editability ──────────────────────────────
  const vRows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion"
    WHERE id = ${params.id} AND "schoolId" = ${user.schoolId!}`;
  if (!vRows[0])
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (vRows[0].status === "ARCHIVED")
    return NextResponse.json(
      { error: "Cannot edit an archived version." },
      { status: 409 }
    );

  // ── Load both slots ───────────────────────────────────────────────────────
  type SlotRow = {
    id: string;
    classId: string;
    subjectId: string;
    teacherId: string;
    dayOfWeek: number;
    period: number;
    room: string | null;
    isLocked: boolean;
  };

  const rows = await prisma.$queryRaw<SlotRow[]>`
    SELECT id, "classId", "subjectId", "teacherId", "dayOfWeek", period, room, "isLocked"
    FROM "TimetableVersionSlot"
    WHERE id IN (${slotAId}, ${slotBId}) AND "versionId" = ${params.id}`;

  const slotA = rows.find((r) => r.id === slotAId);
  const slotB = rows.find((r) => r.id === slotBId);

  if (!slotA) return NextResponse.json({ error: "Source slot not found." }, { status: 404 });
  if (!slotB) return NextResponse.json({ error: "Target slot not found." }, { status: 404 });

  if (slotA.isLocked)
    return NextResponse.json(
      { error: "The source lesson is locked. Unlock it before swapping." },
      { status: 409 }
    );
  if (slotB.isLocked)
    return NextResponse.json(
      { error: "The target lesson is locked. Unlock it before swapping." },
      { status: 409 }
    );

  // ── Teacher clash check ───────────────────────────────────────────────────
  // After the swap:
  //   slotA will occupy slotB's (day, period)   → slotA.teacherId must be free there
  //   slotB will occupy slotA's (day, period)   → slotB.teacherId must be free there
  //
  // We exclude both slotA and slotB from these checks because they are the
  // ones being moved — any other occupant is a genuine clash UNLESS it is a
  // pooled elective-group session: the occupying slot shares the same subjectId
  // AND both subjects belong to a common ElectiveGroup.  In that case the
  // teacher is legitimately running one merged session for multiple classes.

  const teacherAClash = await prisma.$queryRaw<Array<{ classId: string; className: string; subjectId: string }>>`
    SELECT s."classId", c.name AS "className", s."subjectId"
    FROM "TimetableVersionSlot" s
    JOIN "SchoolClass" c ON c.id = s."classId"
    WHERE s."versionId" = ${params.id}
      AND s."teacherId" = ${slotA.teacherId}
      AND s."dayOfWeek" = ${slotB.dayOfWeek}
      AND s.period      = ${slotB.period}
      AND s.id NOT IN (${slotAId}, ${slotBId})`;

  if (teacherAClash.length > 0) {
    const occupyingSubjectId = teacherAClash[0].subjectId;
    const isPooled =
      occupyingSubjectId === slotA.subjectId &&
      (await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM "ElectiveGroupMember" egm1
        JOIN "ElectiveGroupMember" egm2 ON egm2."groupId" = egm1."groupId"
        WHERE egm1."subjectId" = ${slotA.subjectId}
          AND egm2."subjectId" = ${occupyingSubjectId}
      `).some((r) => Number(r.count) > 0);

    if (!isPooled) {
      const clashName = teacherAClash[0].className;
      return NextResponse.json(
        { error: `Swap refused — the teacher of "${slotA.subjectId}" is already teaching ${clashName} in that period.` },
        { status: 409 }
      );
    }
  }

  const teacherBClash = await prisma.$queryRaw<Array<{ classId: string; className: string; subjectId: string }>>`
    SELECT s."classId", c.name AS "className", s."subjectId"
    FROM "TimetableVersionSlot" s
    JOIN "SchoolClass" c ON c.id = s."classId"
    WHERE s."versionId" = ${params.id}
      AND s."teacherId" = ${slotB.teacherId}
      AND s."dayOfWeek" = ${slotA.dayOfWeek}
      AND s.period      = ${slotA.period}
      AND s.id NOT IN (${slotAId}, ${slotBId})`;

  if (teacherBClash.length > 0) {
    const occupyingSubjectId = teacherBClash[0].subjectId;
    const isPooled =
      occupyingSubjectId === slotB.subjectId &&
      (await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM "ElectiveGroupMember" egm1
        JOIN "ElectiveGroupMember" egm2 ON egm2."groupId" = egm1."groupId"
        WHERE egm1."subjectId" = ${slotB.subjectId}
          AND egm2."subjectId" = ${occupyingSubjectId}
      `).some((r) => Number(r.count) > 0);

    if (!isPooled) {
      const clashName = teacherBClash[0].className;
      return NextResponse.json(
        { error: `Swap refused — the teacher of "${slotB.subjectId}" is already teaching ${clashName} in that period.` },
        { status: 409 }
      );
    }
  }

  // ── Class double-booking check ────────────────────────────────────────────
  // Only needed when the two slots belong to different classes.
  if (slotA.classId !== slotB.classId) {
    const classAClash = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "TimetableVersionSlot"
      WHERE "versionId" = ${params.id}
        AND "classId"   = ${slotA.classId}
        AND "dayOfWeek" = ${slotB.dayOfWeek}
        AND period      = ${slotB.period}
        AND id NOT IN (${slotAId}, ${slotBId})`;
    if (classAClash.length > 0)
      return NextResponse.json(
        { error: "Swap refused — the source class already has a lesson in the target period." },
        { status: 409 }
      );

    const classBClash = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "TimetableVersionSlot"
      WHERE "versionId" = ${params.id}
        AND "classId"   = ${slotB.classId}
        AND "dayOfWeek" = ${slotA.dayOfWeek}
        AND period      = ${slotA.period}
        AND id NOT IN (${slotAId}, ${slotBId})`;
    if (classBClash.length > 0)
      return NextResponse.json(
        { error: "Swap refused — the target class already has a lesson in the source period." },
        { status: 409 }
      );
  }

  // ── Perform the atomic swap ───────────────────────────────────────────────
  const now = new Date();

  await prisma.$transaction([
    // Move A to B's position
    prisma.$executeRaw`
      UPDATE "TimetableVersionSlot"
      SET "dayOfWeek" = ${slotB.dayOfWeek},
          period      = ${slotB.period},
          "isManual"  = true,
          "updatedAt" = ${now}
      WHERE id = ${slotAId}`,

    // Move B to A's position
    prisma.$executeRaw`
      UPDATE "TimetableVersionSlot"
      SET "dayOfWeek" = ${slotA.dayOfWeek},
          period      = ${slotA.period},
          "isManual"  = true,
          "updatedAt" = ${now}
      WHERE id = ${slotBId}`,

    // Audit log for A
    prisma.$executeRaw`
      INSERT INTO "TimetableChangeLog"
        (id, "schoolId", "versionId", "slotId", action, "changeSource",
         "beforeState", "afterState", detail, "performedById", "performedAt")
      VALUES (
        ${randomUUID()}, ${user.schoolId!}, ${params.id}, ${slotAId},
        'SLOT_MOVED'::"TimetableChangeAction", 'MANUAL',
        ${JSON.stringify({ dayOfWeek: slotA.dayOfWeek, period: slotA.period })}::jsonb,
        ${JSON.stringify({ dayOfWeek: slotB.dayOfWeek, period: slotB.period })}::jsonb,
        ${JSON.stringify({ swap: true, swappedWithSlotId: slotBId })}::jsonb,
        ${user.id}, ${now})`,

    // Audit log for B
    prisma.$executeRaw`
      INSERT INTO "TimetableChangeLog"
        (id, "schoolId", "versionId", "slotId", action, "changeSource",
         "beforeState", "afterState", detail, "performedById", "performedAt")
      VALUES (
        ${randomUUID()}, ${user.schoolId!}, ${params.id}, ${slotBId},
        'SLOT_MOVED'::"TimetableChangeAction", 'MANUAL',
        ${JSON.stringify({ dayOfWeek: slotB.dayOfWeek, period: slotB.period })}::jsonb,
        ${JSON.stringify({ dayOfWeek: slotA.dayOfWeek, period: slotA.period })}::jsonb,
        ${JSON.stringify({ swap: true, swappedWithSlotId: slotAId })}::jsonb,
        ${user.id}, ${now})`,
  ]);

  // ── Return updated pair with resolved names ───────────────────────────────
  const updated = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT s.*, sub.code AS "subjectCode", sub.name AS "subjectName",
           t."fullName" AS "teacherName", c.name AS "className"
    FROM "TimetableVersionSlot" s
    JOIN "Subject"    sub ON sub.id = s."subjectId"
    JOIN "Teacher"      t ON t.id   = s."teacherId"
    JOIN "SchoolClass"  c ON c.id   = s."classId"
    WHERE s.id IN (${slotAId}, ${slotBId})`;

  return NextResponse.json({
    slotA: updated.find((r) => r.id === slotAId),
    slotB: updated.find((r) => r.id === slotBId),
  });
}
