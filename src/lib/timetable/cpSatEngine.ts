/**
 * src/lib/timetable/cpSatEngine.ts
 *
 * TypeScript client for the CP-SAT solver microservice.
 *
 * This module is the single integration point between the Next.js application
 * and the Python OR-Tools service.  It:
 *
 *  1. Accepts the same input types the rest of the timetable system already uses
 *     (EngineSubject, EngineClass, SubjectRequirement, etc.)
 *  2. Serialises the request to the shape expected by POST /solve
 *  3. Deserialises the response back to GeneratedSlot[] and EngineResult
 *  4. Maps solver status codes to the same success/error shape the rest of the
 *     codebase already handles
 *
 * The solver URL is read from the TIMETABLE_SOLVER_URL environment variable
 * (default: http://localhost:8080) so it works both locally and in Docker/K8s.
 */

import type {
  EngineSubject,
  EngineClass,
  EngineTeacher,
  SubjectRequirement,
  TeacherAssignment,
  TeacherUnavailabilitySlot,
  SessionPreference,
  TemplateColumn,
  GeneratedSlot,
  EngineResult,
} from "./deterministicEngine";

// ─── Solver wire types (match solver.py Pydantic models) ────────────────────

/**
 * A group of classes that must all have the same subject(s) at the exact same
 * day+period (hard constraint).  Comes from ElectiveGroup records where every
 * class in scope must run the lesson simultaneously so students can move
 * between streams.
 */
type SolverLinkedClassGroup = {
  /** All subject IDs whose slots must be synchronised across classIds */
  subjectIds: string[];
  /** All class IDs that must share the same (day, period) for every subjectId */
  classIds: string[];
};

type SolverSubject = {
  id: string;
  code: string;
  internalCode: number;
  doubleLesson: boolean;
  requiresSpecialRoom: string | null;
};

type SolverClass = {
  id: string;
  name: string;
  form: number;
  streamIndex: number;
};

type SolverTeacher = {
  id: string;
  name: string;
};

type SolverRequirement = {
  classId: string;
  subjectId: string;
  lessonsPerWeek: number;
};

type SolverAssignment = {
  classId: string;
  subjectId: string;
  teacherId: string;
};

type SolverUnavailability = {
  teacherId: string;
  dayOfWeek: number;
  period: number;
};

type SolverSessionPreference = {
  subjectCode: string;
  preferredSession: string;
  isHard: boolean;
};

type SolverTemplateColumn = {
  position: number;
  startTime: string;
  endTime: string;
  slotType: string;
  session: string;
  label: string | null;
};

type SolverLockedSlot = {
  classId: string;
  subjectId: string;
  dayOfWeek: number;
  period: number;
};

type SolverPreviousSlot = {
  classId: string;
  subjectId: string;
  dayOfWeek: number;
  period: number;
};

type SolverRequest = {
  subjects: SolverSubject[];
  classes: SolverClass[];
  teachers: SolverTeacher[];
  requirements: SolverRequirement[];
  teacherAssignments: SolverAssignment[];
  teacherUnavailability: SolverUnavailability[];
  sessionPreferences: SolverSessionPreference[];
  templateColumns: SolverTemplateColumn[];
  operatingDays: number[];
  maxLessonsPerTeacherPerDay: number;
  timeLimitSeconds: number;
  /**
   * Hard synchronisation groups: every class in classIds must have every
   * subject in subjectIds scheduled at the same (dayOfWeek, period).
   */
  linkedClassGroups: SolverLinkedClassGroup[];
  /**
   * Hard constraint: a class may never have more than 2 lessons in a row on
   * the same day (i.e. at most one consecutive double-block).  Three or more
   * back-to-back periods are forbidden regardless of subject type.
   * Default true — set to false only to reproduce legacy behaviour.
   */
  maxConsecutiveLessons: number;
  /**
   * Hard constraint: a subject whose doubleLesson flag is false must never be
   * placed in two consecutive periods for the same class on the same day.
   * Default true — set to false only to reproduce legacy behaviour.
   */
  preventUnintendedDoubles: boolean;
  /** Slots hard-fixed in the CP-SAT model via model.add(x == 1). */
  lockedSlots: SolverLockedSlot[];
  /** Slots from a previous solve used as a soft stability bias (Phase 2). */
  previousSlots: SolverPreviousSlot[];
};

type SolverSlot = {
  classId: string;
  dayOfWeek: number;
  period: number;
  subjectId: string;
  teacherId: string;
  room: string | null;
};

type SolverStats = {
  totalLessonsScheduled: number;
  totalLessonsRequired: number;
  completionRate: number;
  wallTime: number;
  branches: number;
  conflicts: number;
  objectiveValue?: number;
};

type SolverResponse = {
  status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN" | "MODEL_INVALID" | string;
  slots: SolverSlot[];
  warnings: string[];
  stats: Partial<SolverStats>;
};

// ─── Public input type (mirror of deterministicEngine generateTimetable input) ─

/**
 * A group of classes that must all have their shared elective subjects
 * scheduled at the same (dayOfWeek, period).  Populated from ElectiveGroup
 * records before calling the solver.
 */
export type LinkedClassGroup = {
  /** Subject IDs from ElectiveGroupMember rows */
  subjectIds: string[];
  /** Class IDs in scope for the group (derived from scopeForm / scopeStreams) */
  classIds: string[];
};

/**
 * A single slot that must appear unchanged in the solver output.
 * The solver hard-fixes these positions before optimising the remainder.
 */
export type LockedSlotPin = {
  classId: string;
  subjectId: string;
  dayOfWeek: number;
  /** 1-based among LESSON columns */
  period: number;
};

export type CpSatInput = {
  subjects: EngineSubject[];
  classes: EngineClass[];
  teachers: EngineTeacher[];
  requirements: SubjectRequirement[];
  teacherAssignments: TeacherAssignment[];
  teacherUnavailability: TeacherUnavailabilitySlot[];
  sessionPreferences: SessionPreference[];
  config: {
    academicYear: string;
    term: number;
    operatingDays: number[];
    maxLessonsPerTeacherPerDay: number;
    templateColumns: TemplateColumn[];
  };
  /**
   * Passed through from the API routes for the post-generation validator.
   * The CP-SAT solver itself does not use student selections directly — it
   * only schedules (class, subject, teacher) triples.  Selections are
   * validated after the fact by the validator.
   */
  studentSelections?: Array<{
    studentId: string;
    classId: string;
    subjectId: string;
  }>;
  /** Override solver time limit (seconds). Default: 60 */
  timeLimitSeconds?: number;
  /**
   * Hard co-scheduling groups built from ElectiveGroup records.
   * Every class in classIds must have every subject in subjectIds at the same
   * (dayOfWeek, period).  Omit or pass [] if there are no elective groups.
   */
  linkedClassGroups?: LinkedClassGroup[];
  /**
   * Maximum number of consecutive lessons a class may have in a row on the
   * same day.  Defaults to 2 (one double-block maximum).  Pass a higher value
   * only if the school explicitly allows longer runs — this should almost
   * never be changed.
   */
  maxConsecutiveLessons?: number;
  /**
   * When true (default) the solver will not place two consecutive periods of
   * the same single-lesson subject for a class on the same day.  Set to false
   * only to reproduce legacy behaviour where accidental doubles were possible.
   */
  preventUnintendedDoubles?: boolean;
  /**
   * Slots that must appear unchanged in the output.
   * The solver hard-fixes these positions via model.add(x == 1) before
   * optimising the remainder.
   */
  lockedSlots?: LockedSlotPin[];
  /**
   * Slots from a previous timetable version used as a soft stability bias.
   * The solver rewards keeping these positions, without ever dropping a
   * required lesson to do so.  Serialised to the solver in Phase 2.
   */
  previousSlots?: LockedSlotPin[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSolverUrl(): string {
  return (
    process.env.TIMETABLE_SOLVER_URL?.replace(/\/$/, "") ?? "http://localhost:8080"
  );
}

/**
 * Call GET /health on the solver to confirm it's reachable before committing
 * to a solve request.  Returns true if healthy, false otherwise.
 */
export async function isSolverHealthy(
  timeoutMs = 3_000
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${getSolverUrl()}/health`, {
      signal: controller.signal,
    });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Main export ────────────────────────────────────────────────────────────

/**
 * generateTimetableViaCpSat
 *
 * Drop-in replacement for the greedy `generateTimetable` function in
 * deterministicEngine.ts.  Calls the Python CP-SAT microservice and maps the
 * response to an `EngineResult` so the rest of the pipeline (validator,
 * regenerationController, API routes) needs no structural changes.
 */
export async function generateTimetableViaCpSat(
  input: CpSatInput
): Promise<EngineResult> {
  const { config } = input;

  // Build the request payload
  const payload: SolverRequest = {
    subjects: input.subjects.map((s) => ({
      id: s.id,
      code: s.code,
      internalCode: s.internalCode,
      doubleLesson: s.doubleLesson,
      requiresSpecialRoom: s.requiresSpecialRoom,
    })),
    classes: input.classes.map((c) => ({
      id: c.id,
      name: c.name,
      form: c.form,
      streamIndex: c.streamIndex,
    })),
    teachers: input.teachers.map((t) => ({
      id: t.id,
      name: t.name,
    })),
    requirements: input.requirements.map((r) => ({
      classId: r.classId,
      subjectId: r.subjectId,
      lessonsPerWeek: r.lessonsPerWeek,
    })),
    teacherAssignments: input.teacherAssignments.map((a) => ({
      classId: a.classId,
      subjectId: a.subjectId,
      teacherId: a.teacherId,
    })),
    teacherUnavailability: input.teacherUnavailability.map((u) => ({
      teacherId: u.teacherId,
      dayOfWeek: u.dayOfWeek,
      period: u.period,
    })),
    sessionPreferences: input.sessionPreferences.map((p) => ({
      subjectCode: p.subjectCode,
      preferredSession: p.preferredSession,
      isHard: p.isHard,
    })),
    templateColumns: config.templateColumns.map((col) => ({
      position: col.position,
      startTime: col.startTime,
      endTime: col.endTime,
      slotType: col.slotType,
      session: col.session,
      label: col.label,
    })),
    operatingDays: config.operatingDays,
    maxLessonsPerTeacherPerDay: config.maxLessonsPerTeacherPerDay,
    timeLimitSeconds: input.timeLimitSeconds ?? 60,
    linkedClassGroups: (input.linkedClassGroups ?? []).map((g) => ({
      subjectIds: g.subjectIds,
      classIds: g.classIds,
    })),
    // New hard constraints — both default to the safest value so existing
    // callers that don't pass them get the correct behaviour automatically.
    maxConsecutiveLessons: input.maxConsecutiveLessons ?? 2,
    preventUnintendedDoubles: input.preventUnintendedDoubles ?? true,
    lockedSlots: (input.lockedSlots ?? []).map((s) => ({
      classId: s.classId,
      subjectId: s.subjectId,
      dayOfWeek: s.dayOfWeek,
      period: s.period,
    })),
    previousSlots: (input.previousSlots ?? []).map((s) => ({
      classId: s.classId,
      subjectId: s.subjectId,
      dayOfWeek: s.dayOfWeek,
      period: s.period,
    })),
  };

  // Call the solver
  let raw: SolverResponse;
  try {
    const controller = new AbortController();
    const timeoutMs = ((input.timeLimitSeconds ?? 60) + 30) * 1_000; // solver time + 30 s overhead
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${getSolverUrl()}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timerId);

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      throw new Error(`Solver returned HTTP ${res.status}: ${text}`);
    }

    raw = (await res.json()) as SolverResponse;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown solver communication error";
    return _failResult([
      {
        type: "TEACHER_ASSIGNMENT_VIOLATION",
        description: `CP-SAT solver unreachable: ${message}`,
      },
    ]);
  }

  // Map solver status to EngineResult.
  // The Python solver always returns "FEASIBLE" (it maximises placement rather
  // than refusing to run).  In the extremely unlikely case the status is
  // UNKNOWN (time limit exhausted before the first incumbent was found) or
  // INFEASIBLE, we still attempt to use whatever slots the solver did place.
  // We only hard-fail (success:false) when zero slots were placed AND there is
  // no recoverable partial result — which means the school genuinely lacks
  // enough teachers to fill the timetable.
  const isRecognised =
    raw.status === "OPTIMAL" ||
    raw.status === "FEASIBLE" ||
    raw.status === "UNKNOWN";   // time-limit hit but solver may still have a partial

  const hasSlots = Array.isArray(raw.slots) && raw.slots.length > 0;

  if (!isRecognised && !hasSlots) {
    // MODEL_INVALID or other unexpected solver error with nothing placed
    return _failResult(
      [{ type: "INCOMPLETE_LESSONS", description: `CP-SAT solver returned unexpected status: ${raw.status}` }],
      raw.warnings ?? []
    );
  }

  if (raw.status === "UNKNOWN" && !hasSlots) {
    // Hit time limit before placing even one lesson — push a clear warning but
    // still return success so the (empty) draft can be inspected.
    const extendedWarnings = [
      "CP-SAT solver hit the time limit before placing any lessons. " +
      "The school may have too few teachers for the current requirements. " +
      "Try increasing timeLimitSeconds, reducing lesson requirements, or assigning more teachers.",
      ...(raw.warnings ?? []),
    ];
    // Return a zero-slot "success" so the API can save the draft and surface
    // shortfall warnings to the admin rather than showing a crash message.
    return {
      success: true,
      slots: [],
      errors: [],
      warnings: extendedWarnings,
      stats: {
        totalLessonsScheduled: 0,
        totalLessonsRequired: input.requirements.reduce((n, r) => n + r.lessonsPerWeek, 0),
        completionRate: 0,
        classesFullyScheduled: 0,
        classesPartiallyScheduled: 0,
        classesNotScheduled: input.classes.length,
      },
    };
  }

  // Convert SolverSlot[] → GeneratedSlot[]
  const slots: GeneratedSlot[] = raw.slots.map((s) => ({
    classId: s.classId,
    dayOfWeek: s.dayOfWeek,
    period: s.period,
    subjectId: s.subjectId,
    teacherId: s.teacherId,
    room: s.room,
  }));

  const stats = raw.stats ?? {};
  const totalRequired = stats.totalLessonsRequired ?? input.requirements.reduce((n, r) => n + r.lessonsPerWeek, 0);
  const totalScheduled = stats.totalLessonsScheduled ?? slots.length;
  const completionRate = totalRequired > 0 ? (totalScheduled / totalRequired) * 100 : 100;

  // Count class completion
  const scheduledPerClass = new Map<string, Set<string>>();
  for (const slot of slots) {
    if (!scheduledPerClass.has(slot.classId)) {
      scheduledPerClass.set(slot.classId, new Set());
    }
    scheduledPerClass.get(slot.classId)!.add(`${slot.subjectId}`);
  }

  const reqCountPerClass = new Map<string, number>();
  for (const r of input.requirements) {
    reqCountPerClass.set(r.classId, (reqCountPerClass.get(r.classId) ?? 0) + 1);
  }

  let classesFullyScheduled = 0;
  let classesPartiallyScheduled = 0;
  let classesNotScheduled = 0;

  for (const [classId, scheduledSubjects] of scheduledPerClass) {
    const required = reqCountPerClass.get(classId) ?? 0;
    if (scheduledSubjects.size === required) classesFullyScheduled++;
    else classesPartiallyScheduled++;
  }
  for (const classId of input.classes.map((c) => c.id)) {
    if (!scheduledPerClass.has(classId)) classesNotScheduled++;
  }

  return {
    success: true,
    slots,
    errors: [],
    warnings: raw.warnings ?? [],
    stats: {
      totalLessonsScheduled: totalScheduled,
      totalLessonsRequired: totalRequired,
      completionRate: Math.round(completionRate * 100) / 100,
      classesFullyScheduled,
      classesPartiallyScheduled,
      classesNotScheduled,
    },
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function _failResult(
  errors: EngineResult["errors"],
  warnings: string[] = []
): EngineResult {
  return {
    success: false,
    slots: [],
    errors,
    warnings,
    stats: {
      totalLessonsScheduled: 0,
      totalLessonsRequired: 0,
      completionRate: 0,
      classesFullyScheduled: 0,
      classesPartiallyScheduled: 0,
      classesNotScheduled: 0,
    },
  };
}
