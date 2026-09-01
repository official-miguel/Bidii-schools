/**
 * src/__tests__/timetable/cpSatEngine.test.ts
 *
 * Unit tests for the CpSatEngine TypeScript client.
 * All tests mock global.fetch — no live solver required.
 *
 * Covers:
 *  - Payload field mapping (all CpSatInput fields → SolverRequest wire types)
 *  - Response mapping for OPTIMAL, FEASIBLE, UNKNOWN, INFEASIBLE statuses
 *  - Network error handling
 *  - Stats field passthrough vs recomputation
 *
 * Validates: Requirements 2.1–2.8, Properties P12, P13
 */

import { generateTimetableViaCpSat, isSolverHealthy } from "../../lib/timetable/cpSatEngine";
import type { CpSatInput } from "../../lib/timetable/cpSatEngine";
import type { TemplateColumn } from "../../lib/timetable/deterministicEngine";
import { TimetableSession, TimetableSlotType } from "@prisma/client";

// jsdom doesn't provide fetch — install a stub on global so jest.spyOn works
if (typeof (global as unknown as Record<string, unknown>).fetch === "undefined") {
  (global as unknown as Record<string, unknown>).fetch = jest.fn();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTemplateColumns(count = 5): TemplateColumn[] {
  return Array.from({ length: count }, (_, i) => ({
    position: i,
    startTime: "08:00",
    endTime: "08:45",
    slotType: "LESSON" as TimetableSlotType,
    session: "MORNING" as TimetableSession,
    label: null,
  }));
}

function minimalInput(overrides: Partial<CpSatInput> = {}): CpSatInput {
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
    timeLimitSeconds: 30,
    linkedClassGroups: [],
    maxConsecutiveLessons: 2,
    preventUnintendedDoubles: true,
    lockedSlots: [{ classId: "c1", subjectId: "s1", dayOfWeek: 1, period: 1 }],
    previousSlots: [{ classId: "c1", subjectId: "s1", dayOfWeek: 1, period: 1 }],
    ...overrides,
  };
}

function makeSolverSlots(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    classId: "c1",
    dayOfWeek: i + 1,
    period: 1,
    subjectId: "s1",
    teacherId: "t1",
    room: null,
  }));
}

function mockFetchOk(responseBody: object) {
  return jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody),
  } as Response);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateTimetableViaCpSat — payload serialisation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("serialises all required CpSatInput fields into the POST body", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    jest.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return {
        ok: true,
        json: async () => ({
          status: "FEASIBLE",
          slots: makeSolverSlots(3),
          warnings: [],
          stats: { totalLessonsScheduled: 3, totalLessonsRequired: 5, completionRate: 60 },
        }),
        text: async () => "",
      } as Response;
    });

    const input = minimalInput();
    await generateTimetableViaCpSat(input);

    expect(capturedBody).not.toBeNull();
    // Required top-level fields
    expect(capturedBody!.subjects).toHaveLength(1);
    expect(capturedBody!.classes).toHaveLength(1);
    expect(capturedBody!.teachers).toHaveLength(1);
    expect(capturedBody!.requirements).toHaveLength(1);
    expect(capturedBody!.teacherAssignments).toHaveLength(1);
    expect(capturedBody!.teacherUnavailability).toEqual([]);
    expect(capturedBody!.sessionPreferences).toEqual([]);
    expect(capturedBody!.templateColumns).toHaveLength(5);
    expect(capturedBody!.operatingDays).toEqual([1, 2, 3, 4, 5]);
    expect(capturedBody!.maxLessonsPerTeacherPerDay).toBe(6);
    expect(capturedBody!.timeLimitSeconds).toBe(30);
    // Phase 1 fields
    expect(capturedBody!.linkedClassGroups).toEqual([]);
    expect(capturedBody!.maxConsecutiveLessons).toBe(2);
    expect(capturedBody!.preventUnintendedDoubles).toBe(true);
    // Phase 1 locked / Phase 2 previous
    expect(capturedBody!.lockedSlots).toEqual([{ classId: "c1", subjectId: "s1", dayOfWeek: 1, period: 1 }]);
    expect(capturedBody!.previousSlots).toEqual([{ classId: "c1", subjectId: "s1", dayOfWeek: 1, period: 1 }]);
  });

  it("defaults lockedSlots and previousSlots to [] when omitted from input", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    jest.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return {
        ok: true,
        json: async () => ({
          status: "OPTIMAL",
          slots: makeSolverSlots(5),
          warnings: [],
          stats: {},
        }),
        text: async () => "",
      } as Response;
    });

    const input = minimalInput();
    delete (input as Partial<CpSatInput>).lockedSlots;
    delete (input as Partial<CpSatInput>).previousSlots;

    await generateTimetableViaCpSat(input);

    expect(capturedBody!.lockedSlots).toEqual([]);
    expect(capturedBody!.previousSlots).toEqual([]);
  });
});

describe("generateTimetableViaCpSat — response mapping", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns success:true and mapped slots when status=OPTIMAL", async () => {
    mockFetchOk({
      status: "OPTIMAL",
      slots: makeSolverSlots(5),
      warnings: [],
      stats: { totalLessonsScheduled: 5, totalLessonsRequired: 5, completionRate: 100 },
    });

    const result = await generateTimetableViaCpSat(minimalInput());
    expect(result.success).toBe(true);
    expect(result.slots).toHaveLength(5);
    expect(result.slots[0]).toMatchObject({
      classId: "c1",
      subjectId: "s1",
      teacherId: "t1",
    });
  });

  it("returns success:true when status=FEASIBLE", async () => {
    mockFetchOk({
      status: "FEASIBLE",
      slots: makeSolverSlots(3),
      warnings: ["partial"],
      stats: { totalLessonsScheduled: 3, totalLessonsRequired: 5 },
    });

    const result = await generateTimetableViaCpSat(minimalInput());
    expect(result.success).toBe(true);
    expect(result.slots).toHaveLength(3);
  });

  it("returns success:true, empty slots, and time-limit warning when status=UNKNOWN and slots=[]", async () => {
    mockFetchOk({
      status: "UNKNOWN",
      slots: [],
      warnings: [],
      stats: {},
    });

    const input = minimalInput();
    const result = await generateTimetableViaCpSat(input);

    expect(result.success).toBe(true);
    expect(result.slots).toHaveLength(0);
    const hasTimeLimitWarning = result.warnings.some((w) =>
      w.toLowerCase().includes("time limit")
    );
    expect(hasTimeLimitWarning).toBe(true);
  });

  it("returns completionRate=0 and classesNotScheduled=input.classes.length when status=UNKNOWN and slots=[]", async () => {
    mockFetchOk({
      status: "UNKNOWN",
      slots: [],
      warnings: [],
      stats: {},
    });

    const input = minimalInput();
    const result = await generateTimetableViaCpSat(input);

    expect(result.stats.completionRate).toBe(0);
    expect(result.stats.classesNotScheduled).toBe(input.classes.length);
  });

  it("returns success:false when status=INFEASIBLE and slots=[]", async () => {
    mockFetchOk({
      status: "INFEASIBLE",
      slots: [],
      warnings: [],
      stats: {},
    });

    const result = await generateTimetableViaCpSat(minimalInput());
    expect(result.success).toBe(false);
    expect(result.slots).toHaveLength(0);
  });

  it("returns success:false with TEACHER_ASSIGNMENT_VIOLATION error when solver returns HTTP error", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Response);

    const result = await generateTimetableViaCpSat(minimalInput());
    expect(result.success).toBe(false);
    expect(result.errors[0]?.type).toBe("TEACHER_ASSIGNMENT_VIOLATION");
  });

  it("returns success:false when fetch throws a network error", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await generateTimetableViaCpSat(minimalInput());
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.type).toBe("TEACHER_ASSIGNMENT_VIOLATION");
  });

  it("uses solver stats.totalLessonsScheduled and totalLessonsRequired directly when provided", async () => {
    mockFetchOk({
      status: "FEASIBLE",
      slots: makeSolverSlots(3), // 3 slots, but solver reports 10/20
      warnings: [],
      stats: {
        totalLessonsScheduled: 10,
        totalLessonsRequired: 20,
        completionRate: 50,
      },
    });

    const result = await generateTimetableViaCpSat(minimalInput());
    // Stats from solver should be used directly, not recomputed from slot count
    expect(result.stats.totalLessonsScheduled).toBe(10);
    expect(result.stats.totalLessonsRequired).toBe(20);
  });

  it("passes through warnings from the solver response", async () => {
    mockFetchOk({
      status: "FEASIBLE",
      slots: makeSolverSlots(3),
      warnings: ["Warning A", "Warning B"],
      stats: {},
    });

    const result = await generateTimetableViaCpSat(minimalInput());
    expect(result.warnings).toContain("Warning A");
    expect(result.warnings).toContain("Warning B");
  });
});

describe("isSolverHealthy", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns true when /health responds ok", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: true } as Response);
    const healthy = await isSolverHealthy(1000);
    expect(healthy).toBe(true);
  });

  it("returns false when fetch throws", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const healthy = await isSolverHealthy(1000);
    expect(healthy).toBe(false);
  });

  it("returns false when /health responds with non-ok status", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false } as Response);
    const healthy = await isSolverHealthy(1000);
    expect(healthy).toBe(false);
  });
});
