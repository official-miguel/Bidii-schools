/**
 * Unit tests for the CBE grading scale service.
 *
 * All Prisma calls are mocked so these run without a database.
 *
 * Test groups:
 *  1. validateBands()     — overlap / gap / range / field validation,
 *                           including KNEC integer-step boundaries
 *  2. resolveCbeGrade()   — school uses govt default (KNEC EE1–BE2),
 *                           school uses custom scale,
 *                           all 15 requested boundary cases,
 *                           rawScore/totalMarks conversion, edge cases
 *  3. saveCustomScale()   — deactivates old rows, inserts new ones
 *  4. resetToDefault()    — sets isActive=false on custom rows only
 */

// ---------------------------------------------------------------------------
// Mocks — must come before any imports that use them
// ---------------------------------------------------------------------------

jest.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

const mockFindMany    = jest.fn();
const mockUpdateMany  = jest.fn();
const mockCreate      = jest.fn();
const mockTransaction = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    cbeGradingScale: {
      findMany:   (...args: unknown[]) => mockFindMany(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      create:     (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  validateBands,
  resolveCbeGrade,
  saveCustomScale,
  resetToDefault,
  type GradeBand,
} from "@/lib/assessment/gradingScale";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * The 8-band KNEC CBE government default scale.
 * Mirrors GOVERNMENT_DEFAULT_BANDS in prisma/seeds/cbeGradingScaleDefault.ts
 * and the INSERT rows in migration 20260906100000_cbe_grading_scale_knec_default.
 */
const GOVT_BANDS: GradeBand[] = [
  { id: "govt_knec_EE1", schoolId: null, bandName: "EE1", achievementLevel: 8, minPercentage: 90, maxPercentage: 100, points: 8, description: "Exceptional",        isActive: true },
  { id: "govt_knec_EE2", schoolId: null, bandName: "EE2", achievementLevel: 7, minPercentage: 75, maxPercentage:  89, points: 7, description: "Very Good",           isActive: true },
  { id: "govt_knec_ME1", schoolId: null, bandName: "ME1", achievementLevel: 6, minPercentage: 58, maxPercentage:  74, points: 6, description: "Good",                isActive: true },
  { id: "govt_knec_ME2", schoolId: null, bandName: "ME2", achievementLevel: 5, minPercentage: 41, maxPercentage:  57, points: 5, description: "Fair",                isActive: true },
  { id: "govt_knec_AE1", schoolId: null, bandName: "AE1", achievementLevel: 4, minPercentage: 31, maxPercentage:  40, points: 4, description: "Needs Improvement",   isActive: true },
  { id: "govt_knec_AE2", schoolId: null, bandName: "AE2", achievementLevel: 3, minPercentage: 21, maxPercentage:  30, points: 3, description: "Below Average",       isActive: true },
  { id: "govt_knec_BE1", schoolId: null, bandName: "BE1", achievementLevel: 2, minPercentage: 11, maxPercentage:  20, points: 2, description: "Well Below Average",  isActive: true },
  { id: "govt_knec_BE2", schoolId: null, bandName: "BE2", achievementLevel: 1, minPercentage:  0, maxPercentage:  10, points: 1, description: "Minimal",             isActive: true },
];

/** A minimal 4-band custom scale used in school-override tests. */
const CUSTOM_BANDS: GradeBand[] = [
  { id: "c1", schoolId: "school-xyz", bandName: "Dist",  achievementLevel: 4, minPercentage: 75, maxPercentage: 100,   points: 4, description: "Distinction", isActive: true },
  { id: "c2", schoolId: "school-xyz", bandName: "Merit", achievementLevel: 3, minPercentage: 50, maxPercentage:  74,   points: 3, description: "Merit",       isActive: true },
  { id: "c3", schoolId: "school-xyz", bandName: "Pass",  achievementLevel: 2, minPercentage: 35, maxPercentage:  49,   points: 2, description: "Pass",        isActive: true },
  { id: "c4", schoolId: "school-xyz", bandName: "Fail",  achievementLevel: 1, minPercentage:  0, maxPercentage:  34,   points: 1, description: "Fail",        isActive: true },
];

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** School has no custom scale → falls back to government default. */
function mockNoCustomScale() {
  mockFindMany.mockImplementation((args: { where?: { schoolId?: unknown } }) => {
    if (args?.where?.schoolId === null) return Promise.resolve(GOVT_BANDS);
    return Promise.resolve([]);
  });
}

/** school-xyz has a custom scale; any other school falls back to GOVT_BANDS. */
function mockCustomScale() {
  mockFindMany.mockImplementation((args: { where?: { schoolId?: unknown } }) => {
    if (args?.where?.schoolId === "school-xyz") return Promise.resolve(CUSTOM_BANDS);
    if (args?.where?.schoolId === null)         return Promise.resolve(GOVT_BANDS);
    return Promise.resolve([]);
  });
}

// ---------------------------------------------------------------------------
// 1. validateBands()
// ---------------------------------------------------------------------------

describe("validateBands()", () => {
  // A valid two-band scale with integer-step boundaries (KNEC style).
  const validIntegerStep = [
    { bandName: "High", achievementLevel: 2, minPercentage: 51, maxPercentage: 100, points: 2, description: "High" },
    { bandName: "Low",  achievementLevel: 1, minPercentage:  0, maxPercentage:  50, points: 1, description: "Low"  },
  ];

  // A valid two-band scale with .99-float boundaries (legacy style).
  const validFloatStep = [
    { bandName: "High", achievementLevel: 2, minPercentage: 50,    maxPercentage: 100,   points: 2, description: "High" },
    { bandName: "Low",  achievementLevel: 1, minPercentage:  0,    maxPercentage:  49.99,points: 1, description: "Low"  },
  ];

  it("accepts integer-step adjacent bands (KNEC style: 50→51)", () => {
    expect(validateBands(validIntegerStep)).toHaveLength(0);
  });

  it("accepts float-step adjacent bands (legacy .99 style: 49.99→50)", () => {
    expect(validateBands(validFloatStep)).toHaveLength(0);
  });

  it("accepts the full 8-band KNEC government default scale with no errors", () => {
    const input = GOVT_BANDS.map((b) => ({
      bandName:         b.bandName,
      achievementLevel: b.achievementLevel,
      minPercentage:    b.minPercentage,
      maxPercentage:    b.maxPercentage,
      points:           b.points,
      description:      b.description,
    }));
    expect(validateBands(input)).toHaveLength(0);
  });

  it("returns an error for an empty bands array", () => {
    const errors = validateBands([]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe("bands");
  });

  it("returns an error when bandName is empty", () => {
    const bad = [{ ...validIntegerStep[0], bandName: "" }, validIntegerStep[1]];
    expect(validateBands(bad).some((e) => e.field.includes("bandName"))).toBe(true);
  });

  it("returns an error when achievementLevel is 0 (not positive)", () => {
    const bad = [{ ...validIntegerStep[0], achievementLevel: 0 }, validIntegerStep[1]];
    expect(validateBands(bad).some((e) => e.field.includes("achievementLevel"))).toBe(true);
  });

  it("returns an error when points is 0 (not positive)", () => {
    const bad = [{ ...validIntegerStep[0], points: 0 }, validIntegerStep[1]];
    expect(validateBands(bad).some((e) => e.field.includes("points"))).toBe(true);
  });

  it("returns an error when minPercentage >= maxPercentage", () => {
    const bad = [{ ...validIntegerStep[0], minPercentage: 80, maxPercentage: 50 }, validIntegerStep[1]];
    expect(validateBands(bad).some((e) => e.message.includes("less than max"))).toBe(true);
  });

  it("returns an error when scale does not start at 0%", () => {
    const bad = [
      { bandName: "High", achievementLevel: 2, minPercentage: 10, maxPercentage: 100, points: 2, description: "" },
      { bandName: "Low",  achievementLevel: 1, minPercentage:  5, maxPercentage:   9, points: 1, description: "" },
    ];
    expect(validateBands(bad).some((e) => e.message.includes("start at 0%"))).toBe(true);
  });

  it("returns an error when scale does not end at 100%", () => {
    const bad = [
      { bandName: "High", achievementLevel: 2, minPercentage: 50, maxPercentage: 90, points: 2, description: "" },
      { bandName: "Low",  achievementLevel: 1, minPercentage:  0, maxPercentage: 49, points: 1, description: "" },
    ];
    expect(validateBands(bad).some((e) => e.message.includes("end at 100%"))).toBe(true);
  });

  it("returns an error when two bands overlap", () => {
    const overlapping = [
      { bandName: "High", achievementLevel: 2, minPercentage: 50, maxPercentage: 100, points: 2, description: "" },
      { bandName: "Low",  achievementLevel: 1, minPercentage:  0, maxPercentage:  60, points: 1, description: "" },
    ];
    expect(validateBands(overlapping).some((e) => e.message.includes("overlap"))).toBe(true);
  });

  it("returns an error when there is a gap > 1% between adjacent bands", () => {
    const gapped = [
      { bandName: "High", achievementLevel: 2, minPercentage: 60, maxPercentage: 100, points: 2, description: "" },
      { bandName: "Low",  achievementLevel: 1, minPercentage:  0, maxPercentage:  50, points: 1, description: "" },
    ];
    expect(validateBands(gapped).some((e) => e.message.includes("Gap"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. resolveCbeGrade()
// ---------------------------------------------------------------------------

describe("resolveCbeGrade()", () => {
  beforeEach(() => mockFindMany.mockReset());

  // ── 2a. School on government default ──────────────────────────────────

  describe("school with no custom scale (uses KNEC government default)", () => {
    beforeEach(() => mockNoCustomScale());

    it("returns usedDefault=true", async () => {
      const r = await resolveCbeGrade("school-a", 85, 100);
      expect(r!.usedDefault).toBe(true);
    });

    it("returns null when totalMarks is 0", async () => {
      expect(await resolveCbeGrade("school-a", 50, 0)).toBeNull();
    });

    // ── Explicit boundary cases from spec ──────────────────────────────

    it("90% → EE1 (lower edge of EE1)", async () => {
      const r = await resolveCbeGrade("school-a", 90, 100);
      expect(r!.bandName).toBe("EE1");
      expect(r!.achievementLevel).toBe(8);
      expect(r!.points).toBe(8);
    });

    it("100% → EE1 (upper edge of EE1)", async () => {
      const r = await resolveCbeGrade("school-a", 100, 100);
      expect(r!.bandName).toBe("EE1");
    });

    it("89.99% → EE2 (just below EE1 boundary)", async () => {
      const r = await resolveCbeGrade("school-a", 89.99, 100);
      expect(r!.bandName).toBe("EE2");
      expect(r!.points).toBe(7);
    });

    it("75% → EE2 (lower edge of EE2)", async () => {
      const r = await resolveCbeGrade("school-a", 75, 100);
      expect(r!.bandName).toBe("EE2");
    });

    it("74.99% → ME1 (just below EE2 boundary)", async () => {
      const r = await resolveCbeGrade("school-a", 74.99, 100);
      expect(r!.bandName).toBe("ME1");
      expect(r!.points).toBe(6);
    });

    it("58% → ME1 (lower edge of ME1)", async () => {
      const r = await resolveCbeGrade("school-a", 58, 100);
      expect(r!.bandName).toBe("ME1");
    });

    it("57.99% → ME2 (just below ME1 boundary)", async () => {
      const r = await resolveCbeGrade("school-a", 57.99, 100);
      expect(r!.bandName).toBe("ME2");
      expect(r!.points).toBe(5);
    });

    it("41% → ME2 (lower edge of ME2)", async () => {
      const r = await resolveCbeGrade("school-a", 41, 100);
      expect(r!.bandName).toBe("ME2");
    });

    it("40.99% → AE1 (just below ME2 boundary)", async () => {
      const r = await resolveCbeGrade("school-a", 40.99, 100);
      expect(r!.bandName).toBe("AE1");
      expect(r!.points).toBe(4);
    });

    it("31% → AE1 (lower edge of AE1)", async () => {
      const r = await resolveCbeGrade("school-a", 31, 100);
      expect(r!.bandName).toBe("AE1");
    });

    it("30.99% → AE2 (just below AE1 boundary)", async () => {
      const r = await resolveCbeGrade("school-a", 30.99, 100);
      expect(r!.bandName).toBe("AE2");
      expect(r!.points).toBe(3);
    });

    it("21% → AE2 (lower edge of AE2)", async () => {
      const r = await resolveCbeGrade("school-a", 21, 100);
      expect(r!.bandName).toBe("AE2");
    });

    it("20.99% → BE1 (just below AE2 boundary)", async () => {
      const r = await resolveCbeGrade("school-a", 20.99, 100);
      expect(r!.bandName).toBe("BE1");
      expect(r!.points).toBe(2);
    });

    it("11% → BE1 (lower edge of BE1)", async () => {
      const r = await resolveCbeGrade("school-a", 11, 100);
      expect(r!.bandName).toBe("BE1");
    });

    it("10.99% → BE2 (just below BE1 boundary)", async () => {
      const r = await resolveCbeGrade("school-a", 10.99, 100);
      expect(r!.bandName).toBe("BE2");
      expect(r!.points).toBe(1);
    });

    it("0% → BE2 (absolute floor)", async () => {
      const r = await resolveCbeGrade("school-a", 0, 100);
      expect(r!.bandName).toBe("BE2");
      expect(r!.points).toBe(1);
    });

    // ── Interior band values ───────────────────────────────────────────

    it("95% → EE1 (interior)", async () => {
      expect((await resolveCbeGrade("school-a", 95, 100))!.bandName).toBe("EE1");
    });

    it("80% → EE2 (interior)", async () => {
      expect((await resolveCbeGrade("school-a", 80, 100))!.bandName).toBe("EE2");
    });

    it("65% → ME1 (interior)", async () => {
      expect((await resolveCbeGrade("school-a", 65, 100))!.bandName).toBe("ME1");
    });

    it("50% → ME2 (interior)", async () => {
      expect((await resolveCbeGrade("school-a", 50, 100))!.bandName).toBe("ME2");
    });

    it("35% → AE1 (interior)", async () => {
      expect((await resolveCbeGrade("school-a", 35, 100))!.bandName).toBe("AE1");
    });

    it("25% → AE2 (interior)", async () => {
      expect((await resolveCbeGrade("school-a", 25, 100))!.bandName).toBe("AE2");
    });

    it("15% → BE1 (interior)", async () => {
      expect((await resolveCbeGrade("school-a", 15, 100))!.bandName).toBe("BE1");
    });

    it("5% → BE2 (interior)", async () => {
      expect((await resolveCbeGrade("school-a", 5, 100))!.bandName).toBe("BE2");
    });

    // ── rawScore / totalMarks conversion ──────────────────────────────

    it("45/50 = 90% → EE1", async () => {
      const r = await resolveCbeGrade("school-a", 45, 50);
      expect(r!.bandName).toBe("EE1");
      expect(r!.percentage).toBe(90);
    });

    it("35/60 ≈ 58.3% → ME1", async () => {
      const r = await resolveCbeGrade("school-a", 35, 60);
      expect(r!.bandName).toBe("ME1");
    });

    it("20/80 = 25% → AE2", async () => {
      const r = await resolveCbeGrade("school-a", 20, 80);
      expect(r!.bandName).toBe("AE2");
    });

    it("percentage field is rounded to 1 d.p.", async () => {
      // 1/3 * 100 = 33.333…  → displayed as 33.3
      const r = await resolveCbeGrade("school-a", 1, 3);
      expect(r!.percentage).toBe(33.3);
    });
  });

  // ── 2b. School with custom scale ──────────────────────────────────────

  describe("school with a custom scale (uses custom, ignores default)", () => {
    beforeEach(() => mockCustomScale());

    it("returns usedDefault=false", async () => {
      expect((await resolveCbeGrade("school-xyz", 80, 100))!.usedDefault).toBe(false);
    });

    it("80% → Dist (≥75 in custom scale)", async () => {
      const r = await resolveCbeGrade("school-xyz", 80, 100);
      expect(r!.bandName).toBe("Dist");
      expect(r!.points).toBe(4);
    });

    it("60% → Merit (50–74 in custom scale)", async () => {
      const r = await resolveCbeGrade("school-xyz", 60, 100);
      expect(r!.bandName).toBe("Merit");
    });

    it("40% → Pass (35–49 in custom scale)", async () => {
      const r = await resolveCbeGrade("school-xyz", 40, 100);
      expect(r!.bandName).toBe("Pass");
    });

    it("10% → Fail (0–34 in custom scale)", async () => {
      const r = await resolveCbeGrade("school-xyz", 10, 100);
      expect(r!.bandName).toBe("Fail");
    });

    it("custom scale never returns EE1/EE2/ME1 etc. for school-xyz", async () => {
      const r = await resolveCbeGrade("school-xyz", 95, 100);
      expect(["EE1","EE2","ME1","ME2","AE1","AE2","BE1","BE2"]).not.toContain(r!.bandName);
    });

    it("a different school (no custom) still uses the KNEC default", async () => {
      const r = await resolveCbeGrade("school-other", 95, 100);
      expect(r!.bandName).toBe("EE1");
      expect(r!.usedDefault).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. saveCustomScale()
// ---------------------------------------------------------------------------

describe("saveCustomScale()", () => {
  beforeEach(() => {
    mockTransaction.mockReset();
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue(CUSTOM_BANDS);
  });

  it("calls $transaction and returns the saved rows", async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const txMock = {
        cbeGradingScale: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create:     jest.fn().mockResolvedValue({}),
        },
      };
      await fn(txMock);
    });

    const bands = CUSTOM_BANDS.map((b) => ({
      bandName:         b.bandName,
      achievementLevel: b.achievementLevel,
      minPercentage:    b.minPercentage,
      maxPercentage:    b.maxPercentage,
      points:           b.points,
      description:      b.description,
    }));

    const result = await saveCustomScale("school-xyz", bands);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual(CUSTOM_BANDS);
  });
});

// ---------------------------------------------------------------------------
// 4. resetToDefault()
// ---------------------------------------------------------------------------

describe("resetToDefault()", () => {
  beforeEach(() => {
    mockUpdateMany.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 4 });
  });

  it("calls updateMany with isActive=false for the given schoolId", async () => {
    await resetToDefault("school-xyz");
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { schoolId: "school-xyz", isActive: true },
      data:  { isActive: false },
    });
  });

  it("scopes the update to only the given school — not others", async () => {
    await resetToDefault("school-abc");
    expect(mockUpdateMany.mock.calls[0][0].where.schoolId).toBe("school-abc");
  });

  it("does not touch government default rows (schoolId IS NULL)", async () => {
    await resetToDefault("school-xyz");
    // The where clause must specify a non-null schoolId — never null.
    const where = mockUpdateMany.mock.calls[0][0].where;
    expect(where.schoolId).not.toBeNull();
  });
});
