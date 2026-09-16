/**
 * src/lib/messaging/resolve.ts
 *
 * Expands RecipientDescriptor[] into a flat list of {label, phone, groupTokens} records
 * by querying the database at send time — never caching phone numbers.
 *
 * SERVER-SIDE ONLY. Never import from client components.
 */

import { prisma } from "@/lib/prisma";
import { groupToken } from "@/lib/messaging/placeholders";
import { levelLabelForForm } from "@/lib/curriculum/levelLabelServer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecipientDescriptor =
  | { type: "student";    studentId: string }
  | { type: "teacher";    teacherId: string }
  | { type: "class";      classId: string }
  | { type: "form";       form: number }
  | { type: "group";      groupId: string }
  | { type: "allParents" }
  | { type: "allTeachers" }
  | { type: "allStaff" }
  | { type: "school" }
  | { type: "external";   phone: string; label: string };

export type ResolvedRecipient = {
  label: string;
  phone: string;
  /** Dynamic group tokens for this recipient, e.g. { "/bomname": "Alice Wanjiku" } */
  groupTokens?: Record<string, string>;
};
export type SkippedRecipient  = { label: string; reason: string };

export type ResolveResult = {
  resolved: ResolvedRecipient[];
  skipped:  SkippedRecipient[];
};

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

export async function resolveRecipients(
  descriptors: RecipientDescriptor[],
  schoolId: string
): Promise<ResolveResult> {
  const resolved: ResolvedRecipient[] = [];
  const skipped:  SkippedRecipient[]  = [];
  const seen = new Set<string>(); // deduplicate by phone

  function addResolved(label: string, phone: string | null | undefined, extraTokens?: Record<string, string>) {
    if (!phone || phone.trim() === "") {
      skipped.push({ label, reason: "no contact number on file" });
      return;
    }
    const normalised = phone.replace(/\s+/g, "");
    if (seen.has(normalised)) return;
    seen.add(normalised);
    resolved.push({ label, phone: normalised, ...(extraTokens ? { groupTokens: extraTokens } : {}) });
  }

  for (const d of descriptors) {
    switch (d.type) {
      case "external":
        addResolved(d.label, d.phone);
        break;

      case "student": {
        const s = await prisma.student.findUnique({
          where: { id: d.studentId },
          select: { fullName: true, parentContact: true, schoolId: true },
        });
        if (!s || s.schoolId !== schoolId) break;
        addResolved(s.fullName, s.parentContact);
        break;
      }

      case "teacher": {
        const t = await prisma.teacher.findUnique({
          where: { id: d.teacherId },
          select: { fullName: true, phone: true, schoolId: true },
        });
        if (!t || t.schoolId !== schoolId) break;
        addResolved(t.fullName, t.phone);
        break;
      }

      case "class": {
        const students = await prisma.student.findMany({
          where: { classId: d.classId, schoolId },
          select: { fullName: true, parentContact: true },
        });
        for (const s of students) addResolved(s.fullName, s.parentContact);
        break;
      }

      case "form": {
        const classes = await prisma.schoolClass.findMany({
          where: { form: d.form, schoolId },
          select: { id: true },
        });
        const classIds = classes.map((c) => c.id);
        const students = await prisma.student.findMany({
          where: { classId: { in: classIds }, schoolId },
          select: { fullName: true, parentContact: true },
        });
        for (const s of students) addResolved(s.fullName, s.parentContact);
        break;
      }

      case "group": {
        const grp = await prisma.recipientGroup.findUnique({
          where: { id: d.groupId },
          select: { name: true },
        });
        const token = grp ? groupToken(grp.name) : null;

        const members = await prisma.groupMember.findMany({
          where: { groupId: d.groupId },
          select: {
            extName: true, extPhone: true,
            teacher: { select: { fullName: true, phone: true } },
            student: { select: { fullName: true, parentContact: true } },
          },
        });
        for (const m of members) {
          let name: string | null = null;
          let phone: string | null | undefined = null;
          if (m.teacher)      { name = m.teacher.fullName; phone = m.teacher.phone; }
          else if (m.student) { name = m.student.fullName; phone = m.student.parentContact; }
          else if (m.extName) { name = m.extName;          phone = m.extPhone; }
          if (!name) continue;
          const extra = token ? { [token]: name } : undefined;
          addResolved(name, phone, extra);
        }
        break;
      }

      case "allParents": {
        const students = await prisma.student.findMany({
          where: { schoolId },
          select: { fullName: true, parentContact: true },
        });
        for (const s of students) addResolved(s.fullName, s.parentContact);
        break;
      }

      case "allTeachers": {
        const teachers = await prisma.teacher.findMany({
          where: { schoolId },
          select: { fullName: true, phone: true },
        });
        for (const t of teachers) addResolved(t.fullName, t.phone);
        break;
      }

      case "allStaff": {
        const teachers = await prisma.teacher.findMany({
          where: { schoolId },
          select: { fullName: true, phone: true },
        });
        for (const t of teachers) addResolved(t.fullName, t.phone);
        break;
      }

      case "school": {
        // Parents + teachers + staff
        const [students, teachers] = await Promise.all([
          prisma.student.findMany({ where: { schoolId }, select: { fullName: true, parentContact: true } }),
          prisma.teacher.findMany({ where: { schoolId }, select: { fullName: true, phone: true } }),
        ]);
        for (const s of students) addResolved(s.fullName, s.parentContact);
        for (const t of teachers) addResolved(t.fullName, t.phone);
        break;
      }
    }
  }

  return { resolved, skipped };
}

/**
 * Build a human-readable recipient summary string for the history list.
 *
 * A "form" descriptor carries only the numeric rank, so the level name is read
 * back off the school's own classes — a CBE cohort reads "Grade 11", not
 * "Form 11".
 */
export async function buildRecipientSummary(
  descriptors: RecipientDescriptor[],
  resolvedCount: number,
  schoolId: string
): Promise<string> {
  if (descriptors.length === 1) {
    const d = descriptors[0];
    if (d.type === "school")      return `Entire school — ${resolvedCount} recipients`;
    if (d.type === "allParents")  return `All parents — ${resolvedCount} recipients`;
    if (d.type === "allTeachers") return `All teachers — ${resolvedCount} recipients`;
    if (d.type === "allStaff")    return `All staff — ${resolvedCount} recipients`;
    if (d.type === "form")
      return `${await levelLabelForForm(schoolId, d.form)} — ${resolvedCount} recipients`;
  }
  return `${resolvedCount} recipient${resolvedCount === 1 ? "" : "s"}`;
}
