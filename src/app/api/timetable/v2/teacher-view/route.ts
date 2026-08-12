import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { computePeriodTimes } from "@/lib/scheduleTimes";
import { collapseGroupSlotsForDisplay } from "@/lib/timetable/engineHelpers";
import type { GroupPayloadDescriptor } from "@/lib/timetable/engineHelpers";

// ── GET /api/timetable/v2/teacher-view ────────────────────────────────────
// Returns the personal weekly timetable grid for a teacher.
// Accessible to the teacher themselves (TEACHER role, own teacherId),
// and to the principal.
//
// Query params:
//   teacherId — required for PRINCIPAL callers; auto-resolved for TEACHER callers.
//   versionId — optional; defaults to the published version / legacy slots.

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

  // Build group descriptors for collapse function
  const groupDescriptors: GroupPayloadDescriptor[] = electiveGroups
    .filter((g) => g.members.length > 0)
    .map((g) => ({
      groupId: g.id,
      name: g.name,
      subjectIds: g.members.map((m) => m.subjectId),
      lessonsPerWeek: g.lessonsPerWeek,
      doublesPerWeek: g.doublesPerWeek ?? 0,
      classIds: [], // Not needed for display collapse
    }));

  // Collapse slots by group for display
  const displaySlots = collapseGroupSlotsForDisplay(slots, groupDescriptors);

  // ── Fetch config for period-to-time mapping ──────────────────────────────
  const config = await prisma.timetableConfig.findUnique({
    where: { schoolId },
  });

  const DEFAULTS = {
    periodsPerDay: 8, dayStartTime: "08:00", periodDurationMinutes: 40,
    breakAfterPeriod: null, breakDurationMinutes: 15,
    lunchAfterPeriod: null, lunchDurationMinutes: 45,
  };
  const periodTimes = computePeriodTimes({ ...DEFAULTS, ...(config ?? {}) });

  // ── Fetch special periods (non-lesson slots) ─────────────────────────────
  const specialPeriods = await prisma.$queryRaw<
    Array<{ type: string; label: string; dayOfWeek: number | null; period: number }>
  >`SELECT type, label, "dayOfWeek", period
    FROM "SpecialPeriod"
    WHERE "schoolId" = ${schoolId} AND "isActive" = true
    ORDER BY period`;

  // ── Fetch operating days ────────────────────────────────────────────────
  const operatingDays = await prisma.$queryRaw<Array<{ dayOfWeek: number; isActive: boolean }>>`
    SELECT "dayOfWeek", "isActive" FROM "OperatingDay"
    WHERE "schoolId" = ${schoolId} ORDER BY "dayOfWeek"
  `;

  const activeDays = operatingDays.filter((d) => d.isActive).map((d) => d.dayOfWeek);
  const days = activeDays.length > 0 ? activeDays : [0, 1, 2, 3, 4];

  // ── Fetch teacher's unavailability ──────────────────────────────────────
  const unavailability = await prisma.teacherUnavailability.findMany({
    where: { teacherId: teacher.id },
    select: { dayOfWeek: true, period: true },
  });

  // ── Compute weekly load stats ───────────────────────────────────────────
  const subjectCounts = new Map<string, number>();
  for (const s of displaySlots) {
    subjectCounts.set(s.subjectCode, (subjectCounts.get(s.subjectCode) ?? 0) + 1);
  }

  return NextResponse.json({
    teacher: { id: teacher.id, fullName: teacher.fullName, staffId: teacher.staffId },
    days,
    periods:         periodTimes,
    slots: displaySlots,
    specialPeriods,
    unavailability,
    weeklyLessons:   displaySlots.length,
    subjectBreakdown: Array.from(subjectCounts.entries()).map(([code, count]) => ({ code, count })),
  });
}
