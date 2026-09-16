/**
 * src/lib/curriculum/levelLabelServer.ts
 *
 * Server-side counterpart to `classLabels` for code that holds a bare level
 * number (an elective group's scopeForm, a messaging "form" recipient) and has
 * to look the name up. Kept out of `classLabels.ts` so that module stays
 * importable from client components.
 *
 * SERVER-SIDE ONLY.
 */

import { prisma } from "@/lib/prisma";
import { CLASS_LABEL_SELECT, classLevelLabel, fallbackLevelLabel } from "./classLabels";

/**
 * The level label a school uses for a given rank — "Form 3", "Grade 11",
 * "PP1". Falls back to the 8-4-4 naming when the school has no class on that
 * rank, which is the only thing left to guess with.
 */
export async function levelLabelForForm(
  schoolId: string,
  form: number
): Promise<string> {
  const cls = await prisma.schoolClass.findFirst({
    where: { schoolId, form },
    select: { ...CLASS_LABEL_SELECT },
  });
  return cls ? classLevelLabel(cls) : fallbackLevelLabel(form);
}

/**
 * Scope label for anything keyed on `scopeForm`, where 0 means the whole
 * school rather than one level.
 */
export async function scopeLabelForForm(
  schoolId: string,
  scopeForm: number
): Promise<string> {
  if (scopeForm === 0) return "school-wide";
  return levelLabelForForm(schoolId, scopeForm);
}
