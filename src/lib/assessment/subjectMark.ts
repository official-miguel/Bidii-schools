/**
 * Single source of truth for "what mark did this learner get in this subject".
 *
 * The mark sheet has always resolved a subject mark in two steps: apply the
 * Head-of-Department formula for the (subject, class level, exam period) if one
 * is set, and fall back to the plain papers-total otherwise. Every analysis
 * screen must resolve marks the same way — otherwise the number a teacher typed
 * into the mark sheet and the number the analysis reports for them disagree.
 *
 * `evaluateFormula` lives here (rather than inside MarksheetGrid) so the client
 * grid and the server-side analysis routes literally run the same code.
 *
 * This module is pure — safe in Server and Client Components alike. The
 * database-backed formula lookup lives in ./subjectMarkFormulas (server-only).
 */

import { subjectScore } from "@/lib/assessment/grading844";

export type FormulaPaper = { id: string; name: string; maxMarks: number };

/**
 * Evaluate a formula string such as `(Paper 1 / 80) * 40 + (Paper 2 / 100) * 60`,
 * substituting each paper's raw score for its name.
 *
 * Returns null when any referenced paper has no score yet (the subject is
 * incomplete) or when the expression is invalid / non-finite.
 */
export function evaluateFormula(
  formula: string,
  papers: FormulaPaper[],
  scores: (number | null)[]   // parallel to `papers`
): number | null {
  if (!formula.trim()) return null;

  let expr = formula;

  // Replace the longest paper names first so "Paper 1" never eats "Paper 10".
  const sorted = [...papers].sort((a, b) => b.name.length - a.name.length);
  for (const paper of sorted) {
    const idx = papers.findIndex((p) => p.id === paper.id);
    const score = scores[idx];
    if (score === null || score === undefined) return null; // incomplete → no result
    const escaped = paper.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expr = expr.replace(new RegExp(escaped, "g"), String(score));
  }

  try {
    // Function constructor is safe here: the expression is built by the user
    // through the calculator keyboard, which only emits paper names, numbers
    // and arithmetic operators — there is no free-text injection path.
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${expr});`)() as number;
    if (typeof result !== "number" || !isFinite(result) || isNaN(result)) return null;
    return result;
  } catch {
    return null;
  }
}

/**
 * Resolve one learner's mark for one subject, exactly as the mark sheet does.
 *
 * With a formula configured the formula's own result is the mark — it already
 * encodes whatever scaling the department wants, so nothing further is applied
 * to it. Without one, the mark is the papers total expressed out of 100.
 */
export function computeSubjectMark(
  papers: FormulaPaper[],
  scores: (number | null)[],
  formula: string | null
): number | null {
  if (formula && formula.trim()) return evaluateFormula(formula, papers, scores);
  return subjectScore(scores, papers.map((p) => p.maxMarks));
}
