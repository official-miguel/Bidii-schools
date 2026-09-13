/**
 * src/lib/soma-ai/help.ts
 *
 * Deterministic keyword-based help resolver for Soma AI.
 *
 * Mirrors the pattern in intelligence.ts: a pure, synchronous function that
 * takes a message + scope and returns a structured result — no DB calls, no
 * Gemini calls, no async, no embeddings.
 *
 * Matching algorithm (intentionally simple):
 *   1. Filter HELP_CONTENT to entries the caller's role can see.
 *   2. Score each entry: +1 per keyword that appears as a substring in the
 *      lowercased message.
 *   3. If top score >= MIN_SCORE, mark as confident.
 *   4. If exactly one confident entry is clearly ahead (gap >= CLEAR_GAP),
 *      return it directly.
 *   5. If 2-3 entries are tied/close at a confident score, return a
 *      disambiguation prompt (zero Gemini cost, just an extra turn).
 *   6. Below threshold → return null; caller falls through to Gemini.
 *   7. Even when null, return top nearMisses for Gemini context injection.
 */

import { HELP_CONTENT, type HelpEntry } from "./help-content";
import type { UserScope } from "./permissions";

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Minimum keyword hits before we treat a match as confident. */
export const MIN_SCORE = 1;

/**
 * Score gap between #1 and #2 required to return a single confident answer
 * without disambiguation.  If the top two entries are within CLEAR_GAP of
 * each other we ask the user to clarify instead.
 */
export const CLEAR_GAP = 1;

/** Max entries shown in a disambiguation prompt. */
const MAX_DISAMBIG = 3;

/** Max near-miss entries passed to Gemini as context when we fall through. */
export const MAX_NEAR_MISSES = 3;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type HelpResolveOutcome =
  | "confident"       // single clear match, answer returned directly
  | "disambiguation"  // multiple close matches, need one more turn
  | "no_match";       // below threshold, fall through to Gemini

export interface HelpResolveResult {
  outcome: HelpResolveOutcome;
  /** Set when outcome === "confident". */
  entry?: HelpEntry;
  /** Set when outcome === "disambiguation". */
  candidates?: HelpEntry[];
  /**
   * Top-scoring entries even below threshold — injected into the Gemini
   * context when outcome === "no_match" so the LLM paraphrases real content
   * rather than inventing steps.  Always populated (may be empty).
   */
  nearMisses: HelpEntry[];
  /** Scores for logging / debugging. */
  scores: Array<{ id: string; score: number }>;
}

// ---------------------------------------------------------------------------
// Core resolver
// ---------------------------------------------------------------------------

/**
 * Synchronous, zero-cost help resolver.
 *
 * @param message  The raw user message (will be lowercased internally).
 * @param scope    The resolved UserScope — used for role filtering.
 * @returns        A HelpResolveResult describing the outcome and content.
 */
export function resolveHelpAnswer(
  message: string,
  scope: UserScope
): HelpResolveResult {
  const lower = message.toLowerCase();
  const role  = scope.role.toLowerCase();

  // Step 1 — filter to role-visible entries
  const visible = HELP_CONTENT.filter(
    (e) => e.roles.length === 0 || e.roles.includes(role)
  );

  // Step 2 — score each entry
  const scored = visible.map((entry) => {
    let score = 0;
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) score++;
    }
    return { entry, score };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Collect all entries that score above zero for near-miss injection
  const aboveZero = scored.filter((s) => s.score > 0);
  const nearMisses = aboveZero
    .slice(0, MAX_NEAR_MISSES)
    .map((s) => s.entry);

  const scoreLog = scored
    .filter((s) => s.score > 0)
    .map((s) => ({ id: s.entry.id, score: s.score }));

  // Step 3 — check confidence threshold
  const top = scored[0];
  if (!top || top.score < MIN_SCORE) {
    return { outcome: "no_match", nearMisses, scores: scoreLog };
  }

  // Step 4 — single clear winner?
  const second = scored[1];
  const isUnambiguous =
    !second ||
    second.score < MIN_SCORE ||
    top.score - second.score >= CLEAR_GAP;

  if (isUnambiguous) {
    return {
      outcome: "confident",
      entry: top.entry,
      nearMisses,
      scores: scoreLog,
    };
  }

  // Step 5 — disambiguation: collect entries within CLEAR_GAP of the top
  const threshold = top.score - CLEAR_GAP + 1;
  const candidates = scored
    .filter((s) => s.score >= threshold && s.score >= MIN_SCORE)
    .slice(0, MAX_DISAMBIG)
    .map((s) => s.entry);

  return {
    outcome: "disambiguation",
    candidates,
    nearMisses,
    scores: scoreLog,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers used by chat/route.ts
// ---------------------------------------------------------------------------

/**
 * Formats a confident help entry as a Markdown chat response.
 * Includes a route hint when present so the user knows where to navigate.
 */
export function formatHelpAnswer(entry: HelpEntry): string {
  const routeHint = entry.route
    ? `\n\n*Navigate to: \`${entry.route}\`*`
    : "";
  return `**${entry.question}**\n\n${entry.answer}${routeHint}`;
}

/**
 * Formats a disambiguation prompt listing candidate questions.
 */
export function formatDisambiguation(candidates: HelpEntry[]): string {
  const lines = candidates
    .map((c, i) => `${i + 1}. ${c.question}`)
    .join("\n");
  return `I found a few guides that might help — which one are you looking for?\n\n${lines}\n\nJust reply with the number or rephrase your question.`;
}

/**
 * Formats near-miss entries as a compact Gemini context block.
 * Injected into the system prompt when no confident match is found,
 * so Gemini paraphrases real content rather than inventing steps.
 */
export function formatNearMissContext(entries: HelpEntry[]): string {
  if (entries.length === 0) return "";
  const blocks = entries.map((e) =>
    `### ${e.question}\n${e.answer}`
  );
  return (
    "## Possibly related guides from the Bidii help knowledge base\n" +
    "Paraphrase from the steps below rather than inventing new ones.\n\n" +
    blocks.join("\n\n")
  );
}
