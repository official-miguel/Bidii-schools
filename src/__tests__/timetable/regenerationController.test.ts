/**
 * src/__tests__/timetable/regenerationController.test.ts
 *
 * Unit tests for regenerationController.generateWithValidation.
 * Mocks isSolverHealthy and generateTimetableViaCpSat — no live solver needed.
 *
 * Covers:
 *  - Unhealthy solver → aborted result
 *  - Solver crash (empty slots, success:false) → failure result
 *  - Successful generation → success result with slots
 *  - Validation errors promoted to finalResult.warnings
 *  - onSuccess callback called with attempt=1
 *
 * Validates: Requirements 3.1–3.5
 */

// Mock the cpSatEngine module before any imports that use it
jest.mock("../../lib/timetable/cpSatEngine", () => ({
  isSolverHealthy: jest.fn(),
  generateTimetableViaCpSat: jest.fn(),
}));

import { generateWithValidation } from "../../lib/timetable/regenerationController";
import {
  isSolverHealthy,
  generateTimetableViaCpSat,
} from "../../lib/timetable/cpSatEngine";
import type { CpSatInput } from "../../lib/timetable/cpSatEngine";
import type { EngineResult } from "../../lib/timetable/deterministicEngine";
import { TimetableSession, TimetableSlotType } from "@prisma/client";

// ── Type casts for mocks ──────────────────────────────────────────────────────

const mockIsSolverHealthy = isSolverHealthy as jest.MockedFunction<typeof isSolverHealthy>;
const mockGenerateTimetable = generateTimetableViaCpSat as jest.MockedFunction<
  typeof generateTimetableViaCpSat
>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTemplateColumns(count = 5) {
  return Array.from({ length: count }, (_, i) => ({
    position: i,
    startTime: "08:00",
    endTime: "08:45",
    slotType: "LESSON" as TimetableSlotType,
    session: "MORNING" as TimetableSession,
    label: null,
  }));
}

function minimalEngineInput(): CpSatInput {
  return {
    subjects: [
      {
        id: "s1",
        code: "MATH",
        internalCode: 1,
        name: "Mathematics",
        doubleLesson: false,
        requiresSpecialRoom: null,
      },
    ],
    classes: [{ id: "c1", name: "1A", form: 1, stream: null, streamIndex: 0 }],
    teachers: [{ id: "t1", name: "Alice" }],
    requirements: [{ classId: "c1", subjectId: "s1", lessonsPerWeek: 5 }],
    teacherAssignments: [{ classId: "c1", subjectId: "s1", teacherId: "t1" }],
    teacherUnavailability: [],
    sessionPreferences: [],
    config: {
      academicYear: "2024",
      term: 1,
      operatingDays: [1, 2, 3, 4, 5],
      maxLessonsPerTeacherPerDay: 6,
      templateColumns: makeTemplateColumns(),
    },
  };
}

function minimalValidatorInput() {
  const cols = makeTemplateColumns();
  return {
    classes: [{ id: "c1", name: "1A", form: 1 }],
    subjects: [
      {
        id: "s1",
        code: "MATH",
        internalCode: 1,
        name: "Mathematics",
        doubleLesson: false,
        requiresSpecialRoom: null,
      },
    ],
    teachers: [{ id: "t1", name: "Alice" }],
    requirements: [{ classId: "c1", subjectId: "s1", lessonsPerWeek: 5 }],
    teacherAssignments: [{ classId: "c1", subjectId: "s1", teacherId: "t1" }],
    teacherUnavailability: [],
    studentSelections: [],
    sessionPreferences: [],
    templateColumns: cols,
    operatingDays: [1, 2, 3, 4, 5],
    linkedClassGroups: [],
  };
}

function makeEngineResult(overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    success: true,
    slots: [
      { classId: "c1", dayOfWeek: 1, period: 1, subjectId: "s1", teacherId: "t1", room: null },
      { classId: "c1", dayOfWeek: 2, period: 1, subjectId: "s1", teacherId: "t1", room: null },
      { classId: "c1", dayOfWeek: 3, period: 1, subjectId: "s1", teacherId: "t1", room: null },
      { classId: "c1", dayOfWeek: 4, period: 1, subjectId: "s1", teacherId: "t1", room: null },
      { classId: "c1", dayOfWeek: 5, period: 1, subjectId: "s1", teacherId: "t1", room: null },
    ],
    errors: [],
    warnings: [],
    stats: {
      totalLessonsScheduled: 5,
      totalLessonsRequired: 5,
      completionRate: 100,
      classesFullyScheduled: 1,
      classesPartiallyScheduled: 0,
      classesNotScheduled: 0,
    },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateWithValidation — solver health check", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns aborted:true, success:false, attempts:0 when solver is unhealthy", async () => {
    mockIsSolverHealthy.mockResolvedValue(false);

    const result = await generateWithValidation(
      minimalEngineInput(),
      minimalValidatorInput()
    );

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.attempts).toBe(0);
    expect(result.reason).toMatch(/unreachable/i);
  });

  it("includes 'unreachable' in reason when solver is unhealthy", async () => {
    mockIsSolverHealthy.mockResolvedValue(false);

    const result = await generateWithValidation(
      minimalEngineInput(),
      minimalValidatorInput()
    );

    expect(result.reason).toBeDefined();
    expect(result.reason!.toLowerCase()).toContain("unreachable");
  });
});

describe("generateWithValidation — solver crash path", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns success:false, aborted:false, attempts:1 when solver returns crash result", async () => {
    mockIsSolverHealthy.mockResolvedValue(true);
    mockGenerateTimetable.mockResolvedValue(
      makeEngineResult({
        success: false,
        slots: [],
        errors: [
          {
            type: "TEACHER_ASSIGNMENT_VIOLATION",
            description: "CP-SAT solver unreachable",
          },
        ],
      })
    );

    const result = await generateWithValidation(
      minimalEngineInput(),
      minimalValidatorInput()
    );

    expect(result.success).toBe(false);
    expect(result.aborted).toBe(false);
    expect(result.attempts).toBe(1);
  });
});

describe("generateWithValidation — successful generation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns success:true and finalResult.slots populated when solver succeeds", async () => {
    mockIsSolverHealthy.mockResolvedValue(true);
    mockGenerateTimetable.mockResolvedValue(makeEngineResult());

    const result = await generateWithValidation(
      minimalEngineInput(),
      minimalValidatorInput()
    );

    expect(result.success).toBe(true);
    expect(result.finalResult).not.toBeNull();
    expect(result.finalResult!.slots).toHaveLength(5);
  });

  it("always calls onSuccess callback with attempt === 1 on success", async () => {
    mockIsSolverHealthy.mockResolvedValue(true);
    mockGenerateTimetable.mockResolvedValue(makeEngineResult());

    const onSuccess = jest.fn();

    await generateWithValidation(minimalEngineInput(), minimalValidatorInput(), {
      onSuccess,
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0]).toBe(1); // attempt === 1
  });

  it("never calls onSuccess when solver is unhealthy", async () => {
    mockIsSolverHealthy.mockResolvedValue(false);

    const onSuccess = jest.fn();

    await generateWithValidation(minimalEngineInput(), minimalValidatorInput(), {
      onSuccess,
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("generateWithValidation — validation error promotion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("promotes ERROR-severity validation issues to finalResult.warnings with 'Validation: ' prefix", async () => {
    // Return a partial schedule that will trigger COMPLETE_LESSON_COUNT validation errors
    // (5 required, only 2 placed)
    mockIsSolverHealthy.mockResolvedValue(true);
    mockGenerateTimetable.mockResolvedValue(
      makeEngineResult({
        success: true,
        slots: [
          { classId: "c1", dayOfWeek: 1, period: 1, subjectId: "s1", teacherId: "t1", room: null },
          { classId: "c1", dayOfWeek: 2, period: 1, subjectId: "s1", teacherId: "t1", room: null },
        ],
        stats: {
          totalLessonsScheduled: 2,
          totalLessonsRequired: 5,
          completionRate: 40,
          classesFullyScheduled: 0,
          classesPartiallyScheduled: 1,
          classesNotScheduled: 0,
        },
      })
    );

    const result = await generateWithValidation(
      minimalEngineInput(),
      minimalValidatorInput()
    );

    // Should still succeed (partial is ok)
    expect(result.success).toBe(true);
    expect(result.finalResult).not.toBeNull();

    // Validation errors should be promoted to warnings prefixed with "Validation: "
    const promotedWarnings = result.finalResult!.warnings.filter((w) =>
      w.startsWith("Validation: ")
    );
    expect(promotedWarnings.length).toBeGreaterThan(0);
  });
});
