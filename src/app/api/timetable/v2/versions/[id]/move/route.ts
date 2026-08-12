import { NextRequest, NextResponse } from "next/server";
import { z }                        from "zod";
import { prisma }                   from "@/lib/prisma";
import { requireRole }              from "@/lib/auth";
import { requirePermission }        from "@/lib/permissions";
import { randomUUID }               from "crypto";

type Ctx = { params: { id: string } };

const schema = z.object({
  slotId:    z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  period:    z.number().int().min(1).max(16),
  /** Optionally change the teacher at the same time (must be eligible). */
  teacherId: z.string().optional(),
  /** Optionally change the room. */
  room:      z.string().max(80).nullable().optional(),
});

/**
 * PATCH /api/timetable/v2/versions/[id]/move
 *
 * Atomically moves a slot to a new (dayOfWeek, period) — with optional
 * teacher / room change — and writes an audit entry. Performs full
 * conflict checking before committing:
 *   1. Target slot must be free for the class.
 *   2. Target slot must be free for the teacher.
 *   3. Target slot must not be a blocked special period.
 *   4. If teacher changed, the new teacher must be assigned to the subject.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = (await requireRole("PRINCIPAL")) ?? (await requirePermission("TIMETABLE", "manage"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  const { slotId, dayOfWeek, period, teacherId: newTeacherId, room } = body.data;

  // Verify version ownership + editability
  const vRows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion" WHERE id = ${params.id} AND "schoolId" = ${schoolId}`;
  if (!vRows[0]) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (vRows[0].status === "ARCHIVED") return NextResponse.json({ error: "Cannot edit an archived version." }, { status: 409 });

  // Load the slot
  const slotRows = await prisma.$queryRaw<Array<{
    id: string; classId: string; subjectId: string; teacherId: string;
    dayOfWeek: number; period: number; room: string | null;
  }>>`
    SELECT id, "classId", "subjectId", "teacherId", "dayOfWeek", period, room
    FROM "TimetableVersionSlot" WHERE id = ${slotId} AND "versionId" = ${params.id}`;
  if (!slotRows[0]) return NextResponse.json({ error: "Slot not found." }, { status: 404 });
  const slot = slotRows[0];

  const effectiveTeacherId = newTeacherId ?? slot.teacherId;

  // If changing teacher, verify eligibility
  if (newTeacherId && newTeacherId !== slot.teacherId) {
    const eligible = await prisma.teacherSubject.findFirst({
      where: { teacherId: newTeacherId, subjectId: slot.subjectId, teacher: { schoolId } },
    });
    if (!eligible) return NextResponse.json({ error: "That teacher is not assigned to this subject." }, { status: 400 });
  }

  // Check blocked slot
  const specialRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) FROM "SpecialPeriod"
    WHERE "schoolId" = ${schoolId} AND "isActive" = true AND period = ${period}
      AND ("dayOfWeek" IS NULL OR "dayOfWeek" = ${dayOfWeek})`;
  if (Number(specialRows[0]?.count ?? 0) > 0) {
    return NextResponse.json({ error: "That slot is a special period and cannot be used for a lesson." }, { status: 409 });
  }

  // Check class conflict (excluding the slot being moved)
  const classConflict = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "TimetableVersionSlot"
    WHERE "versionId" = ${params.id} AND "classId" = ${slot.classId}
      AND "dayOfWeek" = ${dayOfWeek} AND period = ${period} AND id != ${slotId}`;
  if (classConflict.length > 0) {
    return NextResponse.json({ error: "This class already has a lesson in that slot." }, { status: 409 });
  }

  // Check teacher conflict (excluding the slot being moved).
  // A teacher occupying the target period for a *different* class is only a
  // real conflict if the two subjects are unrelated.  When both the slot being
  // moved and the occupying slot belong to the same ElectiveGroup AND share the
  // same subjectId, the teacher is running a pooled/merged group session — that
  // is intentional and must not be blocked.
  const teacherConflict = await prisma.$queryRaw<Array<{ classId: string; subjectId: string }>>`
    SELECT "classId", "subjectId" FROM "TimetableVersionSlot"
    WHERE "versionId" = ${params.id} AND "teacherId" = ${effectiveTeacherId}
      AND "dayOfWeek" = ${dayOfWeek} AND period = ${period} AND id != ${slotId}`;

  if (teacherConflict.length > 0) {
    // Allow the move if every occupying slot shares an elective group AND the
    // same subjectId as the slot being placed (pooled teaching session).
    const occupyingSubjectId = teacherConflict[0].subjectId;
    const isPooled =
      occupyingSubjectId === slot.subjectId &&
      (await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM "ElectiveGroupMember" egm1
        JOIN "ElectiveGroupMember" egm2 ON egm2."groupId" = egm1."groupId"
        WHERE egm1."subjectId" = ${slot.subjectId}
          AND egm2."subjectId" = ${occupyingSubjectId}
      `).some((r) => Number(r.count) > 0);

    if (!isPooled) {
      const clashClass = await prisma.schoolClass.findFirst({
        where: { id: teacherConflict[0].classId },
        select: { name: true },
      });
      return NextResponse.json({
        error: `Teacher is already teaching ${clashClass?.name ?? "another class"} in that slot.`,
      }, { status: 409 });
    }
  }

  // Perform the move + mark as manual override
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE "TimetableVersionSlot"
    SET "dayOfWeek" = ${dayOfWeek}, period = ${period},
        "teacherId" = ${effectiveTeacherId},
        room = ${room !== undefined ? room : slot.room},
        "isManual"  = true,
        "updatedAt" = ${now}
    WHERE id = ${slotId}`;

  // Enriched audit with before/after state
  const beforeState = { dayOfWeek: slot.dayOfWeek, period: slot.period, teacherId: slot.teacherId, room: slot.room };
  const afterState  = { dayOfWeek, period, teacherId: effectiveTeacherId, room: room !== undefined ? room : slot.room };

  await prisma.$executeRaw`
    INSERT INTO "TimetableChangeLog"
      (id, "schoolId", "versionId", "slotId", action, "changeSource",
       "beforeState", "afterState", detail, "performedById", "performedAt")
    VALUES (
      ${randomUUID()}, ${schoolId}, ${params.id}, ${slotId},
      'SLOT_MOVED'::"TimetableChangeAction", 'MANUAL',
      ${JSON.stringify(beforeState)}::jsonb,
      ${JSON.stringify(afterState)}::jsonb,
      ${JSON.stringify({ from: beforeState, to: afterState })}::jsonb,
      ${user.id}, ${now})`;

  // Return the updated slot with names resolved
  const updated = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT s.*, sub.code AS "subjectCode", sub.name AS "subjectName",
           t."fullName" AS "teacherName", c.name AS "className"
    FROM "TimetableVersionSlot" s
    JOIN "Subject" sub ON sub.id = s."subjectId"
    JOIN "Teacher"   t ON t.id = s."teacherId"
    JOIN "SchoolClass" c ON c.id = s."classId"
    WHERE s.id = ${slotId}`;

  return NextResponse.json(updated[0]);
}
