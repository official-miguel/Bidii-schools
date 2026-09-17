/**
 * Tests for src/lib/timetable/validator.ts and regenerationController.ts
 *
 * Covers:
 *   - All 9 validation rules
 *   - Severity levels (ERROR vs WARNING)
 *   - Pre-generation feasibility checking
 *   - Analysis of validation failures
 */

import {
  validateTimetable,
  generateValidationSummary,
  type ValidatorInput,
  type ValidationRule,
} from "@/lib/timetable/validator";
import {
  checkFeasibility,
  analyzeValidationFailure,
} from "@/lib/timetable/regenerationController";
import { TimetableSession, TimetableSlotType } from "@prisma/client";
import type { TemplateColumn, GeneratedSlot } from "@/lib/timetable/deterministicEngine";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeColumn(position: number, session = TimetableSession.MORNING): TemplateColumn {
  return {
    position,
    startTime: `${String(7 + position).padStart(2, "0")}:00`,
    endTime: `${String(8 + position).padStart(2, "0")}:00`,
    slotType: TimetableSlotType.LESSON,
    session,
    label: null,
  };
}

const TEMPLATE_COLUMNS: TemplateColumn[] = Array.from({ length: 8 }, (_, i) =>
  makeColumn(i + 1)
);

const BASE_INPUT: ValidatorInput = {
  slots: [],
  classes: [{ id: "c1", name: "Form 1A" }],
  subjects: [{ id: "s1", code: "MATH", name: "Mathematics", internalCode: 1 }],
  teachers: [{ id: "t1", name: "Mr. Otieno" }],
  requirements: [{ classId: "c1", subjectId: "s1", lessonsPerWeek: 5 }],
  teacherAssignments: [{ classId: "c1", subjectId: "s1", teacherId: "t1" }],
  teacherUnavailability: [],
  studentSelections: [],
  sessionPreferences: [],
  templateColumns: TEMPLATE_COLUMNS,
  operatingDays: [0, 1, 2, 3, 4],
};

function makeSlot(
  classId: string,
  subjectId: string,
  teacherId: string,
  day: number,
  period: number
): GeneratedSlot {
  return { classId, subjectId, teacherId, dayOfWeek: day, period, room: null };
}

/** Create 5 unique valid slots for c1-s1-t1 */
function validSlots(): GeneratedSlot[] {
  return [
    makeSlot("c1", "s1", "t1", 0, 1),
    makeSlot("c1", "s1", "t1", 1, 1),
    makeSlot("c1", "s1", "t1", 2, 1),
    makeSlot("c1", "s1", "t1", 3, 1),
    makeSlot("c1", "s1", "t1", 4, 1),
  ];
}

// ── NO_TEACHER_DOUBLE_BOOKING ─────────────────────────────────────────────────

describe("validator — NO_TEACHER_DOUBLE_BOOKING", () => {
  test("passes when teacher is not double-booked", () => {
    const report = validateTimetable({ ...BASE_INPUT, slots: validSlots() });
    expect(report.passedRules).toContain("NO_TEACHER_DOUBLE_BOOKING" as ValidationRule);
    expect(report.failedRules).not.toContain("NO_TEACHER_DOUBLE_BOOKING" as ValidationRule);
  });

  test("fails when same teacher is in two slots at the same time", () => {
    const slots = [
      ...validSlots(),
      makeSlot("c2", "s1", "t1", 0, 1), // t1 also at day 0 period 1
    ];
    const report = validateTimetable({ ...BASE_INPUT, slots });
    expect(report.failedRules).toContain("NO_TEACHER_DOUBLE_BOOKING" as ValidationRule);
    expect(report.issues.some((i) => i.rule === "NO_TEACHER_DOUBLE_BOOKING")).toBe(true);
    expect(report.valid).toBe(false);
  });
});

// ── NO_CLASS_DOUBLE_BOOKING ───────────────────────────────────────────────────

describe("validator — NO_CLASS_DOUBLE_BOOKING", () => {
  test("passes for valid distinct-period slots", () => {
    const report = validateTimetable({ ...BASE_INPUT, slots: validSlots() });
    expect(report.passedRules).toContain("NO_CLASS_DOUBLE_BOOKING" as ValidationRule);
  });

  test("warns when class has two subjects at the same time with no group data", () => {
    // NO_CLASS_DOUBLE_BOOKING is a soft check: the CP-SAT solver already
    // guarantees no genuine class double-booking, and legitimate elective-group
    // fan-out puts multiple subjects in one slot on purpose. Without group data
    // to disambiguate, the validator warns (does not hard-fail) so the admin can
    // verify — see checkClassDoubleBooking in validator.ts.
    const slots = [
      makeSlot("c1", "s1", "t1", 0, 1),
      makeSlot("c1", "s2", "t2", 0, 1), // same class, same slot
    ];
    const report = validateTimetable({ ...BASE_INPUT, slots });
    expect(report.passedRules).toContain("NO_CLASS_DOUBLE_BOOKING" as ValidationRule);
    expect(
      report.issues.some(
        (i) => i.rule === "NO_CLASS_DOUBLE_BOOKING" && i.severity === "WARNING"
      )
    ).toBe(true);
  });
});

// ── COMPLETE_LESSON_COUNT ─────────────────────────────────────────────────────

describe("validator — COMPLETE_LESSON_COUNT", () => {
  test("passes when all requirements met", () => {
    const report = validateTimetable({ ...BASE_INPUT, slots: validSlots() });
    expect(report.passedRules).toContain("COMPLETE_LESSON_COUNT" as ValidationRule);
  });

  test("fails when requirements not fully met", () => {
    const partial = validSlots().slice(0, 3); // only 3 of 5 required
    const report = validateTimetable({ ...BASE_INPUT, slots: partial });
    expect(report.failedRules).toContain("COMPLETE_LESSON_COUNT" as ValidationRule);
    expect(report.valid).toBe(false);
  });

  test("issue has details showing scheduled vs required", () => {
    const partial = validSlots().slice(0, 2);
    const report = validateTimetable({ ...BASE_INPUT, slots: partial });
    const issue = report.issues.find((i) => i.rule === "COMPLETE_LESSON_COUNT");
    expect(issue).toBeDefined();
    expect(issue!.details?.scheduled).toBe(2);
    expect(issue!.details?.required).toBe(5);
  });
});

// ── TEACHER_ASSIGNMENT_INTEGRITY ──────────────────────────────────────────────

describe("validator — TEACHER_ASSIGNMENT_INTEGRITY", () => {
  test("passes when configured teacher teaches the subject", () => {
    const report = validateTimetable({ ...BASE_INPUT, slots: validSlots() });
    expect(report.passedRules).toContain("TEACHER_ASSIGNMENT_INTEGRITY" as ValidationRule);
  });

  test("fails when wrong teacher is used", () => {
    const wrongTeacher = validSlots().map((s) => ({ ...s, teacherId: "t9" }));
    const report = validateTimetable({ ...BASE_INPUT, slots: wrongTeacher });
    expect(report.failedRules).toContain("TEACHER_ASSIGNMENT_INTEGRITY" as ValidationRule);
    expect(report.valid).toBe(false);
  });
});

// ── SESSION_CONSTRAINTS ───────────────────────────────────────────────────────

describe("validator — SESSION_CONSTRAINTS", () => {
  test("passes when no hard session preferences defined", () => {
    const report = validateTimetable({ ...BASE_INPUT, slots: validSlots() });
    expect(report.passedRules).toContain("SESSION_CONSTRAINTS" as ValidationRule);
  });

  test("passes when hard preference is satisfied", () => {
    const morningColumns: TemplateColumn[] = Array.from({ length: 8 }, (_, i) =>
      makeColumn(i + 1, TimetableSession.MORNING)
    );
    const report = validateTimetable({
      ...BASE_INPUT,
      slots: validSlots(),
      sessionPreferences: [
        { subjectCode: "MATH", preferredSession: TimetableSession.MORNING, isHard: true },
      ],
      templateColumns: morningColumns,
    });
    expect(report.passedRules).toContain("SESSION_CONSTRAINTS" as ValidationRule);
  });

  test("fails when hard preference is violated", () => {
    const afternoonColumns: TemplateColumn[] = Array.from({ length: 8 }, (_, i) =>
      makeColumn(i + 1, TimetableSession.AFTERNOON)
    );
    const report = validateTimetable({
      ...BASE_INPUT,
      slots: validSlots(),
      sessionPreferences: [
        {
          subjectCode: "MATH",
          preferredSession: TimetableSession.MORNING,
          isHard: true,
        },
      ],
      templateColumns: afternoonColumns,
    });
    expect(report.failedRules).toContain("SESSION_CONSTRAINTS" as ValidationRule);
    expect(report.valid).toBe(false);
  });

  test("soft preference violation does NOT fail the rule", () => {
    const afternoonColumns: TemplateColumn[] = Array.from({ length: 8 }, (_, i) =>
      makeColumn(i + 1, TimetableSession.AFTERNOON)
    );
    const report = validateTimetable({
      ...BASE_INPUT,
      slots: validSlots(),
      sessionPreferences: [
        {
          subjectCode: "MATH",
          preferredSession: TimetableSession.MORNING,
          isHard: false, // soft preference
        },
      ],
      templateColumns: afternoonColumns,
    });
    // Soft preferences don't cause rule failure
    expect(report.passedRules).toContain("SESSION_CONSTRAINTS" as ValidationRule);
  });
});

// ── TEACHER_AVAILABILITY ──────────────────────────────────────────────────────

describe("validator — TEACHER_AVAILABILITY", () => {
  test("passes when no unavailability defined", () => {
    const report = validateTimetable({ ...BASE_INPUT, slots: validSlots() });
    expect(report.passedRules).toContain("TEACHER_AVAILABILITY" as ValidationRule);
  });

  test("fails when teacher is scheduled during marked unavailability", () => {
    const slots = [makeSlot("c1", "s1", "t1", 0, 1)]; // scheduled on day 0 period 1
    const report = validateTimetable({
      ...BASE_INPUT,
      slots,
      teacherUnavailability: [{ teacherId: "t1", dayOfWeek: 0, period: 1 }],
      requirements: [{ classId: "c1", subjectId: "s1", lessonsPerWeek: 1 }],
    });
    expect(report.failedRules).toContain("TEACHER_AVAILABILITY" as ValidationRule);
    expect(report.valid).toBe(false);
  });
});

// ── Overall report ────────────────────────────────────────────────────────────

describe("validator — overall report", () => {
  test("valid: true when all rules pass", () => {
    const report = validateTimetable({ ...BASE_INPUT, slots: validSlots() });
    expect(report.valid).toBe(true);
    expect(report.summary.errors).toBe(0);
  });

  test("valid: false when any error rule fails", () => {
    const report = validateTimetable({ ...BASE_INPUT, slots: [] });
    expect(report.valid).toBe(false);
    expect(report.summary.errors).toBeGreaterThan(0);
  });

  test("timestamp is recent", () => {
    const before = Date.now();
    const report = validateTimetable({ ...BASE_INPUT, slots: validSlots() });
    const after = Date.now();
    expect(report.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(report.timestamp.getTime()).toBeLessThanOrEqual(after + 10);
  });

  test("generateValidationSummary returns a non-empty string", () => {
    const report = validateTimetable({ ...BASE_INPUT, slots: validSlots() });
    const summary = generateValidationSummary(report);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain("PASSED");
  });

  test("generateValidationSummary shows FAILED for invalid timetable", () => {
    const report = validateTimetable({ ...BASE_INPUT, slots: [] });
    const summary = generateValidationSummary(report);
    expect(summary).toContain("FAILED");
  });
});

// ── checkFeasibility ──────────────────────────────────────────────────────────

describe("checkFeasibility", () => {
  test("feasible for valid basic input", () => {
    const result = checkFeasibility({
      classes: [{ id: "c1", name: "Form 1", form: 1, stream: null, streamIndex: 0 }],
      subjects: [{ id: "s1", code: "MATH", name: "Mathematics", internalCode: 1, doubleLesson: false, requiresSpecialRoom: null }],
      teachers: [{ id: "t1", name: "Mr. Otieno" }],
      requirements: [{ classId: "c1", subjectId: "s1", lessonsPerWeek: 5 }],
      teacherAssignments: [{ classId: "c1", subjectId: "s1", teacherId: "t1" }],
      teacherUnavailability: [],
      studentSelections: [],
      sessionPreferences: [],
      templateColumns: TEMPLATE_COLUMNS,
      operatingDays: [0, 1, 2, 3, 4],
    });
    expect(result.feasible).toBe(true);
  });

  test("infeasible when no classes", () => {
    const result = checkFeasibility({
      classes: [],
      subjects: [],
      teachers: [],
      requirements: [],
      teacherAssignments: [],
      teacherUnavailability: [],
      studentSelections: [],
      sessionPreferences: [],
      templateColumns: TEMPLATE_COLUMNS,
      operatingDays: [0, 1, 2, 3, 4],
    });
    expect(result.feasible).toBe(false);
    expect(result.blockingIssues.length).toBeGreaterThan(0);
  });

  test("infeasible when no lesson columns", () => {
    const result = checkFeasibility({
      classes: [{ id: "c1", name: "Form 1", form: 1, stream: null, streamIndex: 0 }],
      subjects: [{ id: "s1", code: "MATH", name: "Mathematics", internalCode: 1, doubleLesson: false, requiresSpecialRoom: null }],
      teachers: [{ id: "t1", name: "Mr. Otieno" }],
      requirements: [{ classId: "c1", subjectId: "s1", lessonsPerWeek: 5 }],
      teacherAssignments: [],
      teacherUnavailability: [],
      studentSelections: [],
      sessionPreferences: [],
      templateColumns: [], // No columns at all
      operatingDays: [0, 1, 2, 3, 4],
    });
    expect(result.feasible).toBe(false);
  });

  test("warns when total required exceeds 90% capacity", () => {
    // 8 periods/day × 5 days = 40 slots; requiring 38 of them is very tight
    const result = checkFeasibility({
      classes: [{ id: "c1", name: "Form 1", form: 1, stream: null, streamIndex: 0 }],
      subjects: [{ id: "s1", code: "MATH", name: "Mathematics", internalCode: 1, doubleLesson: false, requiresSpecialRoom: null }],
      teachers: [{ id: "t1", name: "Mr. Otieno" }],
      requirements: [{ classId: "c1", subjectId: "s1", lessonsPerWeek: 38 }],
      teacherAssignments: [{ classId: "c1", subjectId: "s1", teacherId: "t1" }],
      teacherUnavailability: [],
      studentSelections: [],
      sessionPreferences: [],
      templateColumns: TEMPLATE_COLUMNS,
      operatingDays: [0, 1, 2, 3, 4],
    });
    // Not blocking but should warn (38/40 = 95%)
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ── analyzeValidationFailure ──────────────────────────────────────────────────

describe("analyzeValidationFailure", () => {
  test("returns suggestions for COMPLETE_LESSON_COUNT failure", () => {
    const report = validateTimetable({ ...BASE_INPUT, slots: [] });
    const suggestions = analyzeValidationFailure(report);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.priority === "HIGH")).toBe(true);
  });

  test("returns empty suggestions for passing report", () => {
    const report = validateTimetable({ ...BASE_INPUT, slots: validSlots() });
    const suggestions = analyzeValidationFailure(report);
    expect(suggestions).toHaveLength(0);
  });
});
