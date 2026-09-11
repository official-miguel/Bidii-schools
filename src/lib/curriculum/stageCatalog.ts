/**
 * src/lib/curriculum/stageCatalog.ts
 *
 * Fixed, code-defined ordered list of education stages per framework.
 * This is NOT user-editable. The `rank` field is the canonical ordering
 * source of truth for promotion logic — never use the raw `form` integer
 * directly for ordering after this is in place.
 *
 * FrameworkType values: EIGHT_FOUR_FOUR | CBC | CBE
 * Note: The DB/Prisma enum uses "CBC" but the original spec used "CBE" for
 * the competency-based curriculum stage list. The catalog below maps
 * the CBC enum value to the PP1–Grade 12 progression used in Kenyan schools,
 * and CBE to the TVET pathway (no fixed stage list — empty by design).
 */

import type { FrameworkType } from "@prisma/client";

export interface StageEntry {
  name: string;
  /** 1-based rank — the canonical ordering number within the framework. */
  rank: number;
}

export const STAGE_CATALOG: Record<FrameworkType, StageEntry[]> = {
  /** Competency Based Curriculum — PP1 through Grade 12. */
  CBC: [
    { name: "PP1",     rank: 1  },
    { name: "PP2",     rank: 2  },
    { name: "Grade 1", rank: 3  },
    { name: "Grade 2", rank: 4  },
    { name: "Grade 3", rank: 5  },
    { name: "Grade 4", rank: 6  },
    { name: "Grade 5", rank: 7  },
    { name: "Grade 6", rank: 8  },
    { name: "Grade 7", rank: 9  },
    { name: "Grade 8", rank: 10 },
    { name: "Grade 9", rank: 11 },
    { name: "Grade 10", rank: 12 },
    { name: "Grade 11", rank: 13 },
    { name: "Grade 12", rank: 14 },
  ],
  /** Kenya 8-4-4 — Form 1 through Form 4 (secondary). */
  EIGHT_FOUR_FOUR: [
    { name: "Form 1", rank: 1 },
    { name: "Form 2", rank: 2 },
    { name: "Form 3", rank: 3 },
    { name: "Form 4", rank: 4 },
  ],
  /**
   * CBE / TVET — competency-based education pathway.
   * No fixed sequential stage list; programmes are defined per institution.
   * Promotion mapping is still available but without catalog-driven
   * suggestions or skip-stage warnings.
   */
  CBE: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a stage entry by name within a given framework.
 * Returns undefined when the framework has no catalog (CBE) or the name
 * doesn't match any entry.
 */
export function getStageByName(
  framework: FrameworkType,
  name: string
): StageEntry | undefined {
  return STAGE_CATALOG[framework].find(
    (s) => s.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Look up a stage entry by rank within a given framework.
 */
export function getStageByRank(
  framework: FrameworkType,
  rank: number
): StageEntry | undefined {
  return STAGE_CATALOG[framework].find((s) => s.rank === rank);
}

/**
 * Given a framework and a source rank, return the next stage entry (rank + 1).
 * Returns undefined when there is no next stage (terminal) or when the
 * framework has no catalog.
 */
export function getNextStage(
  framework: FrameworkType,
  currentRank: number
): StageEntry | undefined {
  return getStageByRank(framework, currentRank + 1);
}

/**
 * Returns true when the framework has a non-empty catalog (i.e. stage-based
 * ordering and skip-stage warnings are meaningful).
 */
export function hasCatalog(framework: FrameworkType): boolean {
  return STAGE_CATALOG[framework].length > 0;
}

/**
 * Attempt to auto-match an existing class's legacy `form` integer to a
 * catalog entry for its framework.
 *
 * For EIGHT_FOUR_FOUR the mapping is straightforward: rank == form number.
 * For CBC, rank == form number works only if the existing data happens to
 * use sequential integers starting at 1 — which is not guaranteed.
 *
 * Returns the matched StageEntry when the match is unambiguous, or null
 * when the framework has no catalog or no entry with that rank exists.
 */
export function autoMatchLegacyForm(
  framework: FrameworkType,
  form: number
): StageEntry | null {
  if (!hasCatalog(framework)) return null;
  const entry = getStageByRank(framework, form);
  return entry ?? null;
}

/**
 * Determines whether setting a class's promotion target constitutes a
 * skip-stage (or backward) move, which requires an explicit confirmation.
 *
 * Returns:
 *   "ok"       — target rank is exactly source rank + 1 (normal promotion).
 *   "skip"     — target rank skips one or more stages forward.
 *   "backward" — target rank is ≤ source rank (demotion or same level).
 *   "no-catalog" — either framework has no stage catalog; no warning needed.
 *   "cross-framework" — source and target are in different frameworks; always warn.
 */
export type SkipCheckResult = "ok" | "skip" | "backward" | "no-catalog" | "cross-framework";

export function checkSkipStage(
  sourceFramework: FrameworkType,
  sourceRank: number | null,
  targetFramework: FrameworkType,
  targetRank: number | null
): SkipCheckResult {
  if (sourceFramework !== targetFramework) return "cross-framework";
  if (!hasCatalog(sourceFramework)) return "no-catalog";
  if (sourceRank == null || targetRank == null) return "no-catalog";

  if (targetRank === sourceRank + 1) return "ok";
  if (targetRank <= sourceRank) return "backward";
  return "skip"; // targetRank > sourceRank + 1
}
