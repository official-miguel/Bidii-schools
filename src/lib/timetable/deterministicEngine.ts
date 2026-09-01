/**
 * src/lib/timetable/deterministicEngine.ts
 *
 * Deterministic constraint-based timetable scheduling engine.
 * 
 * DESIGN PRINCIPLES:
 * 1. Hard constraints are NEVER violated - no double-booking, all requirements met
 * 2. AI is NOT used for generation - only for translating preference language
 * 3. School configuration drives everything - no curriculum assumptions
 * 4. Teacher-to-stream assignments are stable and never auto-swapped
 * 5. Format is defined by school template, not hardcoded
 * 
 * HARD CONSTRAINTS (must satisfy):
 * - No teacher double-booking across classes
 * - No student double-booking (class can't have 2 subjects same slot)
 * - Every class has a lesson in every teaching period (except breaks/lunch/games/assembly)
 * - Every student only scheduled into subjects they selected
 * - Teacher-to-stream assignments stay exactly as configured
 * - Each subject receives full required weekly lesson count
 * - Double lessons are consecutive when required
 * - Subject selections and compulsory/optional groupings respected
 * - Teachers only scheduled when available (respect unavailability)
 * - No more than 2 consecutive lessons for a class on the same day (max one double-block)
 * - Single-lesson subjects are never placed consecutively (no accidental doubles)
 * 
 * SOFT PREFERENCES (optimize when possible):
 * - Avoid scheduling all streams into same subject at same time
 * - Respect session preferences (morning/afternoon/evening)
 * - Spread subjects across days when possible
 */

import { TimetableSession, TimetableSlotType } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type EngineSubject = {
  id: string;
  internalCode: number;
  code: string;
  name: string;
  doubleLesson: boolean;
  requiresSpecialRoom: string | null;
};

export type EngineClass = {
  id: string;
  name: string;
  form: number;
  stream: string | null;
  /** Index within form for stream distribution */
  streamIndex: number;
};

export type EngineTeacher = {
  id: string;
  name: string;
};

export type SubjectRequirement = {
  subjectId: string;
  classId: string;
  lessonsPerWeek: number;
};

export type TeacherAssignment = {
  classId: string;
  subjectId: string;
  teacherId: string;
};

export type TemplateColumn = {
  position: number;
  startTime: string;
  endTime: string;
  slotType: TimetableSlotType;
  session: TimetableSession;
  label: string | null;
};

export type EngineConfig = {
  academicYear: string;
  term: number;
  operatingDays: number[]; // e.g. [0,1,2,3,4] for Mon-Fri
  maxLessonsPerTeacherPerDay: number;
  templateColumns: TemplateColumn[];
};

export type SessionPreference = {
  subjectCode: string;
  preferredSession: TimetableSession;
  isHard: boolean;
};

export type TeacherUnavailabilitySlot = {
  teacherId: string;
  dayOfWeek: number;
  period: number;
};

export type StudentSubjectSelection = {
  studentId: string;
  classId: string;
  subjectId: string;
};

export type GeneratedSlot = {
  classId: string;
  dayOfWeek: number;
  period: number; // 1-based position in template columns (only LESSON slots)
  subjectId: string;
  teacherId: string;
  room: string | null;
};

export type ValidationError = {
  type: 
    | "TEACHER_DOUBLE_BOOKED"
    | "CLASS_DOUBLE_BOOKED"
    | "INCOMPLETE_LESSONS"
    | "INVALID_SUBJECT_SELECTION"
    | "TEACHER_ASSIGNMENT_VIOLATION"
    | "UNAVAILABLE_TEACHER"
    | "DOUBLE_LESSON_NOT_CONSECUTIVE"
    | "SESSION_CONSTRAINT_VIOLATED";
  description: string;
  classId?: string;
  teacherId?: string;
  subjectId?: string;
  dayOfWeek?: number;
  period?: number;
};

export type EngineResult = {
  success: boolean;
  slots: GeneratedSlot[];
  errors: ValidationError[];
  warnings: string[];
  stats: {
    totalLessonsScheduled: number;
    totalLessonsRequired: number;
    completionRate: number;
    classesFullyScheduled: number;
    classesPartiallyScheduled: number;
    classesNotScheduled: number;
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// Slot Key Utilities
// ═══════════════════════════════════════════════════════════════════════════

function slotKey(day: number, period: number): string {
  return `${day}-${period}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// State Tracking Classes
// ═══════════════════════════════════════════════════════════════════════════

class TeacherState {
  occupied = new Set<string>(); // "day-period" keys
  dailyCount = new Map<number, number>(); // day -> count
  totalLoad = 0;

  isFree(
    day: number,
    period: number,
    unavailability: Set<string>,
    maxPerDay: number
  ): boolean {
    const key = slotKey(day, period);
    if (this.occupied.has(key) || unavailability.has(key)) return false;
    return (this.dailyCount.get(day) ?? 0) < maxPerDay;
  }

  occupy(day: number, period: number): void {
    const key = slotKey(day, period);
    this.occupied.add(key);
    this.dailyCount.set(day, (this.dailyCount.get(day) ?? 0) + 1);
    this.totalLoad++;
  }

  release(day: number, period: number): void {
    const key = slotKey(day, period);
    if (!this.occupied.has(key)) return;
    this.occupied.delete(key);
    this.dailyCount.set(day, Math.max(0, (this.dailyCount.get(day) ?? 1) - 1));
    this.totalLoad = Math.max(0, this.totalLoad - 1);
  }

  getLoad(): number {
    return this.totalLoad;
  }
}

class ClassState {
  occupied = new Map<string, string>(); // "day-period" -> subjectId
  subjectDays = new Map<string, Set<number>>(); // subjectId -> days used
  subjectCount = new Map<string, number>(); // subjectId -> lessons scheduled

  isFree(day: number, period: number): boolean {
    return !this.occupied.has(slotKey(day, period));
  }

  occupy(day: number, period: number, subjectId: string): void {
    const key = slotKey(day, period);
    this.occupied.set(key, subjectId);

    if (!this.subjectDays.has(subjectId)) {
      this.subjectDays.set(subjectId, new Set());
    }
    this.subjectDays.get(subjectId)!.add(day);

    this.subjectCount.set(subjectId, (this.subjectCount.get(subjectId) ?? 0) + 1);
  }

  release(day: number, period: number): void {
    const key = slotKey(day, period);
    const subjectId = this.occupied.get(key);
    this.occupied.delete(key);

    if (subjectId) {
      this.subjectDays.get(subjectId)?.delete(day);
      this.subjectCount.set(
        subjectId,
        Math.max(0, (this.subjectCount.get(subjectId) ?? 1) - 1)
      );
    }
  }

  getSubjectCount(subjectId: string): number {
    return this.subjectCount.get(subjectId) ?? 0;
  }

  getDaysUsed(subjectId: string): number {
    return this.subjectDays.get(subjectId)?.size ?? 0;
  }

  /**
   * Returns the set of occupied periods (1-based) on a given day.
   * Used by the consecutive-lesson constraint check during placement.
   */
  getOccupiedPeriods(day: number): Set<number> {
    const result = new Set<number>();
    for (const [key] of this.occupied) {
      const [d, p] = key.split("-").map(Number);
      if (d === day) result.add(p);
    }
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Placement Scoring (for soft preferences)
// ═══════════════════════════════════════════════════════════════════════════

function scoreSlot(
  day: number,
  period: number,
  subject: EngineSubject,
  classState: ClassState,
  teacherState: TeacherState,
  sessionPreferences: Map<string, SessionPreference>,
  templateColumns: TemplateColumn[],
  streamIndex: number,
  operatingDays: number[]
): number {
  let score = 100;

  // Find the template column for this period
  const lessonColumns = templateColumns.filter((col) => col.slotType === "LESSON");
  const column = lessonColumns[period - 1];

  if (!column) return 0;

  // Session preference
  const pref = sessionPreferences.get(subject.code.toUpperCase());
  if (pref && column.session === pref.preferredSession) {
    score += pref.isHard ? 100 : 30;
  } else if (pref && pref.isHard) {
    score -= 200; // Heavy penalty for violating hard session constraint
  }

  // Spread across days - reward using a new day
  if (!classState.subjectDays.get(subject.id)?.has(day)) {
    score += 25;
  }

  // Stream offset distribution - rotate start day per stream
  const preferredDay = operatingDays[streamIndex % operatingDays.length];
  if (day === preferredDay && classState.getSubjectCount(subject.id) === 0) {
    score += 15; // Bonus for starting on preferred day
  }

  // Teacher load balance - prefer lighter-loaded teachers for this day
  const teacherDayLoad = teacherState.dailyCount.get(day) ?? 0;
  score += Math.max(0, 10 - teacherDayLoad * 2);

  // Avoid very early or very late periods
  if (period === 1) score -= 5;
  if (period === lessonColumns.length) score -= 5;

  return score;
}

// ═══════════════════════════════════════════════════════════════════════════
// Consecutive-lesson constraint helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns true if placing a lesson at (day, period) would create a run of
 * 3 or more consecutively occupied periods for the class.
 *
 * We look at the two neighbours on each side of the proposed placement:
 *   p-2, p-1  [before]  p  [after]  p+1, p+2
 *
 * If both p-1 AND p+1 are already occupied the new slot bridges a gap → run ≥ 3.
 * If p-1 AND p-2 are both occupied → run ≥ 3 even without p+1.
 * If p+1 AND p+2 are both occupied → run ≥ 3 even without p-1.
 *
 * For double-lesson placement we also check the second slot (period+1).
 */
function wouldCreateTripleRun(
  day: number,
  startPeriod: number,
  /** 1 for single lessons, 2 for double blocks */
  blockSize: number,
  occupied: Set<number>
): boolean {
  const endPeriod = startPeriod + blockSize - 1;

  // Periods immediately outside the proposed block
  const beforeStart = startPeriod - 1;
  const afterEnd   = endPeriod   + 1;

  // Check: period before the block is occupied AND either:
  //   - the period before THAT is occupied (run of 3 starts 2 before), OR
  //   - the period after the block is occupied (run of 3 spans both neighbours)
  if (occupied.has(beforeStart)) {
    if (occupied.has(beforeStart - 1)) return true; // ...X X [block]
    if (occupied.has(afterEnd))        return true; // X [block] X
  }

  // Check: period after the block is occupied AND the period after THAT too
  if (occupied.has(afterEnd) && occupied.has(afterEnd + 1)) return true; // [block] X X

  return false;
}

/**
 * Returns true if placing a SINGLE lesson of `subjectId` at (day, period)
 * would create two consecutive periods of the same subject on that day
 * (i.e. an accidental double for a non-double subject).
 */
function wouldCreateUnintendedDouble(
  day: number,
  period: number,
  subjectId: string,
  classState: ClassState
): boolean {
  // Check the slot immediately before and after
  const keyBefore = `${day}-${period - 1}`;
  const keyAfter  = `${day}-${period + 1}`;
  return (
    classState.occupied.get(keyBefore) === subjectId ||
    classState.occupied.get(keyAfter)  === subjectId
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Placement Logic
// ═══════════════════════════════════════════════════════════════════════════

function placeLesson(
  _classId: string,
  subject: EngineSubject,
  _teacherId: string,
  classState: ClassState,
  teacherState: TeacherState,
  unavailability: Set<string>,
  config: EngineConfig,
  sessionPreferences: Map<string, SessionPreference>,
  streamIndex: number,
  isDoubleLesson: boolean,
  /** Days that already have a double block for this subject (enforces max-one-double-per-day) */
  doubleBlockDaysUsed?: Set<number>
): { day: number; period: number } | null {
  const lessonColumns = config.templateColumns.filter(
    (col) => col.slotType === "LESSON"
  );
  const candidates: Array<{ day: number; period: number; score: number }> = [];

  for (const day of config.operatingDays) {
    // A subject may only have ONE double block per day
    if (isDoubleLesson && doubleBlockDaysUsed?.has(day)) continue;

    // Pre-compute the set of occupied periods for this class on this day
    // so the consecutive-run check is O(1) per candidate.
    const occupiedOnDay = classState.getOccupiedPeriods(day);

    for (let p = 1; p <= lessonColumns.length; p++) {
      // For double lessons, need consecutive periods and can't start on the last slot
      if (isDoubleLesson && p === lessonColumns.length) continue;

      // Check if slot(s) are free
      if (!classState.isFree(day, p)) continue;
      if (isDoubleLesson && !classState.isFree(day, p + 1)) continue;

      // ── Hard constraint: no triple (or longer) consecutive run ───────────
      // For double lessons, check that placing both p and p+1 won't push a
      // run of occupied periods to 3+.
      if (wouldCreateTripleRun(day, p, isDoubleLesson ? 2 : 1, occupiedOnDay)) {
        continue;
      }

      // ── Hard constraint: no accidental consecutive single for this subject ─
      // Only applies to single-lesson placements; double-lesson subjects are
      // intentionally consecutive.
      if (!isDoubleLesson && wouldCreateUnintendedDouble(day, p, subject.id, classState)) {
        continue;
      }

      // Check teacher availability
      if (!teacherState.isFree(day, p, unavailability, config.maxLessonsPerTeacherPerDay)) {
        continue;
      }
      if (
        isDoubleLesson &&
        !teacherState.isFree(day, p + 1, unavailability, config.maxLessonsPerTeacherPerDay)
      ) {
        continue;
      }

      const score = scoreSlot(
        day,
        p,
        subject,
        classState,
        teacherState,
        sessionPreferences,
        config.templateColumns,
        streamIndex,
        config.operatingDays
      );

      candidates.push({ day, period: p, score });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  return { day: candidates[0].day, period: candidates[0].period };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Engine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use {@link generateTimetableViaCpSat} from cpSatEngine.ts instead.
 * This greedy engine has no concept of linkedClassGroups, pooled sessions,
 * maxConsecutiveLessons, or preventUnintendedDoubles.  It remains in the
 * codebase for backward compatibility only and will be removed in a future
 * cleanup once all routes use the CP-SAT path.
 */
export function generateTimetable(input: {
  subjects: EngineSubject[];
  classes: EngineClass[];
  teachers: EngineTeacher[];
  requirements: SubjectRequirement[];
  teacherAssignments: TeacherAssignment[];
  teacherUnavailability: TeacherUnavailabilitySlot[];
  studentSelections: StudentSubjectSelection[];
  sessionPreferences: SessionPreference[];
  config: EngineConfig;
}): EngineResult {
  const {
    subjects,
    classes,
    requirements,
    teacherAssignments,
    teacherUnavailability,
    sessionPreferences,
    config,
  } = input;

  const slots: GeneratedSlot[] = [];
  const warnings: string[] = [];
  const errors: ValidationError[] = [];

  // Build lookup maps
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  const requirementMap = new Map<string, SubjectRequirement[]>();
  for (const req of requirements) {
    const key = req.classId;
    if (!requirementMap.has(key)) requirementMap.set(key, []);
    requirementMap.get(key)!.push(req);
  }

  const assignmentMap = new Map<string, string>(); // "classId-subjectId" -> teacherId
  for (const assign of teacherAssignments) {
    assignmentMap.set(`${assign.classId}-${assign.subjectId}`, assign.teacherId);
  }

  const unavailabilityMap = new Map<string, Set<string>>();
  for (const unavail of teacherUnavailability) {
    if (!unavailabilityMap.has(unavail.teacherId)) {
      unavailabilityMap.set(unavail.teacherId, new Set());
    }
    unavailabilityMap
      .get(unavail.teacherId)!
      .add(slotKey(unavail.dayOfWeek, unavail.period));
  }

  const sessionPrefMap = new Map<string, SessionPreference>();
  for (const pref of sessionPreferences) {
    sessionPrefMap.set(pref.subjectCode.toUpperCase(), pref);
  }

  // Global teacher state (teachers can be double-booked across classes)
  const teacherStates = new Map<string, TeacherState>();
  const getTeacherState = (id: string) => {
    if (!teacherStates.has(id)) teacherStates.set(id, new TeacherState());
    return teacherStates.get(id)!;
  };

  // Per-class state
  const classStates = new Map<string, ClassState>();
  const getClassState = (id: string) => {
    if (!classStates.has(id)) classStates.set(id, new ClassState());
    return classStates.get(id)!;
  };

  let totalLessonsRequired = 0;
  let totalLessonsScheduled = 0;
  const classStatus = new Map<string, "FULL" | "PARTIAL" | "NONE">();

  // Sort classes by form, then stream index for deterministic ordering
  const sortedClasses = [...classes].sort((a, b) => {
    if (a.form !== b.form) return a.form - b.form;
    return a.streamIndex - b.streamIndex;
  });

  // Process each class
  for (const cls of sortedClasses) {
    const classReqs = requirementMap.get(cls.id) ?? [];
    const classState = getClassState(cls.id);

    let classFullyScheduled = true;

    // Sort requirements: double lessons first, then by lessons/week descending
    const sortedReqs = [...classReqs].sort((a, b) => {
      const subA = subjectMap.get(a.subjectId);
      const subB = subjectMap.get(b.subjectId);
      if (!subA || !subB) return 0;

      if (subA.doubleLesson !== subB.doubleLesson) {
        return subA.doubleLesson ? -1 : 1;
      }
      return b.lessonsPerWeek - a.lessonsPerWeek;
    });

    for (const req of sortedReqs) {
      const subject = subjectMap.get(req.subjectId);
      if (!subject) continue;

      totalLessonsRequired += req.lessonsPerWeek;

      // Get assigned teacher
      const teacherKey = `${cls.id}-${req.subjectId}`;
      const teacherId = assignmentMap.get(teacherKey);

      if (!teacherId) {
        errors.push({
          type: "TEACHER_ASSIGNMENT_VIOLATION",
          description: `No teacher assigned to ${subject.code} for ${cls.name}`,
          classId: cls.id,
          subjectId: req.subjectId,
        });
        classFullyScheduled = false;
        continue;
      }

      const teacherState = getTeacherState(teacherId);
      const unavailability = unavailabilityMap.get(teacherId) ?? new Set();

      let remaining = req.lessonsPerWeek;
      let scheduled = 0;

      // Handle double lessons
      if (subject.doubleLesson && remaining >= 2) {
        // Track which days already have a double block for this subject,
        // so we never place more than one double per day.
        const doubleBlockDaysUsed = new Set<number>();

        while (remaining >= 2) {
          const placement = placeLesson(
            cls.id,
            subject,
            teacherId,
            classState,
            teacherState,
            unavailability,
            config,
            sessionPrefMap,
            cls.streamIndex,
            true,
            doubleBlockDaysUsed
          );

          if (placement) {
            // Occupy both periods
            classState.occupy(placement.day, placement.period, subject.id);
            classState.occupy(placement.day, placement.period + 1, subject.id);
            teacherState.occupy(placement.day, placement.period);
            teacherState.occupy(placement.day, placement.period + 1);

            // Mark this day as already having a double block for this subject
            doubleBlockDaysUsed.add(placement.day);

            slots.push({
              classId: cls.id,
              dayOfWeek: placement.day,
              period: placement.period,
              subjectId: subject.id,
              teacherId,
              room: subject.requiresSpecialRoom,
            });

            slots.push({
              classId: cls.id,
              dayOfWeek: placement.day,
              period: placement.period + 1,
              subjectId: subject.id,
              teacherId,
              room: subject.requiresSpecialRoom,
            });

            remaining -= 2;
            scheduled += 2;
          } else {
            warnings.push(
              `Could not place double lesson for ${subject.code} in ${cls.name} (${scheduled}/${req.lessonsPerWeek} scheduled)`
            );
            classFullyScheduled = false;
            break;
          }
        }
      }

      // Handle remaining single lessons
      while (remaining > 0) {
        const placement = placeLesson(
          cls.id,
          subject,
          teacherId,
          classState,
          teacherState,
          unavailability,
          config,
          sessionPrefMap,
          cls.streamIndex,
          false
        );

        if (placement) {
          classState.occupy(placement.day, placement.period, subject.id);
          teacherState.occupy(placement.day, placement.period);

          slots.push({
            classId: cls.id,
            dayOfWeek: placement.day,
            period: placement.period,
            subjectId: subject.id,
            teacherId,
            room: subject.requiresSpecialRoom,
          });

          remaining--;
          scheduled++;
        } else {
          warnings.push(
            `Could not place lesson for ${subject.code} in ${cls.name} (${scheduled}/${req.lessonsPerWeek} scheduled)`
          );
          classFullyScheduled = false;
          break;
        }
      }

      totalLessonsScheduled += scheduled;

      if (scheduled < req.lessonsPerWeek) {
        errors.push({
          type: "INCOMPLETE_LESSONS",
          description: `${subject.code} in ${cls.name}: scheduled ${scheduled}/${req.lessonsPerWeek} lessons`,
          classId: cls.id,
          subjectId: req.subjectId,
        });
      }
    }

    if (classFullyScheduled && classReqs.length > 0) {
      classStatus.set(cls.id, "FULL");
    } else if (totalLessonsScheduled > 0) {
      classStatus.set(cls.id, "PARTIAL");
    } else {
      classStatus.set(cls.id, "NONE");
    }
  }

  // Calculate stats
  const classesFullyScheduled = Array.from(classStatus.values()).filter(
    (s) => s === "FULL"
  ).length;
  const classesPartiallyScheduled = Array.from(classStatus.values()).filter(
    (s) => s === "PARTIAL"
  ).length;
  const classesNotScheduled = Array.from(classStatus.values()).filter(
    (s) => s === "NONE"
  ).length;

  const completionRate =
    totalLessonsRequired > 0
      ? (totalLessonsScheduled / totalLessonsRequired) * 100
      : 0;

  return {
    success: errors.length === 0,
    slots,
    errors,
    warnings,
    stats: {
      totalLessonsScheduled,
      totalLessonsRequired,
      completionRate,
      classesFullyScheduled,
      classesPartiallyScheduled,
      classesNotScheduled,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════

export function validateTimetable(
  slots: GeneratedSlot[],
  requirements: SubjectRequirement[],
  teacherAssignments: TeacherAssignment[],
  _studentSelections: StudentSubjectSelection[],
  _config: EngineConfig
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for class double-booking
  const classOccupancy = new Map<string, Set<string>>();
  for (const slot of slots) {
    if (!classOccupancy.has(slot.classId)) {
      classOccupancy.set(slot.classId, new Set());
    }
    if (classOccupancy.get(slot.classId)!.has(`${slot.dayOfWeek}-${slot.period}`)) {
      errors.push({
        type: "CLASS_DOUBLE_BOOKED",
        description: `Class has multiple subjects at day ${slot.dayOfWeek} period ${slot.period}`,
        classId: slot.classId,
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
      });
    }
    classOccupancy.get(slot.classId)!.add(`${slot.dayOfWeek}-${slot.period}`);
  }

  // Check for teacher double-booking
  const teacherOccupancy = new Map<string, Set<string>>();
  for (const slot of slots) {
    if (!teacherOccupancy.has(slot.teacherId)) {
      teacherOccupancy.set(slot.teacherId, new Set());
    }
    const key = `${slot.dayOfWeek}-${slot.period}`;
    if (teacherOccupancy.get(slot.teacherId)!.has(key)) {
      errors.push({
        type: "TEACHER_DOUBLE_BOOKED",
        description: `Teacher teaching multiple classes at day ${slot.dayOfWeek} period ${slot.period}`,
        teacherId: slot.teacherId,
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
      });
    }
    teacherOccupancy.get(slot.teacherId)!.add(key);
  }

  // Check lesson count completeness
  const lessonCounts = new Map<string, number>();
  for (const slot of slots) {
    const key = `${slot.classId}-${slot.subjectId}`;
    lessonCounts.set(key, (lessonCounts.get(key) ?? 0) + 1);
  }

  for (const req of requirements) {
    const key = `${req.classId}-${req.subjectId}`;
    const scheduled = lessonCounts.get(key) ?? 0;
    if (scheduled < req.lessonsPerWeek) {
      errors.push({
        type: "INCOMPLETE_LESSONS",
        description: `Incomplete lesson count: ${scheduled}/${req.lessonsPerWeek} scheduled`,
        classId: req.classId,
        subjectId: req.subjectId,
      });
    }
  }

  // Check teacher assignment integrity
  const assignmentMap = new Map<string, string>();
  for (const assign of teacherAssignments) {
    assignmentMap.set(`${assign.classId}-${assign.subjectId}`, assign.teacherId);
  }

  for (const slot of slots) {
    const key = `${slot.classId}-${slot.subjectId}`;
    const expectedTeacher = assignmentMap.get(key);
    if (expectedTeacher && expectedTeacher !== slot.teacherId) {
      errors.push({
        type: "TEACHER_ASSIGNMENT_VIOLATION",
        description: `Wrong teacher assigned: expected ${expectedTeacher}, got ${slot.teacherId}`,
        classId: slot.classId,
        subjectId: slot.subjectId,
        teacherId: slot.teacherId,
      });
    }
  }

  return errors;
}
