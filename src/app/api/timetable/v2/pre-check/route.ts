/**
 * API Route: POST /api/timetable/v2/pre-check
 *
 * Runs all pre-generation checks without actually generating a timetable.
 * Returns a detailed report of blocking issues, warnings, and approvals needed.
 * Call this before /api/timetable/v2/generate to surface problems early.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { runPreGenerationChecks } from "@/lib/timetable/preGenerationChecks";
import { checkFeasibility } from "@/lib/timetable/regenerationController";
import { getLessonColumns, buildGroupAwarePayload, mergeGroupTeachers, resolveGroupAnchors } from "@/lib/timetable/engineHelpers";
import type { GroupPayloadDescriptor } from "@/lib/timetable/engineHelpers";
import type { TemplateColumn } from "@/lib/timetable/deterministicEngine";
import { TimetableSession } from "@prisma/client";

const schema = z.object({
  classIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "view"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId!;
  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { classIds } = body.data;

  const [
    classesRaw,
    requirements,
    teacherAssignments,
    teacherUnavailability,
    studentSelections,
    timetableConfig,
    sessionPreferences,
    electiveGroupsRaw,
    classElectiveTeachersRaw,
    formElectiveTeachersRaw,
  ] = await Promise.all([
    prisma.schoolClass.findMany({
      where: {
        schoolId,
        ...(classIds?.length ? { id: { in: classIds } } : {}),
      },
      select: { id: true, name: true, form: true, stream: true },
      orderBy: [{ form: "asc" }, { name: "asc" }],
    }),
    prisma.subjectLessonRequirement.findMany({
      where: { schoolId },
      include: {
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            internalCode: true,
            doubleLesson: true,
            requiresSpecialRoom: true,
          },
        },
      },
    }),
    prisma.classSubjectTeacher.findMany({
      where: { schoolClass: { schoolId } },
      select: { classId: true, subjectId: true, teacherId: true },
    }),
    prisma.teacherUnavailability.findMany({
      where: { teacher: { schoolId } },
      select: { teacherId: true, dayOfWeek: true, period: true },
    }),
    prisma.studentElective.findMany({
      where: { student: { schoolId, archivedAt: null } },
      select: {
        studentId: true,
        student: { select: { classId: true } },
        subjectId: true,
      },
    }),
    prisma.timetableConfig.findUnique({
      where: { schoolId },
      include: {
        columns: { orderBy: { position: "asc" } },
        preferences: true,
      },
    }),
    prisma.timetablePreference.findMany({
      where: { config: { schoolId } },
    }),
    // Elective groups — needed to collapse group subjects before pre-checking
    prisma.electiveGroup.findMany({
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
    }),
    // Per-class elective group teacher assignments
    prisma.classElectiveGroupTeacher.findMany({
      where: { schoolId },
      select: { groupId: true, classId: true, subjectId: true, teacherId: true },
    }),
    // Form-wide elective group teacher assignments (fallback source when
    // ClassElectiveGroupTeacher rows are absent — assigned via Requirements page)
    prisma.electiveGroupTeacher.findMany({
      where: { schoolId },
      select: { groupId: true, subjectId: true, teacherId: true },
    }),
  ]);

  if (!timetableConfig) {
    return NextResponse.json({
      canProceed: false,
      requiresApproval: false,
      issues: [
        {
          type: "CONFIGURATION_ERROR",
          severity: "BLOCKING",
          message: "Timetable template not configured. Set up the template first.",
          suggestedAction: "Visit Timetable → Template Setup",
        },
      ],
      summary: { blockingIssues: 1, warnings: 0, approvalsNeeded: 0 },
      feasibility: null,
    });
  }

  const templateColumns = timetableConfig.columns as TemplateColumn[];
  const lessonColumns = getLessonColumns(templateColumns);

  if (lessonColumns.length === 0) {
    return NextResponse.json({
      canProceed: false,
      requiresApproval: false,
      issues: [
        {
          type: "CONFIGURATION_ERROR",
          severity: "BLOCKING",
          message: "Template has no lesson slots. Add LESSON columns to the template.",
          suggestedAction: "Visit Timetable → Template Setup and add lesson columns",
        },
      ],
      summary: { blockingIssues: 1, warnings: 0, approvalsNeeded: 0 },
      feasibility: null,
    });
  }

  // Build engine inputs
  const subjectMap = new Map<
    string,
    { id: string; code: string; name: string; type: string; internalCode: number; doubleLesson: boolean; requiresSpecialRoom: string | null }
  >();
  for (const req of requirements) {
    if (!subjectMap.has(req.subject.id)) {
      subjectMap.set(req.subject.id, req.subject);
    }
  }

  const formStreamCount = new Map<number, number>();
  const engineClasses = classesRaw.map((cls) => {
    const count = formStreamCount.get(cls.form) ?? 0;
    formStreamCount.set(cls.form, count + 1);
    return { id: cls.id, name: cls.name, form: cls.form, stream: cls.stream, streamIndex: count };
  });

  const engineSubjects = Array.from(subjectMap.values()).map((s) => ({
    id: s.id,
    internalCode: s.internalCode,
    code: s.code,
    name: s.name,
    doubleLesson: s.doubleLesson,
    requiresSpecialRoom: s.requiresSpecialRoom,
  }));

  const rawRequirements = requirements
    .filter((r) => !classIds?.length || classIds.includes(r.classId))
    .map((r) => ({
      subjectId: r.subjectId,
      classId: r.classId,
      lessonsPerWeek: r.lessonsPerWeek,
    }));

  // ── Merge form-wide and per-class group teacher assignments ─────────────
  // Teachers assigned via Timetable → Requirements land in ElectiveGroupTeacher
  // (form-wide).  Teachers assigned via the class profile page land in
  // ClassElectiveGroupTeacher (per-class).  The engine reads only the per-class
  // table, so we synthesise per-class equivalents from the form-wide rows for
  // any class that has no existing per-class assignment for that pairing.
  const mergedClassElectiveTeachers = mergeGroupTeachers(
    formElectiveTeachersRaw,
    classElectiveTeachersRaw,
    electiveGroupsRaw,
    classesRaw,
  );

  // ── Build group-aware payload (same logic as the generate route) ──────────
  // Without this step, every elective group subject would appear as a
  // separate requirement with no teacher → false BLOCKING errors for every
  // class that has group teachers assigned via ClassElectiveGroupTeacher.
  //
  // Only include a class in a group descriptor if it actually has
  // ClassElectiveGroupTeacher rows for that group. Scope-eligible classes
  // without assignments are left in the raw requirements so the preCheck
  // surfaces them as genuine missing-teacher errors.
  const groupClassesWithTeachers = new Map<string, Set<string>>();
  for (const gt of mergedClassElectiveTeachers) {
    if (!groupClassesWithTeachers.has(gt.groupId)) {
      groupClassesWithTeachers.set(gt.groupId, new Set());
    }
    groupClassesWithTeachers.get(gt.groupId)!.add(gt.classId);
  }

  const groupDescriptors: GroupPayloadDescriptor[] = electiveGroupsRaw
    .filter((g) => g.members.length > 0)
    .map((g) => {
      const classesWithTeachersForGroup = groupClassesWithTeachers.get(g.id) ?? new Set<string>();
      const inScope = classesRaw.filter((cls) => {
        if (g.scopeForm !== 0 && cls.form !== g.scopeForm) return false;
        if (g.scopeForm !== 0 && g.scopeStreams.length > 0 && !g.scopeStreams.includes(cls.stream ?? "")) return false;
        return classesWithTeachersForGroup.has(cls.id);
      });
      return {
        groupId:        g.id,
        name:           g.name,
        subjectIds:     g.members.map((m) => m.subjectId),
        lessonsPerWeek: g.lessonsPerWeek,
        doublesPerWeek: g.doublesPerWeek ?? 0,
        classIds:       inScope.map((c) => c.id),
      };
    })
    .filter((d) => d.classIds.length >= 1);

  // Auto-resolve anchor conflicts before building the solver payload
  const resolvedGroupDescriptors = resolveGroupAnchors(groupDescriptors);

  // ── Drop requirements that have no teacher assigned ──────────────────────
  // Mirrors the same filter applied in the generate route so the pre-check
  // report reflects exactly what the solver will attempt.  Subjects stored in
  // SubjectLessonRequirement without a teacher are listed in
  // skippedNoTeacher[] and reported as INFO items rather than BLOCKING errors.
  const assignedPairs = new Set<string>(); // "classId:subjectId"
  for (const a of teacherAssignments) {
    assignedPairs.add(`${a.classId}:${a.subjectId}`);
  }
  for (const gt of mergedClassElectiveTeachers) {
    assignedPairs.add(`${gt.classId}:${gt.subjectId}`);
  }
  for (const gd of resolvedGroupDescriptors) {
    const anchorId = gd.subjectIds[0];
    for (const classId of gd.classIds) {
      assignedPairs.add(`${classId}:${anchorId}`);
    }
  }

  const skippedNoTeacher: { classId: string; subjectId: string; className: string; subjectCode: string }[] = [];
  const filteredRequirements = rawRequirements.filter((r) => {
    if (assignedPairs.has(`${r.classId}:${r.subjectId}`)) return true;
    const cls = classesRaw.find((c) => c.id === r.classId);
    const sub = subjectMap.get(r.subjectId);
    skippedNoTeacher.push({
      classId: r.classId,
      subjectId: r.subjectId,
      className: cls?.name ?? r.classId,
      subjectCode: sub?.code ?? r.subjectId,
    });
    return false;
  });

  const groupPayload = buildGroupAwarePayload(
    filteredRequirements,
    teacherAssignments,
    resolvedGroupDescriptors,
    mergedClassElectiveTeachers,
  );

  // Use the group-collapsed requirements and merged assignments for all checks
  const engineRequirements = groupPayload.requirements;
  const mergedTeacherAssignments = groupPayload.teacherAssignments;

  const studentSelectionsInput = studentSelections.map((sel) => ({
    studentId: sel.studentId,
    classId: sel.student.classId,
    subjectId: sel.subjectId,
  }));

  const sessionPrefs = sessionPreferences
    .filter((p) => p.subjectCode && p.preferredSession)
    .map((p) => ({
      subjectCode: p.subjectCode!,
      preferredSession: p.preferredSession as TimetableSession,
      isHard: p.isHard,
    }));

  // Load teacher info — include group teachers
  const allTeacherIds = [
    ...new Set([
      ...teacherAssignments.map((a) => a.teacherId),
      ...mergedClassElectiveTeachers.map((g) => g.teacherId),
    ]),
  ];
  const teachersRaw = await prisma.teacher.findMany({
    where: { id: { in: allTeacherIds } },
    select: { id: true, fullName: true },
  });

  // Deduplicate subjects for the preCheck — use the subjectMap which has type
  const subjectsForCheck = Array.from(subjectMap.values()).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    type: (s.type ?? "CORE") as "CORE" | "ELECTIVE",
    doubleLesson: s.doubleLesson,
  }));

  // Run pre-generation checks against the collapsed requirements and merged
  // teacher assignments so elective group subjects are correctly accounted for
  const preCheck = runPreGenerationChecks({
    subjects: subjectsForCheck,
    classes: engineClasses,
    requirements: engineRequirements,
    teacherAssignments: mergedTeacherAssignments,
    studentSelections: studentSelectionsInput,
    templateColumns: lessonColumns.length,
    operatingDays: timetableConfig.operatingDays,
    groups: resolvedGroupDescriptors,
  });

  // Run feasibility check (capacity math) against the same collapsed data
  const feasibility = checkFeasibility({
    classes: engineClasses,
    subjects: engineSubjects,
    teachers: teachersRaw.map((t) => ({ id: t.id, name: t.fullName })),
    requirements: engineRequirements,
    teacherAssignments: mergedTeacherAssignments,
    teacherUnavailability,
    studentSelections: studentSelectionsInput,
    sessionPreferences: sessionPrefs,
    templateColumns,
    operatingDays: timetableConfig.operatingDays,
  });

  // Merge feasibility blocking issues into pre-check results
  const allIssues = [...preCheck.issues];

  // Surface teacherless-subject skips as INFO items so the admin can see
  // exactly which subjects were excluded without blocking the report.
  for (const s of skippedNoTeacher) {
    allIssues.push({
      type: "MISSING_TEACHER_ASSIGNMENT" as const,
      severity: "INFO" as const,
      message: `${s.className}: ${s.subjectCode} has no teacher assigned — will be excluded from the generated timetable`,
      affectedSubject: s.subjectId,
      affectedClasses: [s.classId],
      suggestedAction: "Go to Timetable → Subject Teachers and assign a teacher to include this subject in the timetable",
    });
  }

  for (const issue of feasibility.blockingIssues) {
    allIssues.push({
      type: "INSUFFICIENT_CAPACITY" as const,
      severity: "BLOCKING" as const,
      message: issue,
      suggestedAction: "Reduce lesson requirements or add more template columns",
    });
  }

  for (const warning of feasibility.warnings) {
    allIssues.push({
      type: "INSUFFICIENT_CAPACITY" as const,
      severity: "WARNING" as const,
      message: warning,
    });
  }

  const blockingIssues = allIssues.filter((i) => i.severity === "BLOCKING").length;
  const warnings = allIssues.filter((i) => i.severity === "WARNING").length;
  const approvalsNeeded = allIssues.filter((i) => i.requiresApproval).length;

  return NextResponse.json({
    canProceed: blockingIssues === 0 && feasibility.feasible,
    requiresApproval: approvalsNeeded > 0,
    issues: allIssues,
    summary: { blockingIssues, warnings, approvalsNeeded },
    feasibility: {
      feasible: feasibility.feasible,
      blockingIssues: feasibility.blockingIssues,
      warnings: feasibility.warnings,
    },
    config: {
      classCount: classesRaw.length,
      subjectCount: engineSubjects.length,
      teacherCount: teachersRaw.length,
      requirementsCount: engineRequirements.length,
      lessonSlotsPerWeek: lessonColumns.length * timetableConfig.operatingDays.length,
      totalLessonsRequired: engineRequirements.reduce((s, r) => s + r.lessonsPerWeek, 0),
      skippedNoTeacher: skippedNoTeacher.length,
    },
  });
}
