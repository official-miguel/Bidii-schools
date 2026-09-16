/**
 * Unit tests for subject mark computation.
 *
 * These pin down the one property everything else depends on: a mark is
 * reported on the same 0–100 scale it was entered on. A regression here showed
 * up in the CBE analysis as a learner who scored 98 being reported as 9800,
 * because each paper's score was multiplied by its own maxMarks before being
 * divided by the total.
 */

import { subjectScore } from "@/lib/assessment/grading844";
import { computeSubjectMark, evaluateFormula } from "@/lib/assessment/subjectMark";

const paper = (id: string, name: string, maxMarks: number) => ({ id, name, maxMarks });

describe("subjectScore", () => {
  it("returns the raw mark when a single paper is out of 100", () => {
    expect(subjectScore([98], [100])).toBe(98);
    expect(subjectScore([80], [100])).toBe(80);
    expect(subjectScore([0], [100])).toBe(0);
  });

  it("scales a single paper that is not out of 100", () => {
    expect(subjectScore([40], [50])).toBe(80);
    expect(subjectScore([30], [40])).toBe(75);
  });

  it("totals multiple papers over their combined maximum", () => {
    // 60 + 70 out of 80 + 120 = 130/200 = 65%
    expect(subjectScore([60, 70], [80, 120])).toBe(65);
    // Equal-weight papers average out.
    expect(subjectScore([50, 100], [100, 100])).toBe(75);
  });

  it("never exceeds 100 for full marks", () => {
    expect(subjectScore([100], [100])).toBe(100);
    expect(subjectScore([80, 120], [80, 120])).toBe(100);
  });

  it("returns null when any paper is unmarked or the input is malformed", () => {
    expect(subjectScore([60, null], [100, 100])).toBeNull();
    expect(subjectScore([], [])).toBeNull();
    expect(subjectScore([60], [100, 100])).toBeNull();
    expect(subjectScore([60], [0])).toBeNull();
  });
});

describe("evaluateFormula", () => {
  const papers = [paper("p1", "Paper 1", 80), paper("p2", "Paper 2", 100)];

  it("substitutes paper scores and evaluates the expression", () => {
    expect(evaluateFormula("(Paper 1 / 80) * 40 + (Paper 2 / 100) * 60", papers, [40, 50]))
      .toBeCloseTo(50);
  });

  it("matches longer paper names before shorter prefixes", () => {
    const many = [paper("p1", "Paper 1", 100), paper("p10", "Paper 10", 100)];
    expect(evaluateFormula("Paper 10 - Paper 1", many, [10, 90])).toBe(80);
  });

  it("returns null for an unmarked paper, an empty formula or a bad expression", () => {
    expect(evaluateFormula("Paper 1 + Paper 2", papers, [40, null])).toBeNull();
    expect(evaluateFormula("   ", papers, [40, 50])).toBeNull();
    expect(evaluateFormula("Paper 1 +", papers, [40, 50])).toBeNull();
    expect(evaluateFormula("Paper 1 / 0", papers, [40, 50])).toBeNull(); // Infinity
  });
});

describe("computeSubjectMark", () => {
  const papers = [paper("p1", "Paper 1", 100)];

  it("falls back to the papers total when no formula is configured", () => {
    expect(computeSubjectMark(papers, [98], null)).toBe(98);
    expect(computeSubjectMark(papers, [98], "")).toBe(98);
    expect(computeSubjectMark(papers, [98], "   ")).toBe(98);
  });

  it("uses the configured formula verbatim when there is one", () => {
    expect(computeSubjectMark(papers, [98], "Paper 1 / 2")).toBe(49);
  });

  it("propagates null for an unmarked subject either way", () => {
    expect(computeSubjectMark(papers, [null], null)).toBeNull();
    expect(computeSubjectMark(papers, [null], "Paper 1 / 2")).toBeNull();
  });
});
