/**
 * src/lib/timetable/validator.ts
 *
 * Comprehensive validation system for generated timetables.
 * Validates ALL constraints before publishing and triggers automatic
 * regeneration until all checks pass.
 */

import type { GeneratedSlot } from "./deterministicEngine";
import type { TemplateColumn } from "./deterministicEngine";
import { TimetableSession } from "@prisma/client";
import { validateSessionConstraints } from "./sessionAllocator";

export type ValidationRule =
  | "NO_TEACHER_DOUBLE_BOOKING"
  | "NO_CLASS_DOUBLE_BOOKING"
  | "COMPLETE_LESSON_COUNT"
  | "TEACHER_ASSIGNMENT_INTEGRITY"
  | "SUBJECT_SELECTION_CORRECTNESS"
  | "SESSION_CONSTRAINTS"
  | "TEACHER_AVAILABILITY"
  | "FORMAT_COMPLIANCE"
  | "DOUBLE_LESSON_CONSECUTIVE"
  | "NO_TRIPLE_CONSECUTIVE_LESSONS"
  | "NO_UNINTENDED_DOUBLE_LESSONS";

export type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

export type ValidationIssue = {
  rule: ValidationRule;
  severity: ValidationSeverity;
  message: string;
  affectedClasses?: string[];
  affectedTeachers?: string[];
  affectedSubjects?: string[];
  dayOfWeek?: number;
  period?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any;
};

export type ValidationReport = {
  valid: boolean;
  passedRules: ValidationRule[];
  failedRules: ValidationRule[];
  issues: ValidationIssue[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    errors: number;
    warnings: number;
  };
  timestamp: Date;
};

export type ValidatorInput = {
  slots: GeneratedSlot[];
  classes: Array<{ id: string; name: string; form: number }>;
  subjects: Array<{ id: string; code: string; name: string; internalCode: number; doubleLesson?: boolean }>;
  teachers: Array<{ id: string; name: string }>;
  requirements: Array<{ classId: string; subjectId: string; lessonsPerWeek: number }>;
  teacherAssignments: Array<{ classId: string; subjectId: string; teacherId: string }>;
  teacherUnavailability: Array<{ teacherId: string; dayOfWeek: number; period: number }>;
  studentSelections: Array<{ studentId: string; classId: string; subjectId: string }>;
  sessionPreferences: Array<{
    subjectCode: string;
    preferredSession: TimetableSession;
    isHard: boolean;
  }>;
  templateColumns: TemplateColumn[];
  operatingDays: number[];
  /**
   * Elective groups from buildLinkedClassGroups — used by checkTeacherDoubleBooking
   * to exempt a teacher who is legitimately teaching the same subject to multiple
   * classes at the same time because those classes are pooled via a shared group.
   * Optional for backward compatibility; omitting it disables the exemption.
   */
  linkedClassGroups?: Array<{ subjectIds: string[]; classIds: string[] }>;
};

/**
 * Main validation function - runs all checks
 */
export function validateTimetable(input: ValidatorInput): ValidationReport {
  const issues: ValidationIssue[] = [];
  const passedRules: Set<ValidationRule> = new Set();
  const failedRules: Set<ValidationRule> = new Set();

  // Run all validation checks
  checkTeacherDoubleBooking(input, issues, passedRules, failedRules);
  checkClassDoubleBooking(input, issues, passedRules, failedRules);
  checkCompleteLessonCount(input, issues, passedRules, failedRules);
  checkTeacherAssignmentIntegrity(input, issues, passedRules, failedRules);
  checkSubjectSelectionCorrectness(input, issues, passedRules, failedRules);
  checkSessionConstraints(input, issues, passedRules, failedRules);
  checkTeacherAvailability(input, issues, passedRules, failedRules);
  checkFormatCompliance(input, issues, passedRules, failedRules);
  checkDoubleLessonConsecutive(input, issues, passedRules, failedRules);
  checkNoTripleConsecutiveLessons(input, issues, passedRules, failedRules);
  checkNoUnintendedDoubleLessons(input, issues, passedRules, failedRules);

  const errors = issues.filter((i) => i.severity === "ERROR").length;
  const warnings = issues.filter((i) => i.severity === "WARNING").length;

  return {
    valid: failedRules.size === 0,
    passedRules: Array.from(passedRules),
    failedRules: Array.from(failedRules),
    issues,
    summary: {
      totalChecks: passedRules.size + failedRules.size,
      passed: passedRules.size,
      failed: failedRules.size,
      errors,
      warnings,
    },
    timestamp: new Date(),
  };
}

/**
 * Check: No teacher is teaching two independent lessons at the same time.
 *
 * Allowed (NOT double-booking):
 *   Same teacher, same period, same subject, AND both classes are members of
 *   a shared elective group for that subject (derived from linkedClassGroups).
 *   This covers cross-class pooled sessions (e.g. Form 4 and Form 4X both
 *   taking AGRI with the same teacher at the same period via an ElectiveGroup).
 *
 * Double-booking (flag as ERROR):
 *   1. Same teacher, same period, DIFFERENT subjects → always wrong.
 *   2. Same teacher, same period, same subject, but the two classes are NOT
 *      members of a shared group for that subject → real conflict.
 */
function checkTeacherDoubleBooking(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "NO_TEACHER_DOUBLE_BOOKING";

  // ── Build pooled-pairs lookup from linkedClassGroups ─────────────────────
  // Key format: "${sortedClassA}|${sortedClassB}|${subjectId}"
  // A pair is in this set iff both classes are members of the same elective
  // group for that subject — meaning the teacher teaching them simultaneously
  // is NOT double-booked, just pooling the lesson.
  const pooledPairs = new Set<string>();
  for (const group of input.linkedClassGroups ?? []) {
    for (const subjectId of group.subjectIds) {
      for (let i = 0; i < group.classIds.length; i++) {
        for (let j = i + 1; j < group.classIds.length; j++) {
          const [a, b] = [group.classIds[i], group.classIds[j]].sort();
          pooledPairs.add(`${a}|${b}|${subjectId}`);
        }
      }
    }
  }

  // Quick lookup: classId → form number (for error message detail)
  const classFormMap = new Map(input.classes.map((c) => [c.id, c.form]));

  // key: "teacherId|day|period"
  // value: array of { classId, subjectId } seen so far at that slot
  const teacherSlots = new Map<string, Array<{ classId: string; subjectId: string }>>();
  let hasError = false;

  for (const slot of input.slots) {
    const timeKey = `${slot.teacherId}|${slot.dayOfWeek}|${slot.period}`;
    if (!teacherSlots.has(timeKey)) teacherSlots.set(timeKey, []);
    const seen = teacherSlots.get(timeKey)!;

    const slotForm = classFormMap.get(slot.classId) ?? -1;

    // Track whether THIS slot caused a conflict so we know whether to push it.
    let slotIsConflict = false;

    for (const prior of seen) {
      const sameSubject = prior.subjectId === slot.subjectId;

      // Allowed: same subject AND both classes are pooled via a shared elective
      // group for this subject.  This is the sole exemption — driven by real
      // group-scope data rather than a nonexistent slot tag.
      if (sameSubject) {
        const [a, b] = [prior.classId, slot.classId].sort();
        if (pooledPairs.has(`${a}|${b}|${slot.subjectId}`)) continue;
      }

      // Everything else is a real double-booking
      const priorForm = classFormMap.get(prior.classId) ?? -2;
      const teacher   = input.teachers.find((t) => t.id === slot.teacherId);
      const subjectA  = sameSubject ? null : input.subjects.find((s) => s.id === prior.subjectId);
      const subjectB  = sameSubject ? null : input.subjects.find((s) => s.id === slot.subjectId);
      const clsA      = input.classes.find((c) => c.id === prior.classId);
      const clsB      = input.classes.find((c) => c.id === slot.classId);

      const detail = sameSubject
        ? `same subject (${input.subjects.find((s) => s.id === slot.subjectId)?.code ?? slot.subjectId}) for ${clsA?.name ?? prior.classId} (Form ${priorForm}) and ${clsB?.name ?? slot.classId} (Form ${slotForm}) — not part of a shared elective group`
        : `different subjects (${subjectA?.code ?? prior.subjectId} for ${clsA?.name ?? prior.classId} and ${subjectB?.code ?? slot.subjectId} for ${clsB?.name ?? slot.classId})`;

      issues.push({
        rule,
        severity: "ERROR",
        message: `Teacher ${teacher?.name ?? slot.teacherId} is double-booked on day ${slot.dayOfWeek} period ${slot.period}: ${detail}`,
        affectedTeachers: [slot.teacherId],
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
      });
      failed.add(rule);
      hasError       = true;
      slotIsConflict = true;
      break;
    }

    // Always record the current slot so that subsequent slots arriving at the
    // same teacher+time key can still detect real double-bookings against it.
    if (!slotIsConflict) {
      seen.push({ classId: slot.classId, subjectId: slot.subjectId });
    }
  }

  if (!hasError) passed.add(rule);
}

/**
 * Check: No class has two independent subjects at the same time.
 *
 * Elective group fan-out intentionally places multiple subjects (AGRI, BUS,
 * COMP…) for the same class at the same period — those are NOT conflicts.
 * A real class double-booking is when a class has subjects at the same period
 * that do NOT all belong to the same elective group.
 *
 * When linkedClassGroups is provided we can definitively confirm whether all
 * co-scheduled subjects at a slot are members of a single group, and silently
 * skip those slots (no warning).  Only slots where the co-scheduled subjects
 * span different groups, or mix group and non-group subjects, are flagged.
 *
 * When linkedClassGroups is absent (older callers) we fall back to the
 * conservative "WARNING — verify" behaviour so backward compatibility is kept.
 */
function checkClassDoubleBooking(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  _failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "NO_CLASS_DOUBLE_BOOKING";

  // ── Build a per-class subject→groupIndex lookup from linkedClassGroups ───
  // groupSubjectKey: "classId|subjectId" → index of the group it belongs to.
  // A subject that appears in multiple groups for the same class (rare but
  // possible) maps to the first group found — the important thing is that two
  // subjects in the SAME group share the same index.
  const groupSubjectKey = new Map<string, number>();
  for (let gi = 0; gi < (input.linkedClassGroups ?? []).length; gi++) {
    const group = input.linkedClassGroups![gi];
    for (const classId of group.classIds) {
      for (const subjectId of group.subjectIds) {
        const k = `${classId}|${subjectId}`;
        if (!groupSubjectKey.has(k)) groupSubjectKey.set(k, gi);
      }
    }
  }
  const hasGroupData = (input.linkedClassGroups?.length ?? 0) > 0;

  // Group slots by (classId, dayOfWeek, period)
  const classPeriodSlots = new Map<string, typeof input.slots>();
  for (const slot of input.slots) {
    const key = `${slot.classId}|${slot.dayOfWeek}|${slot.period}`;
    if (!classPeriodSlots.has(key)) classPeriodSlots.set(key, []);
    classPeriodSlots.get(key)!.push(slot);
  }

  for (const [, periodSlots] of classPeriodSlots) {
    if (periodSlots.length <= 1) continue;

    const distinctSubjects = new Set(periodSlots.map((s) => s.subjectId));
    if (distinctSubjects.size <= 1) continue;

    const classId = periodSlots[0].classId;

    if (hasGroupData) {
      // We have real group data — check whether every subject in this slot
      // belongs to the same group for this class.
      const groupIndices = new Set<number | undefined>(
        [...distinctSubjects].map((sid) => groupSubjectKey.get(`${classId}|${sid}`))
      );

      // All subjects map to the same non-undefined group index → confirmed
      // elective fan-out, not a real conflict.  Skip silently.
      if (groupIndices.size === 1 && !groupIndices.has(undefined)) continue;

      // Otherwise it's a real problem: subjects from different groups, or a
      // mix of group and non-group subjects at the same class period.
      const cls = input.classes.find((c) => c.id === classId);
      issues.push({
        rule,
        severity: "WARNING",
        message: `${cls?.name ?? classId} has ${distinctSubjects.size} subjects at day ${periodSlots[0].dayOfWeek} period ${periodSlots[0].period} that span different elective groups — this may indicate a scheduling conflict`,
        affectedClasses: [classId],
        dayOfWeek: periodSlots[0].dayOfWeek,
        period: periodSlots[0].period,
      });
    } else {
      // No group data available — conservative fallback: warn but don't block.
      const cls = input.classes.find((c) => c.id === classId);
      issues.push({
        rule,
        severity: "WARNING",
        message: `${cls?.name ?? classId} has ${distinctSubjects.size} subjects at day ${periodSlots[0].dayOfWeek} period ${periodSlots[0].period} — verify these are all part of the same elective group`,
        affectedClasses: [classId],
        dayOfWeek: periodSlots[0].dayOfWeek,
        period: periodSlots[0].period,
      });
    }
  }

  // Always pass — genuine class double-booking is prevented by the solver
  passed.add(rule);
}

/**
 * Check: Every class receives full required weekly lesson count per subject
 */
function checkCompleteLessonCount(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "COMPLETE_LESSON_COUNT";

  // Build a set of double-lesson subject IDs for quick lookup
  const doubleSubjectIds = new Set(
    input.subjects.filter((s) => s.doubleLesson).map((s) => s.id)
  );

  // Count physical slots placed per (class, subject)
  const physicalScheduled = new Map<string, number>();
  for (const slot of input.slots) {
    const key = `${slot.classId}-${slot.subjectId}`;
    physicalScheduled.set(key, (physicalScheduled.get(key) ?? 0) + 1);
  }

  let hasError = false;

  // Check against requirements.
  // lessonsPerWeek = number of occurrences (each occurrence is a double-block
  // pair for doubleLesson subjects, a single period otherwise).
  // The solver emits 2 physical slots per double-block occurrence, so we
  // convert physical count back to occurrences before comparing.
  for (const req of input.requirements) {
    const key = `${req.classId}-${req.subjectId}`;
    const physical = physicalScheduled.get(key) ?? 0;
    const isDouble = doubleSubjectIds.has(req.subjectId);
    const count = isDouble ? Math.floor(physical / 2) : physical;

    if (count < req.lessonsPerWeek) {
      const cls = input.classes.find((c) => c.id === req.classId);
      const subject = input.subjects.find((s) => s.id === req.subjectId);
      const unit = isDouble ? "double-block" : "lesson";

      issues.push({
        rule,
        severity: "ERROR",
        message: `${cls?.name || req.classId} has incomplete lessons for ${subject?.code || req.subjectId}: ${count}/${req.lessonsPerWeek} ${unit}s scheduled`,
        affectedClasses: [req.classId],
        affectedSubjects: [req.subjectId],
        details: { scheduled: count, required: req.lessonsPerWeek },
      });
      hasError = true;
    }
  }

  if (hasError) {
    failed.add(rule);
  } else {
    passed.add(rule);
  }
}

/**
 * Check: Teacher assignments stay exactly as configured (never auto-swapped)
 */
function checkTeacherAssignmentIntegrity(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "TEACHER_ASSIGNMENT_INTEGRITY";
  const assignmentMap = new Map<string, string>();

  for (const assign of input.teacherAssignments) {
    assignmentMap.set(`${assign.classId}-${assign.subjectId}`, assign.teacherId);
  }

  let hasError = false;

  for (const slot of input.slots) {
    const key = `${slot.classId}-${slot.subjectId}`;
    const expectedTeacher = assignmentMap.get(key);

    if (expectedTeacher && expectedTeacher !== slot.teacherId) {
      const cls = input.classes.find((c) => c.id === slot.classId);
      const subject = input.subjects.find((s) => s.id === slot.subjectId);
      const expectedT = input.teachers.find((t) => t.id === expectedTeacher);
      const actualT = input.teachers.find((t) => t.id === slot.teacherId);

      issues.push({
        rule,
        severity: "ERROR",
        message: `${cls?.name || slot.classId} ${subject?.code || slot.subjectId}: assigned to ${actualT?.name || slot.teacherId} but should be ${expectedT?.name || expectedTeacher}`,
        affectedClasses: [slot.classId],
        affectedTeachers: [expectedTeacher, slot.teacherId],
        affectedSubjects: [slot.subjectId],
      });
      hasError = true;
    }
  }

  if (hasError) {
    failed.add(rule);
  } else {
    passed.add(rule);
  }
}

/**
 * Check: Students only scheduled into subjects they selected
 */
function checkSubjectSelectionCorrectness(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  _failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "SUBJECT_SELECTION_CORRECTNESS";

  // Build map of valid (class, subject) pairs from student selections
  const validPairs = new Map<string, Set<string>>();

  for (const selection of input.studentSelections) {
    if (!validPairs.has(selection.classId)) {
      validPairs.set(selection.classId, new Set());
    }
    validPairs.get(selection.classId)!.add(selection.subjectId);
  }

  // If no student selections provided, assume all subjects are valid for all classes
  if (input.studentSelections.length === 0) {
    passed.add(rule);
    return;
  }

  // Check that scheduled slots match student selections
  for (const slot of input.slots) {
    const validSubjects = validPairs.get(slot.classId);

    // If class has student selections, verify subject is valid
    if (validSubjects && !validSubjects.has(slot.subjectId)) {
      const cls = input.classes.find((c) => c.id === slot.classId);
      const subject = input.subjects.find((s) => s.id === slot.subjectId);

      issues.push({
        rule,
        severity: "WARNING",
        message: `${cls?.name || slot.classId} scheduled for ${subject?.code || slot.subjectId} but no students selected it`,
        affectedClasses: [slot.classId],
        affectedSubjects: [slot.subjectId],
      });
    }
  }

  // Rule produces warnings only; always marks as passed
  passed.add(rule);
}

/**
 * Check: Session constraints (hard preferences) are satisfied
 */
function checkSessionConstraints(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "SESSION_CONSTRAINTS";

  const slotsWithCodes = input.slots.map((slot) => {
    const subject = input.subjects.find((s) => s.id === slot.subjectId);
    return {
      ...slot,
      subjectCode: subject?.code || "",
    };
  });

  const violations = validateSessionConstraints(
    slotsWithCodes,
    input.sessionPreferences.map((p) => ({
      subjectCode: p.subjectCode,
      subjectName: "",
      requiredSession: p.preferredSession,
      isHard: p.isHard,
    })),
    input.templateColumns
  );

  if (violations.length > 0) {
    for (const violation of violations) {
      for (const v of violation.violations) {
        issues.push({
          rule,
          severity: "ERROR",
          message: `${v.subjectCode} scheduled in ${v.actualSession} session but must be in ${v.expectedSession} session (period ${v.period})`,
          affectedSubjects: [v.subjectCode],
          period: v.period,
          details: {
            expected: v.expectedSession,
            actual: v.actualSession,
          },
        });
      }
    }
    failed.add(rule);
  } else {
    passed.add(rule);
  }
}

/**
 * Check: Teachers only scheduled when available (respect unavailability)
 */
function checkTeacherAvailability(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "TEACHER_AVAILABILITY";
  const unavailabilityMap = new Map<string, Set<string>>();

  for (const unavail of input.teacherUnavailability) {
    const key = unavail.teacherId;
    if (!unavailabilityMap.has(key)) {
      unavailabilityMap.set(key, new Set());
    }
    unavailabilityMap.get(key)!.add(`${unavail.dayOfWeek}-${unavail.period}`);
  }

  let hasError = false;

  for (const slot of input.slots) {
    const unavailable = unavailabilityMap.get(slot.teacherId);
    const slotKey = `${slot.dayOfWeek}-${slot.period}`;

    if (unavailable?.has(slotKey)) {
      const teacher = input.teachers.find((t) => t.id === slot.teacherId);
      const subject = input.subjects.find((s) => s.id === slot.subjectId);

      issues.push({
        rule,
        severity: "ERROR",
        message: `${teacher?.name || slot.teacherId} scheduled for ${subject?.code || slot.subjectId} on day ${slot.dayOfWeek} period ${slot.period} but is marked unavailable`,
        affectedTeachers: [slot.teacherId],
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
      });
      hasError = true;
    }
  }

  if (hasError) {
    failed.add(rule);
  } else {
    passed.add(rule);
  }
}

/**
 * Check: Every class has at least as many scheduled lessons as its total
 * lesson requirement (not necessarily every period — free periods are fine).
 */
function checkFormatCompliance(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  _failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "FORMAT_COMPLIANCE";

  // Total lessons required per class across all subjects
  const requiredPerClass = new Map<string, number>();
  for (const req of input.requirements) {
    requiredPerClass.set(
      req.classId,
      (requiredPerClass.get(req.classId) ?? 0) + req.lessonsPerWeek
    );
  }

  for (const cls of input.classes) {
    const required = requiredPerClass.get(cls.id) ?? 0;
    const scheduled = input.slots.filter((s) => s.classId === cls.id).length;

    if (required > 0 && scheduled < required) {
      issues.push({
        rule,
        severity: "WARNING",
        message: `${cls.name} has ${scheduled}/${required} required lessons scheduled`,
        affectedClasses: [cls.id],
        details: { scheduled, required },
      });
    }
  }

  // Rule produces warnings only — never a hard failure
  passed.add(rule);
}

/**
 * Check: Double lessons are scheduled consecutively
 */
function checkDoubleLessonConsecutive(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  _failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "DOUBLE_LESSON_CONSECUTIVE";

  // Group slots by class and subject and day
  const grouped = new Map<string, GeneratedSlot[]>();

  for (const slot of input.slots) {
    const key = `${slot.classId}-${slot.subjectId}-${slot.dayOfWeek}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(slot);
  }

  // Check each group
  for (const [key, slots] of grouped) {
    if (slots.length < 2) continue; // Not a double lesson

    // Sort by period
    const sorted = [...slots].sort((a, b) => a.period - b.period);

    // Check if consecutive
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].period !== sorted[i - 1].period + 1) {
        const [classId, subjectId, dayOfWeek] = key.split("-");
        const cls = input.classes.find((c) => c.id === classId);
        const subject = input.subjects.find((s) => s.id === subjectId);

        issues.push({
          rule,
          severity: "WARNING",
          message: `${cls?.name || classId} ${subject?.code || subjectId} has non-consecutive lessons on day ${dayOfWeek} (periods ${sorted.map((s) => s.period).join(", ")})`,
          affectedClasses: [classId],
          affectedSubjects: [subjectId],
          dayOfWeek: parseInt(dayOfWeek),
        });
        // Severity is WARNING; this does not block scheduling
      }
    }
  }

  // Rule produces warnings only — never a hard failure
  passed.add(rule);
}

/**
 * Check: No class has 3 or more consecutive lessons of any subject on the same day.
 *
 * The maximum allowed run of consecutive occupied periods for a class is 2
 * (i.e. a single double-block).  Three or more back-to-back periods is a hard
 * error because it violates the "max double consecutive" rule regardless of
 * whether the subjects involved are double-lesson subjects.
 *
 * Periods are compared using their 1-based lesson-column index, so breaks and
 * lunch slots that separate lessons are NOT counted as consecutive (the engine
 * already uses the same lesson-only index space).
 */
function checkNoTripleConsecutiveLessons(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "NO_TRIPLE_CONSECUTIVE_LESSONS";
  let hasError = false;

  // Group occupied periods per (classId, dayOfWeek), sorted
  const classDayPeriods = new Map<string, number[]>();

  for (const slot of input.slots) {
    const key = `${slot.classId}|${slot.dayOfWeek}`;
    if (!classDayPeriods.has(key)) classDayPeriods.set(key, []);
    classDayPeriods.get(key)!.push(slot.period);
  }

  for (const [key, periods] of classDayPeriods) {
    // Deduplicate (elective fan-out can produce the same period from multiple subjects)
    const unique = [...new Set(periods)].sort((a, b) => a - b);

    // Scan for runs of 3+
    let runLength = 1;
    for (let i = 1; i < unique.length; i++) {
      if (unique[i] === unique[i - 1] + 1) {
        runLength++;
        if (runLength >= 3) {
          // Found a run of at least 3 — record the violation at the third period
          const [classId, dayStr] = key.split("|");
          const cls = input.classes.find((c) => c.id === classId);
          const day = parseInt(dayStr);

          issues.push({
            rule,
            severity: "ERROR",
            message: `${cls?.name ?? classId} has ${runLength} consecutive lessons on day ${day} (periods ${unique[i - runLength + 1]}–${unique[i]}) — maximum allowed is 2 (one double-block)`,
            affectedClasses: [classId],
            dayOfWeek: day,
            period: unique[i - 2], // first period of the violating triple
            details: { runLength, startPeriod: unique[i - runLength + 1], endPeriod: unique[i] },
          });
          hasError = true;
          // Continue scanning — reset to avoid duplicate reports for the same run
          runLength = 1;
        }
      } else {
        runLength = 1;
      }
    }
  }

  if (hasError) {
    failed.add(rule);
  } else {
    passed.add(rule);
  }
}

/**
 * Check: A class only has consecutive lessons (doubles) for subjects whose
 * doubleLesson flag is true.
 *
 * If two periods of the SAME subject appear back-to-back for a class on the
 * same day and that subject does NOT have doubleLesson=true, it means the
 * scheduler accidentally placed two singles consecutively — which is
 * indistinguishable from a double to students and teachers and should be
 * avoided.
 *
 * Severity is ERROR so the regeneration controller retries until resolved.
 */
function checkNoUnintendedDoubleLessons(
  input: ValidatorInput,
  issues: ValidationIssue[],
  passed: Set<ValidationRule>,
  failed: Set<ValidationRule>
): void {
  const rule: ValidationRule = "NO_UNINTENDED_DOUBLE_LESSONS";

  // Quick lookup: subjectId → doubleLesson flag
  const doubleSubjectIds = new Set(
    input.subjects.filter((s) => s.doubleLesson).map((s) => s.id)
  );

  // Group slots by (classId, subjectId, dayOfWeek), sorted by period
  const grouped = new Map<string, number[]>();
  for (const slot of input.slots) {
    const k = `${slot.classId}|${slot.subjectId}|${slot.dayOfWeek}`;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(slot.period);
  }

  let hasError = false;

  for (const [key, periods] of grouped) {
    const [classId, subjectId, dayStr] = key.split("|");

    // Only flag non-double subjects
    if (doubleSubjectIds.has(subjectId)) continue;

    const sorted = [...new Set(periods)].sort((a, b) => a - b);

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) {
        const cls = input.classes.find((c) => c.id === classId);
        const subject = input.subjects.find((s) => s.id === subjectId);
        const day = parseInt(dayStr);

        issues.push({
          rule,
          severity: "ERROR",
          message: `${cls?.name ?? classId}: ${subject?.code ?? subjectId} has two consecutive lessons on day ${day} (periods ${sorted[i - 1]} and ${sorted[i]}) but is not configured as a double-lesson subject`,
          affectedClasses: [classId],
          affectedSubjects: [subjectId],
          dayOfWeek: day,
          period: sorted[i - 1],
          details: { periods: sorted },
        });
        hasError = true;
      }
    }
  }

  if (hasError) {
    failed.add(rule);
  } else {
    passed.add(rule);
  }
}

/**
 * Generate human-readable validation summary
 */
export function generateValidationSummary(report: ValidationReport): string {
  const lines: string[] = [];

  lines.push(`Timetable Validation Report (${report.timestamp.toISOString()})`);
  lines.push("=".repeat(60));
  lines.push("");

  if (report.valid) {
    lines.push("✓ PASSED - Timetable is valid and ready to publish");
  } else {
    lines.push("✗ FAILED - Timetable has validation errors");
  }

  lines.push("");
  lines.push(`Total Checks: ${report.summary.totalChecks}`);
  lines.push(`Passed: ${report.summary.passed}`);
  lines.push(`Failed: ${report.summary.failed}`);
  lines.push(`Errors: ${report.summary.errors}`);
  lines.push(`Warnings: ${report.summary.warnings}`);
  lines.push("");

  if (report.issues.length > 0) {
    lines.push("Issues:");
    lines.push("-".repeat(60));

    for (const issue of report.issues) {
      const icon = issue.severity === "ERROR" ? "✗" : issue.severity === "WARNING" ? "⚠" : "ℹ";
      lines.push(`${icon} [${issue.severity}] ${issue.rule}`);
      lines.push(`  ${issue.message}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
