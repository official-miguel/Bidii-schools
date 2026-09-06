import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { TimetableSlotType } from "@prisma/client";
import { collapseGroupSlotsForDisplay } from "@/lib/timetable/engineHelpers";
import type { GroupPayloadDescriptor } from "@/lib/timetable/engineHelpers";

// ── GET /api/timetable/v2/teacher-view ─────────────────────────────────────
// Returns the personal weekly timetable grid for a teacher.
// Accessible to the teacher themselves (TEACHER role, own teacherId),
// and to the principal.
//
// Query params:
//   teacherId – required for PRINCIPAL callers; auto-resolved for TEACHER callers.
//   versionId – optional; defaults to the published version / legacy slots.

function parseMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatMinutes(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL", "TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const searchParams = req.nextUrl.searchParams;
  let   teacherId    = searchParams.get("teacherId");
  const versionId    = searchParams.get("versionId");

  // TEACHER role: resolve their own teacher record
  if (user.role === "TEACHER") {
    const teacherRecord = await prisma.teacher.findFirst({
      where: { userId: user.id, schoolId },
      select: { id: true },
    });
    if (!teacherRecord)
      return NextResponse.json({ error: "No teacher record linked to this account." }, { status: 404 });
    teacherId = teacherRecord.id;
  } else if (!teacherId) {
    return NextResponse.json({ error: "teacherId is required." }, { status: 400 });
  }

  // Verify the teacher belongs to this school
  const teacher = await prisma.teacher.findFirst({
    where: { id: teacherId, schoolId },
    select: { id: true, fullName: true, staffId: true },
  });
  if (!teacher) return NextResponse.json({ error: "Teacher not found." }, { status: 404 });

  // ── Fetch slots ──────────────────────────────────────────────────────────
  type SlotRow = {
    id: string; classId: string; className: string;
    dayOfWeek: number; period: number;
    subjectId: string; subjectCode: string; subjectName: string;
    room: string | null; internalCode: number; teacherId: string; teacherName: string;
  };

  let slots: SlotRow[];

  if (versionId) {
    // Specific version (draft preview or named version)
    const vRows = await prisma.$queryRaw<Array<{ schoolId: string }>>`
      SELECT "schoolId" FROM "TimetableVersion"
      WHERE id = ${versionId} AND "schoolId" = ${schoolId}
    `;
    if (!vRows[0]) return NextResponse.json({ error: "Version not found." }, { status: 404 });

    slots = await prisma.$queryRaw<SlotRow[]>`
      SELECT s.id, s."classId", c.name AS "className",
             s."dayOfWeek", s.period,
             s."subjectId", sub.code AS "subjectCode", sub.name AS "subjectName",
             s.room, sub."internalCode", s."teacherId", t."fullName" AS "teacherName"
      FROM "TimetableVersionSlot" s
      JOIN "SchoolClass" c   ON c.id = s."classId"
      JOIN "Subject"     sub ON sub.id = s."subjectId"
      JOIN "Teacher"     t   ON t.id = s."teacherId"
      WHERE s."versionId" = ${versionId} AND s."teacherId" = ${teacherId}
      ORDER BY s."dayOfWeek", s.period
    `;
  } else {
    // Live published timetable (legacy TimetableSlot)
    slots = await prisma.$queryRaw<SlotRow[]>`
      SELECT ts.id, ts."classId", c.name AS "className",
             ts."dayOfWeek", ts.period,
             ts."subjectId", sub.code AS "subjectCode", sub.name AS "subjectName",
             ts.room, sub."internalCode", ts."teacherId", t."fullName" AS "teacherName"
      FROM "TimetableSlot" ts
      JOIN "SchoolClass" c   ON c.id = ts."classId"
      JOIN "Subject"     sub ON sub.id = ts."subjectId"
      JOIN "Teacher"     t   ON t.id = ts."teacherId"
      WHERE ts."teacherId" = ${teacherId} AND ts."schoolId" = ${schoolId}
      ORDER BY ts."dayOfWeek", ts.period
    `;
  }

  // ── Fetch group information for display collapse ─────────────────────────
  const electiveGroups = await prisma.electiveGroup.findMany({
    where: { schoolId },
    select: {
      id: true,
      name: true,
      scopeForm: true,
      scopeStreams: true,
      lessonsPerWeek: true,
      doublesPerWeek: true,
      members: { select: { subjectId: true } },
    },
  });

  const groupDescriptors: GroupPayloadDescriptor[] = electiveGroups
    .filter((g) => g.members.length > 0)
    .map((g) => ({
      groupId: g.id,
      name: g.name,
      subjectIds: g.members.map((m) => m.subjectId),
      lessonsPerWeek: g.lessonsPerWeek,
      doublesPerWeek: g.doublesPerWeek ?? 0,
      classIds: [],
    }));

  const displaySlots = collapseGroupSlotsForDisplay(slots, groupDescriptors);

  // ── Fetch config (operating days + template columns) ─────────────────────
  const config = await prisma.timetableConfig.findUnique({
    where: { schoolId },
    include: { columns: { orderBy: { position: "asc" } } },
  });

  const operatingDays: number[] = config?.operatingDays ?? [0, 1, 2, 3, 4];
  const templateColumns = config?.columns ?? [];

  // Compute period times from template LESSON columns
  // Period number is 1-based index among LESSON columns only
  let lessonIndex = 0;
  type PeriodTime = {
    period: number; startMinutes: number; endMinutes: number; label: string;
  };
  const periodTimes: PeriodTime[] = [];

  for (const col of templateColumns) {
    if (col.slotType === TimetableSlotType.LESSON) {
      lessonIndex++;
      const startMinutes = parseMinutes(col.startTime);
      const endMinutes   = parseMinutes(col.endTime);
      periodTimes.push({
        period: lessonIndex,
        startMinutes,
        endMinutes,
        label: `${formatMinutes(startMinutes)}–${formatMinutes(endMinutes)}`,
      });
    }
  }

  // If no template configured, fall back to a sensible default (8 periods from 8:00)
  if (periodTimes.length === 0) {
    let cursor = 8 * 60;
    for (let p = 1; p <= 8; p++) {
      const start = cursor;
      const end   = cursor + 40;
      periodTimes.push({
        period: p,
        startMinutes: start,
        endMinutes: end,
        label: `${formatMinutes(start)}–${formatMinutes(end)}`,
      });
      cursor = end;
      if (p === 3) cursor += 15; // break after period 3
      if (p === 5) cursor += 45; // lunch after period 5
    }
  }

  // ── Build special periods from non-lesson template columns ───────────────
  // Re-compute lesson index mapping for non-lesson columns
  type SpecialPeriod = {
    type: string; label: string; dayOfWeek: number | null; period: number;
  };
  const specialPeriods: SpecialPeriod[] = [];
  let lessonIdx2 = 0;
  for (const col of templateColumns) {
    if (col.slotType === TimetableSlotType.LESSON) {
      lessonIdx2++;
    } else {
      // Assign a pseudo-period number: the next lesson period that follows this column
      // For display purposes we attach it to the nearest surrounding lesson period
      const nearestPeriod = lessonIdx2 + 1; // shows before the next lesson
      specialPeriods.push({
        type:       col.slotType,
        label:      col.label ?? col.slotType,
        dayOfWeek:  null, // applies to all days
        period:     nearestPeriod,
      });
    }
  }

  // ── Fetch teacher's unavailability ───────────────────────────────────────
  const unavailability = await prisma.teacherUnavailability.findMany({
    where: { teacherId: teacher.id },
    select: { dayOfWeek: true, period: true },
  });

  // ── Compute weekly load stats ─────────────────────────────────────────────
  const subjectCounts = new Map<string, number>();
  for (const s of displaySlots) {
    subjectCounts.set(s.subjectCode, (subjectCounts.get(s.subjectCode) ?? 0) + 1);
  }

  return NextResponse.json({
    teacher: { id: teacher.id, fullName: teacher.fullName, staffId: teacher.staffId },
    days:            operatingDays,
    periods:         periodTimes,
    slots:           displaySlots,
    specialPeriods,
    unavailability,
    weeklyLessons:   displaySlots.length,
    subjectBreakdown: Array.from(subjectCounts.entries()).map(([code, count]) => ({ code, count })),
  });
}
