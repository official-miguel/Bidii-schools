/**
 * API Route: POST /api/timetable/v2/optimize
 *
 * Runs validation on a saved DRAFT version and returns the validation report.
 * The deterministic engine doesn't have a separate optimization pass —
 * placement quality is achieved through the scoring system during generation.
 * This endpoint re-validates an existing version and applies any slot moves
 * submitted by the client (manual adjustments).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { validateTimetable } from "@/lib/timetable/validator";
import { buildLinkedClassGroups } from "@/lib/timetable/engineHelpers";
import type { GeneratedSlot } from "@/lib/timetable/deterministicEngine";
import { TimetableSession } from "@prisma/client";
import type { TemplateColumn } from "@/lib/timetable/deterministicEngine";

const schema = z.object({
  versionId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const schoolId = user.schoolId!;
  const { versionId } = body.data;

  // Verify version ownership
  const vRows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM "TimetableVersion"
    WHERE id = ${versionId} AND "schoolId" = ${schoolId}`;

  if (!vRows[0]) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // Load slots with metadata
  type RawSlot = {
    classId: string;
    className: string;
    dayOfWeek: number;
    period: number;
    subjectId: string;
    subjectCode: string;
    teacherId: string;
    teacherName: string;
    room: string | null;
  };

  const rawSlots = await prisma.$queryRaw<RawSlot[]>`
    SELECT s."classId", c.name AS "className",
           s."dayOfWeek", s.period,
           s."subjectId", sub.code AS "subjectCode", sub.name AS "subjectName",
           s."teacherId", t."fullName" AS "teacherName", s.room
    FROM "TimetableVersionSlot" s
    JOIN "SchoolClass" c   ON c.id = s."classId"
    JOIN "Subject"     sub ON sub.id = s."subjectId"
    JOIN "Teacher"     t   ON t.id = s."teacherId"
    WHERE s."versionId" = ${versionId}`;

  if (!rawSlots.length) {
    return NextResponse.json({ error: "No slots in this version" }, { status: 422 });
  }

  // Load config and requirements for validation
  const [config, requirements, teacherAssignments, teacherUnavailability, classes, subjects, electiveGroupsRaw] =
    await Promise.all([
      prisma.timetableConfig.findUnique({
        where: { schoolId },
        include: {
          columns: { orderBy: { position: "asc" } },
          preferences: true,
        },
      }),
      prisma.subjectLessonRequirement.findMany({
        where: { schoolId },
        select: { classId: true, subjectId: true, lessonsPerWeek: true },
      }),
      prisma.classSubjectTeacher.findMany({
        where: { schoolClass: { schoolId } },
        select: { classId: true, subjectId: true, teacherId: true },
      }),
      prisma.teacherUnavailability.findMany({
        where: { teacher: { schoolId } },
        select: { teacherId: true, dayOfWeek: true, period: true },
      }),
      prisma.schoolClass.findMany({
        where: { schoolId },
        select: { id: true, name: true, form: true, stream: true },
      }),
      prisma.subject.findMany({
        where: { schoolId },
        select: { id: true, code: true, name: true, internalCode: true, doubleLesson: true },
      }),
      prisma.electiveGroup.findMany({
        where: { schoolId },
        select: {
          id: true,
          scopeForm: true,
          scopeStreams: true,
          members: { select: { subjectId: true } },
        },
      }),
    ]);

  if (!config) {
    return NextResponse.json(
      { error: "Timetable template not configured" },
      { status: 400 }
    );
  }

  const slots: GeneratedSlot[] = rawSlots.map((s) => ({
    classId: s.classId,
    dayOfWeek: s.dayOfWeek,
    period: s.period,
    subjectId: s.subjectId,
    teacherId: s.teacherId,
    room: s.room,
  }));

  const sessionPrefs = config.preferences
    .filter((p) => p.subjectCode && p.preferredSession)
    .map((p) => ({
      subjectCode: p.subjectCode!,
      preferredSession: p.preferredSession as TimetableSession,
      isHard: p.isHard,
    }));

  const linkedClassGroups = buildLinkedClassGroups(electiveGroupsRaw, classes);

  const report = validateTimetable({
    slots,
    classes: classes.map((c) => ({ id: c.id, name: c.name, form: c.form })),
    subjects: subjects.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      internalCode: s.internalCode,
      doubleLesson: s.doubleLesson,
    })),
    teachers: [],
    requirements,
    teacherAssignments,
    teacherUnavailability,
    studentSelections: [],
    sessionPreferences: sessionPrefs,
    templateColumns: config.columns as TemplateColumn[],
    operatingDays: config.operatingDays,
    linkedClassGroups,
  });

  return NextResponse.json({
    versionId,
    validation: {
      valid: report.valid,
      passedRules: report.passedRules,
      failedRules: report.failedRules,
      issues: report.issues,
      summary: report.summary,
    },
  });
}
