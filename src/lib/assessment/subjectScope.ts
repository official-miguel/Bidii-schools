/**
 * Subject → form scoping.
 *
 * `Subject.applicableForms` is optional in the subject editor, and an empty
 * list means "this subject applies to every form" — that is how the HOD
 * department view and the mark sheets themselves have always treated it
 * (mark sheets do not filter by form at all). Analytics routes that used a
 * bare `applicableForms: { has: form }` silently dropped every subject left
 * unscoped, so marks entered against them showed up as "no entries recorded".
 *
 * Use these helpers instead of filtering on `has` directly.
 */

/** Prisma `where` fragment: subjects scoped to `form`, or unscoped entirely. */
export function subjectFormWhere(form: number) {
  return {
    OR: [
      { applicableForms: { has: form } },
      { applicableForms: { isEmpty: true } },
    ],
  };
}

/** In-memory equivalent of {@link subjectFormWhere}. */
export function subjectAppliesToForm(
  subject: { applicableForms: number[] },
  form: number,
): boolean {
  return subject.applicableForms.length === 0 || subject.applicableForms.includes(form);
}
