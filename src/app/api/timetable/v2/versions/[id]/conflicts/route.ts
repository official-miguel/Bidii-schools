/**
 * API Route: GET /api/timetable/v2/versions/[id]/conflicts
 *
 * Runs the live conflict detector against a specific version's slots
 * and returns the full conflict map. Used by the builder UI on load
 * and after batch operations to check the current state server-side.
 *
 * Group-subject awareness
 * ───────────────────────
 * The DB stores one raw TimetableVersionSlot per (class, subject, teacher)
 * fan-out entry.  Without group metadata the conflict detector would see N
 * different subjects at the same (classId, period) as CLASS_DOUBLE_BOOKED
 * false positives, and same-teacher same-subject cross-class slots (pooled
 * teaching) as TEACHER_DOUBLE_BOOKED false positives.
 *
 * We fix this by:
 *   1. Loading ElectiveGroup membership so we can build a subjectId → groupId
 *      lookup covering every group in this school.
 *   2. Stamping groupId, isGroupAnchor, and groupName onto each LiveSlot
 *      before calling detectLiveConflicts — the same fields the builder UI
 *      sets on collapsed display slots.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import {
  detectLiveConflicts,
  type LiveSlot,
  type ConflictEngineConfig,
} from "@/lib/timetable/liveConflictDetector";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId!;

  // Verify version ownership
  const vRows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion"
    WHERE id = ${params.id} AND "schoolId" = ${schoolId}`;

  if (!vRows[0]) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // Load all slots with display metadata
  type RawSlot = {
    id: string;
    classId: string;
    className: string;
    classForm: number;
    dayOfWeek: number;
    period: number;
    subjectId: string;
    subjectCode: string;
    teacherId: string;
    teacherName: string;
    room: string | null;
    isManual: boolean;
    isLocked: boolean;
  };

  const rawSlots = await prisma.$queryRaw<RawSlot[]>`
    SELECT s.id, s."classId", c.name AS "className", c.form AS "classForm",
           s."dayOfWeek", s.period,
           s."subjectId", sub.code AS "subjectCode",
           s."teacherId", t."fullName" AS "teacherName",
           s.room, s."isManual", s."isLocked"
    FROM "TimetableVersionSlot" s
    JOIN "SchoolClass" c   ON c.id = s."classId"
    JOIN "Subject"     sub ON sub.id = s."subjectId"
    JOIN "Teacher"     t   ON t.id = s."teacherId"
    WHERE s."versionId" = ${params.id}`;

  if (rawSlots.length === 0) {
    return NextResponse.json({
      totalErrors: 0,
      totalWarnings: 0,
      conflictList: [],
      conflictMapEntries: [],
    });
  }

  // ── Load supporting data in parallel ────────────────────────────────────
  const [config, unavailRows, requirements, electiveGroups, doubleSubjectsRaw] =
    await Promise.all([
      prisma.timetableConfig.findUnique({
        where: { schoolId },
        include: { columns: { orderBy: { position: "asc" } } },
      }),
      prisma.teacherUnavailability.findMany({
        where: { teacher: { schoolId } },
        select: { teacherId: true, dayOfWeek: true, period: true },
      }),
      prisma.subjectLessonRequirement.findMany({
        where: { schoolId },
        select: { classId: true, subjectId: true, lessonsPerWeek: true },
      }),
      // Group membership — needed to tag each slot with its groupId so the
      // conflict detector can distinguish elective fan-out from real conflicts.
      prisma.electiveGroup.findMany({
        where: { schoolId },
        select: {
          id: true,
          name: true,
          members: { select: { subjectId: true } },
        },
      }),
      prisma.subject.findMany({
        where: { schoolId, doubleLesson: true },
        select: { id: true },
      }),
    ]);

  const operatingDays = config?.operatingDays ?? [0, 1, 2, 3, 4];
  const lessonCols    = (config?.columns ?? []).filter((c) => c.slotType === "LESSON");

  // ── Build group-membership lookups ──────────────────────────────────────
  // subjectId → { groupId, groupName, isAnchor }
  // A subject can in theory belong to more than one group (shared member) but
  // for conflict-detection purposes we only need one group per subject — we
  // use the first match.  The anchor is the first member of each group.
  const subjectGroupMap = new Map<
    string,
    { groupId: string; groupName: string; isAnchor: boolean }
  >();
  for (const group of electiveGroups) {
    const anchorSubjectId = group.members[0]?.subjectId;
    for (const member of group.members) {
      if (!subjectGroupMap.has(member.subjectId)) {
        subjectGroupMap.set(member.subjectId, {
          groupId:   group.id,
          groupName: group.name,
          isAnchor:  member.subjectId === anchorSubjectId,
        });
      }
    }
  }

  // ── Build unavailability map ─────────────────────────────────────────────
  const unavailabilityMap = new Map<string, Set<string>>();
  for (const row of unavailRows) {
    if (!unavailabilityMap.has(row.teacherId)) {
      unavailabilityMap.set(row.teacherId, new Set());
    }
    unavailabilityMap.get(row.teacherId)!.add(`${row.dayOfWeek}-${row.period}`);
  }

  // ── Build required lessons map ───────────────────────────────────────────
  const requiredLessons = new Map<string, number>();
  for (const req of requirements) {
    requiredLessons.set(`${req.classId}-${req.subjectId}`, req.lessonsPerWeek);
  }

  // ── Build double subjects set ────────────────────────────────────────────
  const doubleSubjectIds = new Set(doubleSubjectsRaw.map((s) => s.id));
  const doubleSubjects   = new Set<string>();
  for (const slot of rawSlots) {
    if (doubleSubjectIds.has(slot.subjectId)) {
      doubleSubjects.add(`${slot.classId}-${slot.subjectId}`);
    }
  }

  // ── Map raw DB rows → LiveSlot, stamping group metadata ─────────────────
  // groupId   — lets the conflict detector apply the pooled-teaching exemption
  //             (Conflict 3: same teacher, same subject, same group, diff class)
  // isGroupAnchor / groupName — lets the class double-booking pass recognise
  //             that multiple subjects at the same (class, period) are an
  //             intentional elective fan-out, not a scheduling error
  const liveSlots: LiveSlot[] = rawSlots.map((s) => {
    const groupMeta = subjectGroupMap.get(s.subjectId);
    return {
      id:           s.id,
      classId:      s.classId,
      className:    s.className,
      dayOfWeek:    s.dayOfWeek,
      period:       s.period,
      subjectId:    s.subjectId,
      subjectCode:  s.subjectCode,
      teacherId:    s.teacherId,
      teacherName:  s.teacherName,
      room:         s.room,
      isDouble:     doubleSubjectIds.has(s.subjectId),
      isManual:     s.isManual,
      isLocked:     s.isLocked,
      // Group metadata — undefined for non-group subjects
      groupId:      groupMeta?.groupId ?? null,
      isGroupAnchor: groupMeta?.isAnchor ?? false,
      groupName:    groupMeta?.groupName,
    };
  });

  // ── Build classId → form map ─────────────────────────────────────────────
  const classFormMap = new Map<string, number>();
  for (const s of rawSlots) {
    if (!classFormMap.has(s.classId)) classFormMap.set(s.classId, s.classForm);
  }

  const engineConfig: ConflictEngineConfig = {
    operatingDays,
    periodsPerDay:              lessonCols.length,
    blockedSlots:               new Set<string>(),
    maxLessonsPerTeacherPerDay: config?.maxLessonsPerTeacherPerDay ?? 6,
    teacherUnavailability:      unavailabilityMap,
    requiredLessons,
    doubleSubjects,
    classFormMap,
  };

  const result = detectLiveConflicts(liveSlots, engineConfig);

  // Serialize the Map to an array for JSON transport
  const conflictMapEntries = Array.from(result.conflictMap.entries()).map(
    ([key, conflicts]) => ({ key, conflicts })
  );

  return NextResponse.json({
    totalErrors:       result.totalErrors,
    totalWarnings:     result.totalWarnings,
    conflictList:      result.conflictList,
    conflictMapEntries,
  });
}
