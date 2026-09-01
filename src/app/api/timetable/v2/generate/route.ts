/**
 * API Route: POST /api/timetable/v2/generate
 *
 * Generates a versioned timetable draft using the CP-SAT constraint solver
 * (Google OR-Tools).  The solver is a complete solver — it either finds the
 * optimal solution in one call or proves the problem is infeasible.
 * No retry loop is used.
 *
 * Requires the timetable-solver Python service to be running.
 * Set TIMETABLE_SOLVER_URL in your environment (default: http://localhost:8080).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { randomUUID } from "crypto";
import { generateWithValidation } from "@/lib/timetable/regenerationController";
import { runPreGenerationChecks } from "@/lib/timetable/preGenerationChecks";
import { getLessonColumns, buildLinkedClassGroups, buildGroupAwarePayload, fanOutGroupSlots, mergeGroupTeachers, resolveGroupAnchors } from "@/lib/timetable/engineHelpers";
import type { GroupPayloadDescriptor } from "@/lib/timetable/engineHelpers";
import { analyseStaffShortages, analyseActualShortages, type StaffShortageConfig, type ActualShortageConfig } from "@/lib/timetable/liveConflictDetector";
import type { TemplateColumn, EngineSubject, EngineClass } from "@/lib/timetable/deterministicEngine";
import { TimetableSession } from "@prisma/client";

const schema = z.object({
  name: z.string().trim().min(1).max(80).default("Generated draft"),
  description: z.string().trim().max(300).optional(),
  academicYear: z.string().trim().max(10).optional(),
  term: z.number().int().min(1).max(4).nullable().optional(),
  classIds: z.array(z.string()).optional(),
  replaceVersionId: z.string().optional(),
  maxAttempts: z.number().int().min(1).max(20).optional().default(10),
  bypassPreChecks: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    return await _handlePost(req);
  } catch (err: unknown) {
    // Log the full error (stack + cause) so Vercel logs show the actual source
    console.error("[timetable/v2/generate] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "An unexpected error occurred while generating the timetable.", detail: message },
      { status: 500 }
    );
  }
}

async function _handlePost(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("TIMETABLE", "manage"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schoolId = user.schoolId!;
  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const opts = body.data;

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
        ...(opts.classIds?.length ? { id: { in: opts.classIds } } : {}),
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
      select: { studentId: true, student: { select: { classId: true } }, subjectId: true },
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
    // Elective groups — used to build the hard co-scheduling constraint
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
    // Per-class elective group teacher assignments (replaces ClassSubjectTeacher for group subjects)
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
    return NextResponse.json(
      { error: "Timetable template not configured. Set up the template first." },
      { status: 400 }
    );
  }

  if (classesRaw.length === 0) {
    return NextResponse.json(
      { error: "No classes found. Register classes before generating." },
      { status: 400 }
    );
  }

  const templateColumns = timetableConfig.columns as TemplateColumn[];
  const lessonColumns = getLessonColumns(templateColumns);
  if (lessonColumns.length === 0) {
    return NextResponse.json(
      { error: "Template has no lesson slots." },
      { status: 400 }
    );
  }

  // Build subject map and engine inputs
  const subjectMap = new Map<string, EngineSubject & { type: string }>();
  for (const req of requirements) {
    if (!subjectMap.has(req.subject.id)) {
      subjectMap.set(req.subject.id, {
        id: req.subject.id,
        internalCode: req.subject.internalCode,
        code: req.subject.code,
        name: req.subject.name,
        doubleLesson: req.subject.doubleLesson,
        requiresSpecialRoom: req.subject.requiresSpecialRoom,
        type: (req.subject as unknown as { type?: string }).type ?? "CORE",
      });
    }
  }

  const formStreamCount = new Map<number, number>();
  const engineClasses: EngineClass[] = classesRaw.map((cls) => {
    const count = formStreamCount.get(cls.form) ?? 0;
    formStreamCount.set(cls.form, count + 1);
    return { id: cls.id, name: cls.name, form: cls.form, stream: cls.stream, streamIndex: count };
  });

  const engineRequirements = requirements
    .filter((r) => !opts.classIds?.length || opts.classIds.includes(r.classId))
    .map((r) => ({
      subjectId: r.subjectId,
      classId: r.classId,
      lessonsPerWeek: r.lessonsPerWeek,
    }));

  // ── Synthesise requirements for group anchor subjects ──────────────────
  // Elective group subjects are often NOT listed in SubjectLessonRequirement
  // (they are pure group subjects managed only via ElectiveGroup + its teacher
  // tables).  Without a requirement row the solver never schedules them.
  // We synthesise one requirement per (classId, anchorSubjectId) pair using
  // the group's lessonsPerWeek so the solver knows to place those slots.
  // Non-anchor group subjects are intentionally omitted here — buildGroupAwarePayload
  // drops them anyway and they are restored by fanOutGroupSlots post-solve.
  //
  // This must happen BEFORE mergeGroupTeachers / groupDescriptors so the
  // synthesised rows are visible to the teacher-assignment filter below.
  const existingReqPairs = new Set(engineRequirements.map((r) => `${r.classId}:${r.subjectId}`));

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

  // ── Group-aware payload: collapse group subjects to one anchor each ────────
  // Build GroupPayloadDescriptor for every elective group that has members.
  //
  // IMPORTANT: only include a class in a group descriptor if it actually has
  // at least one ClassElectiveGroupTeacher row for that group. Including
  // scope-eligible classes with no teacher assignments causes two bugs:
  //   1. buildGroupAwarePayload adds them to groupOwnership → their anchor
  //      requirement has no synthetic teacher assignment → pre-check fires a
  //      false BLOCKING "no teacher" error.
  //   2. fanOutGroupSlots produces empty fan-out entries for those classes
  //      which are silently dropped → no timetable slots generated for them.
  const linkedClassGroupsList = buildLinkedClassGroups(electiveGroupsRaw, classesRaw);

  // groupId → Set of classIds that have ≥1 ClassElectiveGroupTeacher row
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
        // Only include classes that have teachers actually assigned in this group
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

  // Auto-resolve anchor conflicts: if two groups share the same first subject,
  // rotate one group's member list so each gets a unique anchor before the
  // solver payload is built.
  const resolvedGroupDescriptors = resolveGroupAnchors(groupDescriptors);

  // Inject synthesised requirements for group anchor subjects that have no
  // SubjectLessonRequirement row.  We do this after resolvedGroupDescriptors
  // is built so we use the final (possibly rotated) anchor subjects.
  for (const gd of resolvedGroupDescriptors) {
    const anchorSubjectId = gd.subjectIds[0];
    for (const classId of gd.classIds) {
      const key = `${classId}:${anchorSubjectId}`;
      if (!existingReqPairs.has(key)) {
        engineRequirements.push({
          subjectId: anchorSubjectId,
          classId,
          lessonsPerWeek: gd.lessonsPerWeek,
        });
        existingReqPairs.add(key);
      }
    }
  }

  // ── Drop requirements that have no teacher assigned ──────────────────────
  // Subjects stored in SubjectLessonRequirement without a matching
  // ClassSubjectTeacher row (or elective group teacher row) cannot be
  // scheduled.  Rather than blocking generation with a hard error we silently
  // exclude them so the rest of the timetable can still be produced.
  // The caller can run /api/timetable/v2/pre-check to see the full list of
  // subjects that were skipped for this reason.
  const assignedPairs = new Set<string>(); // "classId:subjectId"
  for (const a of teacherAssignments) {
    assignedPairs.add(`${a.classId}:${a.subjectId}`);
  }
  // Also mark group subjects as covered (their teacher comes from
  // mergedClassElectiveTeachers — checked later via buildGroupAwarePayload)
  for (const gt of mergedClassElectiveTeachers) {
    assignedPairs.add(`${gt.classId}:${gt.subjectId}`);
  }

  // Group anchor subjects are covered once groupDescriptors are resolved, so
  // add them now (anchor = first subject in each group for each class).
  for (const gd of resolvedGroupDescriptors) {
    const anchorId = gd.subjectIds[0];
    for (const classId of gd.classIds) {
      assignedPairs.add(`${classId}:${anchorId}`);
    }
  }

  const skippedNoTeacher: string[] = [];
  const engineRequirementsWithTeacher = engineRequirements.filter((r) => {
    if (assignedPairs.has(`${r.classId}:${r.subjectId}`)) return true;
    // Record what was dropped for the response warnings
    const cls = classesRaw.find((c) => c.id === r.classId);
    const subjectMeta = [...subjectMap.values()].find((s) => s.id === r.subjectId);
    skippedNoTeacher.push(
      `${cls?.name ?? r.classId}: ${subjectMeta?.code ?? r.subjectId} skipped (no teacher assigned)`
    );
    return false;
  });

  const groupPayload = buildGroupAwarePayload(
    engineRequirementsWithTeacher,
    teacherAssignments,
    resolvedGroupDescriptors,
    mergedClassElectiveTeachers,
  );

  // The anchorRealKeyToCompositeKeys reverse lookup is built inside
  // buildGroupAwarePayload and passed through groupPayload — no separate
  // anchorKeys Set is needed in the generate route any more.

  // Augment subject map with any group subjects not already present
  for (const gt of mergedClassElectiveTeachers) {
    if (!subjectMap.has(gt.subjectId)) {
      // Subject may have no SubjectLessonRequirement row (pure group subject) —
      // fetch it lazily so engineSubjects is complete for the validator.
      const sub = await prisma.subject.findUnique({
        where: { id: gt.subjectId },
        select: { id: true, code: true, name: true, type: true, internalCode: true, doubleLesson: true, requiresSpecialRoom: true },
      });
      if (sub) subjectMap.set(sub.id, { ...sub, type: sub.type ?? "ELECTIVE" });
    }
  }
  const engineSubjectsWithGroups = Array.from(subjectMap.values());

  // Also collect any new teacher IDs from the merged group teacher set
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

  const sessionPrefs = sessionPreferences
    .filter((p) => p.subjectCode && p.preferredSession)
    .map((p) => ({
      subjectCode: p.subjectCode!,
      preferredSession: p.preferredSession as TimetableSession,
      isHard: p.isHard,
    }));

  const studentSelectionsInput = studentSelections.map((sel) => ({
    studentId: sel.studentId,
    classId: sel.student.classId,
    subjectId: sel.subjectId,
  }));

  // Pre-generation checks (run against collapsed requirements so counts are accurate)
  if (!opts.bypassPreChecks) {
    const preCheck = runPreGenerationChecks({
      subjects: engineSubjectsWithGroups.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        type: (s.type ?? "CORE") as "CORE" | "ELECTIVE",
        doubleLesson: s.doubleLesson,
      })),
      classes: engineClasses,
      requirements: groupPayload.requirements,
      teacherAssignments: groupPayload.teacherAssignments,
      studentSelections: studentSelectionsInput,
      templateColumns: lessonColumns.length,
      operatingDays: timetableConfig.operatingDays,
      groups: resolvedGroupDescriptors,
    });

    if (!preCheck.canProceed) {
      return NextResponse.json(
        { error: "Pre-generation checks failed", preCheck },
        { status: 400 }
      );
    }
  }

  const engineConfig = {
    academicYear:
      opts.academicYear ?? timetableConfig.academicYear ?? new Date().getFullYear().toString(),
    term: opts.term ?? timetableConfig.term ?? 1,
    operatingDays: timetableConfig.operatingDays,
    maxLessonsPerTeacherPerDay: timetableConfig.maxLessonsPerTeacherPerDay,
    templateColumns,
  };

  const validatorBase = {
    classes: engineClasses,
    subjects: engineSubjectsWithGroups,
    teachers: teachersRaw.map((t) => ({ id: t.id, name: t.fullName })),
    requirements: groupPayload.requirements,
    teacherAssignments: groupPayload.teacherAssignments,
    teacherUnavailability,
    studentSelections: studentSelectionsInput,
    sessionPreferences: sessionPrefs,
    templateColumns,
    operatingDays: timetableConfig.operatingDays,
    linkedClassGroups: linkedClassGroupsList,
  };

  const result = await generateWithValidation(
    {
      ...validatorBase,
      config: engineConfig,
      linkedClassGroups: linkedClassGroupsList,
    },
    validatorBase,
    { maxAttempts: opts.maxAttempts }
  );

  if (!result.success || !result.finalResult) {
    const reason = result.reason ?? "Unknown error";
    const isSolverDown = reason.includes("unreachable") || result.attempts === 0;

    // Build a teacher-shortage summary from the solver warnings so the admin
    // knows exactly which subjects/teachers caused the failure rather than
    // seeing a generic crash message.
    const shortageLines = (result.finalResult?.warnings ?? [])
      .filter((w) => w.includes("lessons/week") || w.includes("no teacher"))
      .slice(0, 10);   // cap at 10 lines to keep the response readable

    return NextResponse.json(
      {
        error: isSolverDown
          ? "The timetable solver service is not running. Please start it and try again."
          : "The school does not have enough teachers to fill the timetable with the current requirements.",
        reason,
        hint: isSolverDown
          ? "Start the solver: cd timetable-solver && pip install -r requirements.txt && python solver.py"
          : "Assign additional teachers to the subjects listed in 'shortages', reduce lessons-per-week, or remove unavailability blocks.",
        ...(shortageLines.length > 0 ? { shortages: shortageLines } : {}),
      },
      { status: 422 }
    );
  }

  // If the solver succeeded but placed zero lessons the school genuinely has
  // too few teachers (or all teachers are marked unavailable).  Return a clear
  // actionable 422 rather than silently saving an empty draft.
  if (result.finalResult!.slots.length === 0) {
    const shortageLines = result.finalResult!.warnings
      .filter((w) => w.includes("lessons/week") || w.includes("no teacher"))
      .slice(0, 10);
    return NextResponse.json(
      {
        error: "No lessons could be scheduled — the school does not have enough available teachers for the current requirements.",
        hint: "Assign additional teachers to the subjects listed in 'shortages', reduce lessons-per-week, or remove unavailability blocks.",
        shortages: shortageLines,
        warnings: result.finalResult!.warnings,
      },
      { status: 422 }
    );
  }

  // ── Fan-out group slots: expand anchor slots → one per group subject ──────
  // Uses the reverse lookup built by buildGroupAwarePayload to map each
  // solver anchor slot to all (groupId, subjectId, teacherId) fan-out entries.
  const expandedSlots = fanOutGroupSlots(
    result.finalResult!.slots,
    groupPayload.fanOutMap,
    groupPayload.anchorRealKeyToCompositeKeys,
  );
  // Replace result slots with the expanded set for persistence and response
  result.finalResult!.slots = expandedSlots;

  // If fan-out produced zero slots (all group teachers missing) treat as partial
  if (expandedSlots.length === 0 && result.finalResult!.warnings.length === 0) {
    result.finalResult!.warnings.push(
      "No group lessons were scheduled — ensure ClassElectiveGroupTeacher rows are set up for all elective groups."
    );
  }

  // Persist to a versioned draft
  const versionId = opts.replaceVersionId ?? randomUUID();
  const now = new Date();

  // ── Build vulnerability snapshot ──────────────────────────────────────────
  // Collect unique conflict entries from the validation report
  const conflictEntries = result.finalValidation!.issues.map((i) => ({
    type: i.rule,
    severity: (i.severity === "ERROR" ? "error" : "warning") as "error" | "warning",
    message: i.message,
    action: i.affectedClasses?.length
      ? `Affects: ${i.affectedClasses.slice(0, 3).join(", ")}${i.affectedClasses.length > 3 ? ` +${i.affectedClasses.length - 3} more` : ""}`
      : "Review the timetable for this issue.",
  }));

  // Build staff shortage analysis maps
  const subjectTeacherMap = new Map<string, string[]>();
  for (const a of groupPayload.teacherAssignments) {
    const list = subjectTeacherMap.get(a.subjectId) ?? [];
    if (!list.includes(a.teacherId)) list.push(a.teacherId);
    subjectTeacherMap.set(a.subjectId, list);
  }

  const subjectMetaMap = new Map(
    engineSubjectsWithGroups.map((s) => [s.id, { code: s.code, name: s.name }])
  );
  const classMetaMap = new Map(classesRaw.map((c) => [c.id, c.name]));
  const reqMap = new Map<string, number>();
  for (const r of groupPayload.requirements) {
    reqMap.set(`${r.classId}-${r.subjectId}`, r.lessonsPerWeek);
  }

  // Build placed-lessons map from actual solver output.
  // Double-lesson subjects emit 2 physical slots per occurrence; divide back.
  const placedMap = new Map<string, number>();
  for (const slot of expandedSlots) {
    const key = `${slot.classId}-${slot.subjectId}`;
    placedMap.set(key, (placedMap.get(key) ?? 0) + 1);
  }
  const doubleSubjectIds = new Set(
    engineSubjectsWithGroups.filter((s) => s.doubleLesson).map((s) => s.id)
  );
  // reqMap keys are "classId-subjectId" with UUID values; build a reverse lookup
  // so we can extract subjectId safely from placedMap keys (UUIDs contain hyphens).
  const keyToSubjectId = new Map<string, string>();
  for (const r of groupPayload.requirements) {
    keyToSubjectId.set(`${r.classId}-${r.subjectId}`, r.subjectId);
  }
  for (const [key, count] of placedMap) {
    const subjectId = keyToSubjectId.get(key) ?? "";
    if (subjectId && doubleSubjectIds.has(subjectId)) {
      placedMap.set(key, Math.floor(count / 2));
    }
  }

  const maxLessonsPerTeacherPerWeek =
    timetableConfig.operatingDays.length * timetableConfig.maxLessonsPerTeacherPerDay;

  const shortageConfig: StaffShortageConfig = {
    subjectTeacherMap,
    subjectMeta: subjectMetaMap,
    classMeta: classMetaMap,
    maxLessonsPerTeacherPerWeek,
    requiredLessons: reqMap,
  };

  // Capacity-based shortages (teacher count × max/week < demand)
  const capacityShortages = analyseStaffShortages(shortageConfig);

  // Actual-placement shortages (solver placed fewer than required)
  const actualShortageConfig: ActualShortageConfig = {
    requiredLessons: reqMap,
    placedLessons: placedMap,
    subjectMeta: subjectMetaMap,
    classMeta: classMetaMap,
    subjectTeacherMap,
    maxLessonsPerTeacherPerWeek,
  };
  const actualShortages = analyseActualShortages(actualShortageConfig);

  // Merge: start from actual shortages (covers every subject with a gap),
  // then overlay capacity entries where they exist (richer capacity maths).
  const mergedShortageMap = new Map(actualShortages.map((s) => [s.subjectId, s]));
  for (const entry of capacityShortages) {
    mergedShortageMap.set(entry.subjectId, entry);
  }
  const staffShortages = [...mergedShortageMap.values()].sort((a, b) => {
    const lvl: Record<string, number> = { critical: 0, high: 1, moderate: 2 };
    const diff = (lvl[a.level] ?? 3) - (lvl[b.level] ?? 3);
    return diff !== 0 ? diff : b.deficit - a.deficit;
  });

  const vulnerabilitySnapshot = {
    capturedAt: now.toISOString(),
    totalErrors: result.finalValidation!.summary.errors,
    totalWarnings: result.finalValidation!.summary.warnings,
    conflicts: conflictEntries,
    staffShortages,
  };
  const vulnerabilitiesJson = JSON.stringify(vulnerabilitySnapshot);

  // Batch slot inserts to avoid per-row round-trips that exhaust the transaction timeout (P2028).
  // We chunk into groups of 200 to stay within parameter limits.
  // We deliberately avoid a long-lived interactive $transaction here because
  // Supabase's connection pooler has a limited connection-hold window.  Instead we:
  //  1. Upsert/insert the version row first (fast, single statement)
  //  2. Delete existing slots for this version (fast, single statement)
  //  3. Insert slot chunks individually — each is its own short transaction
  // This keeps every individual DB call well within the pooler's timeout.
  const { Prisma } = await import("@prisma/client");

  // ── Deduplicate slots before inserting ────────────────────────────────────
  // Deduplicate on TWO keys:
  //   1. classId|subjectId|day|period  — one subject per class per slot (original)
  //   2. classId|teacherId|day|period  — mirrors the DB unique constraint
  //      (versionId, classId, teacherId, dayOfWeek, period) so the ON CONFLICT
  //      DO NOTHING clause never silently drops a legitimate second subject for
  //      the same teacher at the same period in a multi-subject group.
  // Both keys are checked; the first match wins.
  const slotSeenBySubject = new Set<string>(); // "classId|subjectId|day|period"
  const slotSeenByTeacher = new Set<string>(); // "classId|teacherId|day|period"

  const deduplicatedSlots = result.finalResult!.slots.filter((s) => {
    const subjectKey = `${s.classId}|${s.subjectId}|${s.dayOfWeek}|${s.period}`;
    const teacherKey = `${s.classId}|${s.teacherId}|${s.dayOfWeek}|${s.period}`;
    if (slotSeenBySubject.has(subjectKey) || slotSeenByTeacher.has(teacherKey)) return false;
    slotSeenBySubject.add(subjectKey);
    slotSeenByTeacher.add(teacherKey);
    return true;
  });

  const CHUNK_SIZE = 200;
  const slots = deduplicatedSlots;
  const slotChunks: (typeof slots)[] = [];
  for (let i = 0; i < slots.length; i += CHUNK_SIZE) {
    slotChunks.push(slots.slice(i, i + CHUNK_SIZE));
  }

  // Step 1 — version row
  if (opts.replaceVersionId) {
    await prisma.$executeRaw`
      DELETE FROM "TimetableVersionSlot" WHERE "versionId" = ${versionId}`;
    await prisma.$executeRaw`
      UPDATE "TimetableVersion"
      SET name = ${opts.name},
          description = ${opts.description ?? null},
          "academicYear" = ${opts.academicYear ?? null},
          term = ${opts.term ?? null},
          "generatedAt" = ${now},
          "updatedAt" = ${now},
          "vulnerabilities" = ${vulnerabilitiesJson}::jsonb
      WHERE id = ${versionId} AND "schoolId" = ${schoolId}`;
  } else {
    await prisma.$executeRaw`
      INSERT INTO "TimetableVersion"
        (id, "schoolId", name, description, status, "academicYear", term,
         "generatedAt", "createdById", "createdAt", "updatedAt", "vulnerabilities")
      VALUES (${versionId}, ${schoolId}, ${opts.name},
              ${opts.description ?? null}, 'DRAFT',
              ${opts.academicYear ?? null}, ${opts.term ?? null},
              ${now}, ${user.id}, ${now}, ${now},
              ${vulnerabilitiesJson}::jsonb)`;
  }

  // Step 2 — slot chunks (short individual statements, no long-held connection)
  for (const chunk of slotChunks) {
    if (chunk.length === 0) continue;
    const rows = chunk.map((s) =>
      Prisma.sql`(${randomUUID()}, ${versionId}, ${schoolId}, ${s.classId},
                  ${s.dayOfWeek}, ${s.period}, ${s.subjectId}, ${s.teacherId},
                  ${s.room ?? null}, false, ${now}, ${now})`
    );
    await prisma.$executeRaw`
      INSERT INTO "TimetableVersionSlot"
        (id, "versionId", "schoolId", "classId", "dayOfWeek", period,
         "subjectId", "teacherId", room, "isManual", "createdAt", "updatedAt")
      VALUES ${Prisma.join(rows)}
      ON CONFLICT ("versionId", "classId", "teacherId", "dayOfWeek", period) DO NOTHING`;
  }

  // Replace result slots with the deduplicated set so slotCount and the
  // response slots array are consistent with what was actually persisted.
  result.finalResult!.slots = deduplicatedSlots;

  const classNameMap = new Map(classesRaw.map((c) => [c.id, c.name]));
  const subjectCodeMap = new Map(engineSubjectsWithGroups.map((s) => [s.id, s.code]));
  const teacherNameMap = new Map(teachersRaw.map((t) => [t.id, t.fullName]));

  return NextResponse.json({
    versionId,
    name: opts.name,
    slotCount: result.finalResult.slots.length,
    solverStatus: "CP-SAT",
    stats: result.finalResult.stats,
    warnings: result.finalResult.warnings,
    skippedNoTeacher: skippedNoTeacher.length > 0 ? skippedNoTeacher : undefined,
    staffShortages: staffShortages.length > 0 ? staffShortages : undefined,
    vulnerabilities: vulnerabilitySnapshot,
    validation: {
      valid: result.finalValidation!.valid,
      passedRules: result.finalValidation!.passedRules,
      failedRules: result.finalValidation!.failedRules,
      issues: result.finalValidation!.issues.map((i) => ({
        rule: i.rule,
        severity: i.severity,
        message: i.message,
        affectedClasses: i.affectedClasses,
        affectedTeachers: i.affectedTeachers,
        affectedSubjects: i.affectedSubjects,
      })),
      summary: result.finalValidation!.summary,
    },
    slots: result.finalResult.slots.map((s) => ({
      classId: s.classId,
      className: classNameMap.get(s.classId) ?? "",
      dayOfWeek: s.dayOfWeek,
      period: s.period,
      subjectId: s.subjectId,
      subjectCode: subjectCodeMap.get(s.subjectId) ?? "",
      teacherId: s.teacherId,
      teacherName: teacherNameMap.get(s.teacherId) ?? "",
      room: s.room,
    })),
  });
}
