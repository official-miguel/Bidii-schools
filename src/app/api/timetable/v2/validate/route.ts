/**
 * API Route: GET /api/timetable/v2/validate?versionId=...
 *
 * Validates a saved version (or the live published slots) against all
 * constraints, runs staff-shortage analysis, and returns a full report.
 *
 * If versionId is supplied the computed vulnerability snapshot is also
 * written back to TimetableVersion.vulnerabilities so the versions page
 * always reflects the latest check.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { validateTimetable } from "@/lib/timetable/validator";
import {
  analyseStaffShortages,
  type StaffShortageConfig,
} from "@/lib/timetable/liveConflictDetector";
import { buildLinkedClassGroups } from "@/lib/timetable/engineHelpers";
import type { GeneratedSlot, TemplateColumn } from "@/lib/timetable/deterministicEngine";
import { TimetableSession } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId!;
  const versionId = req.nextUrl.searchParams.get("versionId");

  // ── Load slots ─────────────────────────────────────────────────────────
  type RawSlot = {
    classId: string;
    dayOfWeek: number;
    period: number;
    subjectId: string;
    teacherId: string;
    room: string | null;
  };

  let rawSlots: RawSlot[];

  if (versionId) {
    const vRows = await prisma.$queryRaw<Array<{ schoolId: string }>>`
      SELECT "schoolId" FROM "TimetableVersion"
      WHERE id = ${versionId} AND "schoolId" = ${schoolId}`;
    if (!vRows[0]) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    rawSlots = await prisma.$queryRaw<RawSlot[]>`
      SELECT "classId", "dayOfWeek", period, "subjectId", "teacherId", room
      FROM "TimetableVersionSlot"
      WHERE "versionId" = ${versionId}`;
  } else {
    rawSlots = await prisma.$queryRaw<RawSlot[]>`
      SELECT "classId", "dayOfWeek", period, "subjectId", "teacherId", room
      FROM "TimetableSlot"
      WHERE "schoolId" = ${schoolId}`;
  }

  if (!rawSlots.length) {
    return NextResponse.json(
      { error: "No slots to validate — timetable is empty" },
      { status: 422 }
    );
  }

  // ── Load supporting data ────────────────────────────────────────────────
  const [
    config,
    requirements,
    teacherAssignments,
    teacherUnavailability,
    classes,
    subjects,
    teachers,
    electiveGroupsRaw,
  ] = await Promise.all([
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
    prisma.teacher.findMany({
      where: { schoolId },
      select: { id: true, fullName: true },
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

  // ── Build pooled-pairs data so the validator can exempt group sessions ─────
  const linkedClassGroups = buildLinkedClassGroups(electiveGroupsRaw, classes);

  // ── Run conflict validator ──────────────────────────────────────────────
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
    teachers: teachers.map((t) => ({ id: t.id, name: t.fullName })),
    requirements,
    teacherAssignments,
    teacherUnavailability,
    studentSelections: [],
    sessionPreferences: sessionPrefs,
    templateColumns: config.columns as TemplateColumn[],
    operatingDays: config.operatingDays,
    linkedClassGroups,
  });

  // ── Staff shortage analysis ─────────────────────────────────────────────
  const subjectTeacherMap = new Map<string, string[]>();
  for (const a of teacherAssignments) {
    const list = subjectTeacherMap.get(a.subjectId) ?? [];
    if (!list.includes(a.teacherId)) list.push(a.teacherId);
    subjectTeacherMap.set(a.subjectId, list);
  }

  const subjectMetaMap = new Map(
    subjects.map((s) => [s.id, { code: s.code, name: s.name }])
  );
  const classMetaMap = new Map(classes.map((c) => [c.id, c.name]));
  const reqMap = new Map<string, number>();
  for (const r of requirements) {
    reqMap.set(`${r.classId}-${r.subjectId}`, r.lessonsPerWeek);
  }

  const shortageConfig: StaffShortageConfig = {
    subjectTeacherMap,
    subjectMeta: subjectMetaMap,
    classMeta: classMetaMap,
    maxLessonsPerTeacherPerWeek:
      config.operatingDays.length * config.maxLessonsPerTeacherPerDay,
    requiredLessons: reqMap,
  };

  const staffShortages = analyseStaffShortages(shortageConfig);

  // ── Build + persist vulnerability snapshot (version only) ──────────────
  const now = new Date();
  const conflictEntries = report.issues.map((i) => ({
    type: i.rule,
    severity: (i.severity === "ERROR" ? "error" : "warning") as "error" | "warning",
    message: i.message,
    action: i.affectedClasses?.length
      ? `Affects: ${i.affectedClasses.slice(0, 3).join(", ")}${
          i.affectedClasses.length > 3 ? ` +${i.affectedClasses.length - 3} more` : ""
        }`
      : "Review the timetable for this issue.",
  }));

  const vulnerabilitySnapshot = {
    capturedAt: now.toISOString(),
    totalErrors: report.summary.errors,
    totalWarnings: report.summary.warnings,
    conflicts: conflictEntries,
    staffShortages,
  };

  if (versionId) {
    // Fire-and-forget — validation is not a write-critical path
    prisma.$executeRaw`
      UPDATE "TimetableVersion"
      SET "vulnerabilities" = ${JSON.stringify(vulnerabilitySnapshot)}::jsonb,
          "updatedAt" = ${now}
      WHERE id = ${versionId} AND "schoolId" = ${schoolId}
    `.catch(() => { /* non-fatal */ });
  }

  // ── Response (backward-compatible — existing fields unchanged) ──────────
  return NextResponse.json({
    ...report,
    // Flattened convenience fields the versions page publish-gate uses
    errorCount:   report.summary.errors,
    warningCount: report.summary.warnings,
    errors: report.issues
      .filter((i) => i.severity === "ERROR")
      .slice(0, 8)
      .map((i) => ({
        message: i.message,
        action: i.affectedClasses?.length
          ? `Affects: ${i.affectedClasses.slice(0, 3).join(", ")}`
          : "Review the timetable for this issue.",
      })),
    // New additions
    staffShortages,
    vulnerabilities: vulnerabilitySnapshot,
  });
}
