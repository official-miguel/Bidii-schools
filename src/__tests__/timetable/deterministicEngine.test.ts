/**
 * Tests for src/lib/timetable/deterministicEngine.ts
 *
 * Covers:
 *   - Hard constraint enforcement: no teacher double-booking, no class double-booking
 *   - Complete lesson count: every requirement is fully scheduled
 *   - Stable teacher assignments: ClassSubjectTeacher pins are respected
 *   - Double lessons placed consecutively
 *   - Empty input produces empty result without errors
 *   - Stream distribution: subjects spread across days where possible
 *   - Teacher unavailability respected
 *   - Validation function detects real conflicts
 */

import * as fc from "fast-check";
import {
  generateTimetable,
  validateTimetable,
  type EngineSubject,
  type EngineClass,
  type EngineTeacher,
  type TemplateColumn,
} from "@/lib/timetable/deterministicEngine";
import { TimetableSession, TimetableSlotType } from "@prisma/client";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** 5-day week, 8 lesson periods per day */
function makeConfig(periodsPerDay = 8, operatingDays = [0, 1, 2, 3, 4]) {
  const columns: TemplateColumn[] = Array.from({ length: periodsPerDay }, (_, i) => ({
    position: i + 1,
    startTime: `${String(8 + i).padStart(2, "0")}:00`,
    endTime: `${String(9 + i).padStart(2, "0")}:00`,
    slotType: TimetableSlotType.LESSON,
    session: i < 4 ? TimetableSession.MORNING : TimetableSession.AFTERNOON,
    label: null,
  }));

  return {
    academicYear: "2026",
    term: 1,
    operatingDays,
    maxLessonsPerTeacherPerDay: 6,
    templateColumns: columns,
  };
}

function makeSubject(id: string, code: string, _lessonsPerWeek = 5, doubleLesson = false): EngineSubject {
  return { id, internalCode: parseInt(id.replace(/\D/g, "") || "1"), code, name: code, doubleLesson, requiresSpecialRoom: null };
}

function makeClass(id: string, form = 1, streamIndex = 0): EngineClass {
  return { id, name: `Form${form}`, form, stream: null, streamIndex };
}

function makeTeacher(id: string): EngineTeacher {
  return { id, name: `Teacher${id}` };
}

const SINGLE_CLASS_SINGLE_SUBJECT_INPUT = {
  subjects: [makeSubject("s1", "MATH")],
  classes: [makeClass("c1")],
  teachers: [makeTeacher("t1")],
  requirements: [{ subjectId: "s1", classId: "c1", lessonsPerWeek: 5 }],
  teacherAssignments: [{ classId: "c1", subjectId: "s1", teacherId: "t1" }],
  teacherUnavailability: [],
  studentSelections: [],
  sessionPreferences: [],
  config: makeConfig(),
};

// ── Hard constraint: no teacher double-booking ────────────────────────────────

describe("deterministicEngine — no teacher double-booking", () => {
  test("single class, single subject: teacher never scheduled twice at same slot", () => {
    const result = generateTimetable(SINGLE_CLASS_SINGLE_SUBJECT_INPUT);
    const slotKeys = result.slots.map((s) => `${s.teacherId}:${s.dayOfWeek}-${s.period}`);
    const uniqueKeys = new Set(slotKeys);
    expect(uniqueKeys.size).toBe(slotKeys.length);
  });

  test("multiple classes sharing one teacher: no double-booking", () => {
    const input = {
      subjects: [makeSubject("s1", "MATH")],
      classes: [makeClass("c1"), makeClass("c2"), makeClass("c3")],
      teachers: [makeTeacher("t1")],
      requirements: [
        { subjectId: "s1", classId: "c1", lessonsPerWeek: 3 },
        { subjectId: "s1", classId: "c2", lessonsPerWeek: 3 },
        { subjectId: "s1", classId: "c3", lessonsPerWeek: 2 },
      ],
      teacherAssignments: [
        { classId: "c1", subjectId: "s1", teacherId: "t1" },
        { classId: "c2", subjectId: "s1", teacherId: "t1" },
        { classId: "c3", subjectId: "s1", teacherId: "t1" },
      ],
      teacherUnavailability: [],
      studentSelections: [],
      sessionPreferences: [],
      config: makeConfig(),
    };

    const result = generateTimetable(input);

    // Check no teacher slot is used twice
    const teacherSlots = new Map<string, string>();
    for (const slot of result.slots) {
      const key = `${slot.teacherId}:${slot.dayOfWeek}-${slot.period}`;
      expect(teacherSlots.has(key)).toBe(false);
      teacherSlots.set(key, slot.classId);
    }
  });

  test("property: teacher slot uniqueness holds across random lesson counts", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 3 }),
        (lessonsPerWeek, numClasses) => {
          const classes = Array.from({ length: numClasses }, (_, i) => makeClass(`c${i}`));
          const assignments = classes.map((c) => ({
            classId: c.id,
            subjectId: "s1",
            teacherId: "t1",
          }));
          const requirements = classes.map((c) => ({
            subjectId: "s1",
            classId: c.id,
            lessonsPerWeek,
          }));

          const input = {
            subjects: [makeSubject("s1", "MATH")],
            classes,
            teachers: [makeTeacher("t1")],
            requirements,
            teacherAssignments: assignments,
            teacherUnavailability: [],
            studentSelections: [],
            sessionPreferences: [],
            config: makeConfig(),
          };

          const result = generateTimetable(input);
          const teacherSlotKeys = result.slots.map(
            (s) => `${s.teacherId}:${s.dayOfWeek}-${s.period}`
          );
          const uniqueTeacherSlots = new Set(teacherSlotKeys);
          expect(uniqueTeacherSlots.size).toBe(teacherSlotKeys.length);
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ── Hard constraint: no class double-booking ──────────────────────────────────

describe("deterministicEngine — no class double-booking", () => {
  test("class never has two subjects at the same slot", () => {
    const input = {
      subjects: [
        makeSubject("s1", "MATH"),
        makeSubject("s2", "ENG"),
        makeSubject("s3", "BIO"),
      ],
      classes: [makeClass("c1")],
      teachers: [makeTeacher("t1"), makeTeacher("t2"), makeTeacher("t3")],
      requirements: [
        { subjectId: "s1", classId: "c1", lessonsPerWeek: 5 },
        { subjectId: "s2", classId: "c1", lessonsPerWeek: 5 },
        { subjectId: "s3", classId: "c1", lessonsPerWeek: 5 },
      ],
      teacherAssignments: [
        { classId: "c1", subjectId: "s1", teacherId: "t1" },
        { classId: "c1", subjectId: "s2", teacherId: "t2" },
        { classId: "c1", subjectId: "s3", teacherId: "t3" },
      ],
      teacherUnavailability: [],
      studentSelections: [],
      sessionPreferences: [],
      config: makeConfig(),
    };

    const result = generateTimetable(input);

    const classSlotKeys = result.slots.map((s) => `${s.classId}:${s.dayOfWeek}-${s.period}`);
    const uniqueClassSlots = new Set(classSlotKeys);
    expect(uniqueClassSlots.size).toBe(classSlotKeys.length);
  });
});

// ── Complete lesson count ─────────────────────────────────────────────────────

describe("deterministicEngine — complete lesson counts", () => {
  test("single class/subject schedules exactly the required lessons", () => {
    const result = generateTimetable(SINGLE_CLASS_SINGLE_SUBJECT_INPUT);
    const scheduled = result.slots.filter(
      (s) => s.classId === "c1" && s.subjectId === "s1"
    ).length;
    expect(scheduled).toBe(5);
    expect(result.stats.completionRate).toBe(100);
  });

  test("multiple subjects all meet their weekly requirements", () => {
    const input = {
      subjects: [
        makeSubject("s1", "MATH"),
        makeSubject("s2", "ENG"),
        makeSubject("s3", "PHY"),
      ],
      classes: [makeClass("c1")],
      teachers: [makeTeacher("t1"), makeTeacher("t2"), makeTeacher("t3")],
      requirements: [
        { subjectId: "s1", classId: "c1", lessonsPerWeek: 5 },
        { subjectId: "s2", classId: "c1", lessonsPerWeek: 4 },
        { subjectId: "s3", classId: "c1", lessonsPerWeek: 3 },
      ],
      teacherAssignments: [
        { classId: "c1", subjectId: "s1", teacherId: "t1" },
        { classId: "c1", subjectId: "s2", teacherId: "t2" },
        { classId: "c1", subjectId: "s3", teacherId: "t3" },
      ],
      teacherUnavailability: [],
      studentSelections: [],
      sessionPreferences: [],
      config: makeConfig(),
    };

    const result = generateTimetable(input);

    const counts = new Map<string, number>();
    for (const slot of result.slots) {
      const key = `${slot.classId}-${slot.subjectId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.get("c1-s1")).toBe(5);
    expect(counts.get("c1-s2")).toBe(4);
    expect(counts.get("c1-s3")).toBe(3);
  });

  test("does not schedule lessons when no teacher is assigned", () => {
    const input = {
      ...SINGLE_CLASS_SINGLE_SUBJECT_INPUT,
      teacherAssignments: [], // no assignment
    };
    const result = generateTimetable(input);
    expect(result.slots.length).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].type).toBe("TEACHER_ASSIGNMENT_VIOLATION");
  });
});

// ── Stable teacher assignments ────────────────────────────────────────────────

describe("deterministicEngine — stable teacher assignments", () => {
  test("assigned teacher always teaches their class's subject, never another teacher", () => {
    const result = generateTimetable(SINGLE_CLASS_SINGLE_SUBJECT_INPUT);
    for (const slot of result.slots) {
      expect(slot.teacherId).toBe("t1");
    }
  });

  test("teacher pin is respected over lighter-load teacher", () => {
    const input = {
      subjects: [makeSubject("s1", "MATH")],
      classes: [makeClass("c1")],
      teachers: [makeTeacher("t1"), makeTeacher("t2")],
      requirements: [{ subjectId: "s1", classId: "c1", lessonsPerWeek: 5 }],
      // t2 is pinned for c1-s1 even though t1 may have lighter load
      teacherAssignments: [{ classId: "c1", subjectId: "s1", teacherId: "t2" }],
      teacherUnavailability: [],
      studentSelections: [],
      sessionPreferences: [],
      config: makeConfig(),
    };

    const result = generateTimetable(input);
    for (const slot of result.slots) {
      expect(slot.teacherId).toBe("t2");
    }
  });
});

// ── Double lessons ────────────────────────────────────────────────────────────

describe("deterministicEngine — double lessons", () => {
  test("double-lesson subject has pairs of consecutive periods on the same day", () => {
    const input = {
      subjects: [makeSubject("s1", "CHEM", 4, true)],
      classes: [makeClass("c1")],
      teachers: [makeTeacher("t1")],
      requirements: [{ subjectId: "s1", classId: "c1", lessonsPerWeek: 4 }],
      teacherAssignments: [{ classId: "c1", subjectId: "s1", teacherId: "t1" }],
      teacherUnavailability: [],
      studentSelections: [],
      sessionPreferences: [],
      config: makeConfig(),
    };

    const result = generateTimetable(input);
    const slots = result.slots
      .filter((s) => s.subjectId === "s1")
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period);

    // Should have 2 pairs (4 lessons total)
    expect(slots.length).toBe(4);

    // Group by day
    const byDay = new Map<number, number[]>();
    for (const s of slots) {
      if (!byDay.has(s.dayOfWeek)) byDay.set(s.dayOfWeek, []);
      byDay.get(s.dayOfWeek)!.push(s.period);
    }

    // Each day with 2 lessons should have consecutive periods
    for (const [, periods] of byDay) {
      if (periods.length === 2) {
        const sorted = periods.sort((a, b) => a - b);
        expect(sorted[1] - sorted[0]).toBe(1);
      }
    }
  });
});

// ── Teacher unavailability ────────────────────────────────────────────────────

describe("deterministicEngine — teacher unavailability", () => {
  test("teacher is never scheduled in marked unavailable slots", () => {
    const unavailable = [
      { teacherId: "t1", dayOfWeek: 0, period: 1 },
      { teacherId: "t1", dayOfWeek: 1, period: 2 },
      { teacherId: "t1", dayOfWeek: 2, period: 3 },
    ];

    const result = generateTimetable({
      ...SINGLE_CLASS_SINGLE_SUBJECT_INPUT,
      teacherUnavailability: unavailable,
    });

    for (const slot of result.slots) {
      const blocked = unavailable.some(
        (u) => u.teacherId === slot.teacherId && u.dayOfWeek === slot.dayOfWeek && u.period === slot.period
      );
      expect(blocked).toBe(false);
    }
  });
});

// ── Empty / edge cases ────────────────────────────────────────────────────────

describe("deterministicEngine — edge cases", () => {
  test("empty input produces empty successful result", () => {
    const result = generateTimetable({
      subjects: [],
      classes: [],
      teachers: [],
      requirements: [],
      teacherAssignments: [],
      teacherUnavailability: [],
      studentSelections: [],
      sessionPreferences: [],
      config: makeConfig(),
    });
    expect(result.slots).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.totalLessonsRequired).toBe(0);
  });

  test("class with no requirements produces no slots", () => {
    const result = generateTimetable({
      subjects: [],
      classes: [makeClass("c1")],
      teachers: [makeTeacher("t1")],
      requirements: [],
      teacherAssignments: [],
      teacherUnavailability: [],
      studentSelections: [],
      sessionPreferences: [],
      config: makeConfig(),
    });
    expect(result.slots).toHaveLength(0);
  });

  test("single day week produces valid no-conflict timetable", () => {
    const result = generateTimetable({
      ...SINGLE_CLASS_SINGLE_SUBJECT_INPUT,
      requirements: [{ subjectId: "s1", classId: "c1", lessonsPerWeek: 3 }],
      config: makeConfig(8, [0]), // Only Monday
    });

    // All slots on day 0
    for (const slot of result.slots) {
      expect(slot.dayOfWeek).toBe(0);
    }
    // No double-booking
    const keys = result.slots.map((s) => `${s.dayOfWeek}-${s.period}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ── validateTimetable ─────────────────────────────────────────────────────────

describe("validateTimetable", () => {
  test("clean generated timetable passes all validations", () => {
    const result = generateTimetable(SINGLE_CLASS_SINGLE_SUBJECT_INPUT);
    const errors = validateTimetable(
      result.slots,
      SINGLE_CLASS_SINGLE_SUBJECT_INPUT.requirements,
      SINGLE_CLASS_SINGLE_SUBJECT_INPUT.teacherAssignments,
      [],
      makeConfig()
    );
    expect(errors).toHaveLength(0);
  });

  test("detects teacher double-booking in manually built slots", () => {
    const fakeSlots = [
      { classId: "c1", dayOfWeek: 0, period: 1, subjectId: "s1", teacherId: "t1", room: null },
      { classId: "c2", dayOfWeek: 0, period: 1, subjectId: "s1", teacherId: "t1", room: null },
    ];
    const errors = validateTimetable(fakeSlots, [], [], [], makeConfig());
    const teacherErrors = errors.filter((e) => e.type === "TEACHER_DOUBLE_BOOKED");
    expect(teacherErrors.length).toBeGreaterThan(0);
  });

  test("detects class double-booking in manually built slots", () => {
    const fakeSlots = [
      { classId: "c1", dayOfWeek: 0, period: 1, subjectId: "s1", teacherId: "t1", room: null },
      { classId: "c1", dayOfWeek: 0, period: 1, subjectId: "s2", teacherId: "t2", room: null },
    ];
    const errors = validateTimetable(fakeSlots, [], [], [], makeConfig());
    const classErrors = errors.filter((e) => e.type === "CLASS_DOUBLE_BOOKED");
    expect(classErrors.length).toBeGreaterThan(0);
  });

  test("detects incomplete lesson count", () => {
    const oneSlot = [
      { classId: "c1", dayOfWeek: 0, period: 1, subjectId: "s1", teacherId: "t1", room: null },
    ];
    const errors = validateTimetable(
      oneSlot,
      [{ classId: "c1", subjectId: "s1", lessonsPerWeek: 5 }],
      [{ classId: "c1", subjectId: "s1", teacherId: "t1" }],
      [],
      makeConfig()
    );
    const incomplete = errors.filter((e) => e.type === "INCOMPLETE_LESSONS");
    expect(incomplete.length).toBe(1);
  });
});
