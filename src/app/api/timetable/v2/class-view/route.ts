/**
 * API Route: GET /api/timetable/v2/class-view
 *
 * Returns a class's full weekly timetable grid in a structured format
 * suitable for rendering a timetable table in the UI.
 * Works from a specific version (versionId) or the live published timetable.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { TimetableSlotType } from "@prisma/client";
import { collapseGroupSlotsForDisplay } from "@/lib/timetable/engineHelpers";
import type { TemplateColumn } from "@/lib/timetable/deterministicEngine";
import type { GroupPayloadDescriptor } from "@/lib/timetable/engineHelpers";

export async function GET(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId!;
  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("classId");
  const versionId = searchParams.get("versionId");

  if (!classId) {
    return NextResponse.json({ error: "classId is required" }, { status: 400 });
  }

  // Verify the class belongs to this school
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId },
    select: { id: true, name: true, form: true, stream: true },
  });

  if (!schoolClass) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  type SlotRow = {
    classId: string;
    dayOfWeek: number;
    period: number;
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    teacherId: string;
    teacherName: string;
    room: string | null;
    internalCode: number;
  };

  let slots: SlotRow[];

  if (versionId) {
    // Verify version belongs to this school
    const vRows = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM "TimetableVersion"
      WHERE id = ${versionId} AND "schoolId" = ${schoolId}`;

    if (!vRows[0]) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    slots = await prisma.$queryRaw<SlotRow[]>`
      SELECT s."classId", s."dayOfWeek", s.period,
             s."subjectId", sub.code AS "subjectCode", sub.name AS "subjectName",
             s."teacherId", t."fullName" AS "teacherName", s.room,
             sub."internalCode"
      FROM "TimetableVersionSlot" s
      JOIN "Subject" sub ON sub.id = s."subjectId"
      JOIN "Teacher" t   ON t.id = s."teacherId"
      WHERE s."versionId" = ${versionId} AND s."classId" = ${classId}
      ORDER BY s."dayOfWeek", s.period`;
  } else {
    slots = await prisma.$queryRaw<SlotRow[]>`
      SELECT ts."classId", ts."dayOfWeek", ts.period,
             ts."subjectId", sub.code AS "subjectCode", sub.name AS "subjectName",
             ts."teacherId", t."fullName" AS "teacherName", ts.room,
             sub."internalCode"
      FROM "TimetableSlot" ts
      JOIN "Subject" sub ON sub.id = ts."subjectId"
      JOIN "Teacher" t   ON t.id = ts."teacherId"
      WHERE ts."schoolId" = ${schoolId} AND ts."classId" = ${classId}
      ORDER BY ts."dayOfWeek", ts.period`;
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

  // Load template to build full grid including breaks/non-lesson slots
  const config = await prisma.timetableConfig.findUnique({
    where: { schoolId },
    include: {
      columns: { orderBy: { position: "asc" } },
    },
  });

  const templateColumns = (config?.columns ?? []) as TemplateColumn[];
  const operatingDays = config?.operatingDays ?? [0, 1, 2, 3, 4];

  // Build a slot map for quick lookup
  const slotMap = new Map<string, typeof displaySlots[0]>();
  for (const slot of displaySlots) {
    slotMap.set(`${slot.dayOfWeek}-${slot.period}`, slot);
  }

  // Build the grid rows: one row per template column per day
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // Compute lesson-column index (period number) for each template position
  let lessonIndex = 0;
  const columnPeriodMap = new Map<number, number>(); // position → period number (1-based, lesson-only)
  for (const col of templateColumns) {
    if (col.slotType === TimetableSlotType.LESSON) {
      lessonIndex++;
      columnPeriodMap.set(col.position, lessonIndex);
    }
  }

  // Build grid: columns = days, rows = template slots
  const grid = templateColumns.map((col) => {
    const period = columnPeriodMap.get(col.position) ?? null;
    const isLesson = col.slotType === TimetableSlotType.LESSON;

    const daySlots: Record<
      number,
      {
        subjectCode: string | null;
        subjectName: string | null;
        teacherName: string | null;
        room: string | null;
        internalCode: number | null;
        isEmpty: boolean;
        isGroupAnchor?: boolean;
        groupName?: string;
        groupMembers?: Array<{ subjectId: string; subjectCode: string; subjectName: string }>;
        allTeachers?: string[];
      }
    > = {};

    for (const day of operatingDays) {
      if (!isLesson || period === null) {
        daySlots[day] = {
          subjectCode: null,
          subjectName: null,
          teacherName: null,
          room: null,
          internalCode: null,
          isEmpty: false,
        };
      } else {
        const slot = slotMap.get(`${day}-${period}`);
        daySlots[day] = slot
          ? {
              subjectCode: slot.subjectCode,
              subjectName: slot.subjectName,
              teacherName: slot.teacherName,
              room: slot.room,
              internalCode: slot.internalCode,
              isEmpty: false,
              isGroupAnchor: slot.isGroupAnchor,
              groupName: slot.groupName,
              groupMembers: slot.groupMembers,
              allTeachers: slot.allTeachers,
            }
          : {
              subjectCode: null,
              subjectName: null,
              teacherName: null,
              room: null,
              internalCode: null,
              isEmpty: true,
            };
      }
    }

    return {
      position: col.position,
      startTime: col.startTime,
      endTime: col.endTime,
      slotType: col.slotType,
      session: col.session,
      label: col.label,
      period,
      daySlots,
    };
  });

  // Summary stats
  const totalSlots = templateColumns.filter((c) => c.slotType === TimetableSlotType.LESSON).length
    * operatingDays.length;
  const filledSlots = displaySlots.length;
  const emptySlots = totalSlots - filledSlots;

  // Subject distribution
  const subjectCount = new Map<string, { code: string; name: string; count: number; days: Set<number> }>();
  for (const slot of displaySlots) {
    if (!subjectCount.has(slot.subjectId)) {
      subjectCount.set(slot.subjectId, {
        code: slot.subjectCode,
        name: slot.subjectName,
        count: 0,
        days: new Set(),
      });
    }
    const entry = subjectCount.get(slot.subjectId)!;
    entry.count++;
    entry.days.add(slot.dayOfWeek);
  }

  return NextResponse.json({
    class: schoolClass,
    versionId: versionId ?? null,
    operatingDays: operatingDays.map((d) => ({
      dayOfWeek: d,
      name: DAY_NAMES[d] ?? `Day ${d}`,
    })),
    grid,
    summary: {
      totalSlots,
      filledSlots,
      emptySlots,
      fillPercent: totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0,
      subjects: Array.from(subjectCount.values()).map((s) => ({
        code: s.code,
        name: s.name,
        lessonsPerWeek: s.count,
        daysUsed: Array.from(s.days).sort(),
      })),
    },
  });
}
