/**
 * src/lib/curriculum/classLabels.ts
 *
 * One place that decides how a class level is written on screen.
 *
 * A class level is saved as `stageName` ("Form 3", "Grade 11", "PP1") with
 * `form` holding only its numeric rank. Printing `Form ${form}` therefore
 * mislabels every CBE class — a Grade 11 class showing up as "Form 11".
 * Anything user-facing should go through these helpers instead of
 * interpolating the number itself.
 */

import type { FrameworkType } from "@prisma/client";

/** The subset of a class row any of these helpers needs. */
export interface ClassLabelSource {
  name?: string | null;
  form: number;
  stream?: string | null;
  stageName?: string | null;
  frameworkType?: FrameworkType | string | null;
}

/** A class as the filter bars and pickers carry it around. */
export interface ClassOption extends ClassLabelSource {
  id: string;
  name: string;
  form: number;
  /** Always present on a DB row — the column is non-null. */
  frameworkType: FrameworkType | string;
}

/**
 * Prisma `select` covering everything `classLevelLabel` reads. Spread this
 * into a `schoolClass.findMany` select so the label never has to fall back to
 * guessing from the rank.
 */
export const CLASS_LABEL_SELECT = {
  id: true,
  name: true,
  form: true,
  stream: true,
  stageName: true,
  frameworkType: true,
} as const;

/** Plural noun for a framework's levels, e.g. "forms" / "grades". */
export function levelNoun(framework?: FrameworkType | string | null): "form" | "grade" {
  return framework === "CBE" || framework === "CBC" ? "grade" : "form";
}

/** "All forms" / "All grades" — for filters scoped to a single framework. */
export function allLevelsLabel(framework?: FrameworkType | string | null): string {
  return levelNoun(framework) === "grade" ? "All grades" : "All forms";
}

/**
 * Last-resort label when no saved class row is available: derive it from the
 * framework rather than assuming 8-4-4.
 */
export function fallbackLevelLabel(
  form: number,
  framework?: FrameworkType | string | null
): string {
  return levelNoun(framework) === "grade" ? `Grade ${form}` : `Form ${form}`;
}

/**
 * The level label for one class — "Form 3", "Grade 11" — without its stream.
 *
 * Prefers the saved `stageName`; falls back to the class name with the stream
 * suffix stripped ("Grade 10 A" → "Grade 10"), then to the framework-derived
 * fallback.
 */
export function classLevelLabel(cls: ClassLabelSource): string {
  const stage = cls.stageName?.trim();
  if (stage) return stage;

  const name = cls.name?.trim();
  if (name) {
    const stripped = cls.stream
      ? name.replace(new RegExp(`\\s*${escapeRegExp(cls.stream)}\\s*$`, "i"), "").trim()
      : name;
    if (stripped) return stripped;
  }

  return fallbackLevelLabel(cls.form, cls.frameworkType);
}

/**
 * Full label for one class, including its stream — "Grade 10 A".
 * Uses the saved class name when there is one.
 */
export function classDisplayName(cls: ClassLabelSource): string {
  const name = cls.name?.trim();
  if (name) return name;
  const level = classLevelLabel(cls);
  return cls.stream ? `${level} ${cls.stream}` : level;
}

/**
 * Map of `form` (rank) → level label, built from the school's own classes.
 *
 * Used by filters and chips that only carry the form number. A school running
 * both frameworks can have two different levels on the same rank (8-4-4 Form 4
 * and CBE Grade 4); those are joined ("Form 4 / Grade 4") because a filter on
 * that number really does match both.
 */
export function buildLevelLabelMap(classes: ClassLabelSource[]): Map<number, string> {
  const byForm = new Map<number, string[]>();

  for (const cls of classes) {
    const label = classLevelLabel(cls);
    const labels = byForm.get(cls.form) ?? [];
    if (!labels.some((l) => l.toLowerCase() === label.toLowerCase())) labels.push(label);
    byForm.set(cls.form, labels);
  }

  return new Map([...byForm].map(([form, labels]) => [form, labels.join(" / ")]));
}

/**
 * Look a form number up in a label map, falling back to the framework-derived
 * label when the school has no class registered on that rank.
 */
export function levelLabelFor(
  labels: Map<number, string> | undefined,
  form: number,
  framework?: FrameworkType | string | null
): string {
  return labels?.get(form) ?? fallbackLevelLabel(form, framework);
}

/**
 * "form" / "grade" / "level" for a mixed list of classes — "level" when the
 * school runs both frameworks and neither noun covers everything.
 */
export function levelNounFor(classes: ClassLabelSource[]): "form" | "grade" | "level" {
  const nouns = new Set(classes.map((c) => levelNoun(c.frameworkType)));
  if (nouns.size === 1) return nouns.has("grade") ? "grade" : "form";
  return "level";
}

/**
 * "All forms" / "All grades" / "All levels" for a mixed list of classes —
 * whatever matches what the school actually runs.
 */
export function allLevelsLabelFor(classes: ClassLabelSource[]): string {
  return `All ${levelNounFor(classes)}s`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
