/**
 * src/lib/messaging/resolve.ts
 *
 * Expands RecipientDescriptor[] into a flat list of {label, phone, groupTokens} records
 * by querying the database at send time — never caching phone numbers.
 *
 * SERVER-SIDE ONLY. Never import from client components.
 */

import { prisma } from "@/lib/prisma";
import { groupToken, extractStream } from "@/lib/messaging/placeholders";
import type { PlaceholderContext } from "@/lib/messaging/placeholders";
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
  /**
   * Static placeholder values for this recipient — /name, /class, /Admission,
   * /staffname, /staffno. Applied at send time by deliverMessage().
   */
  context?: PlaceholderContext;
};
export type SkippedRecipient  = { label: string; reason: string };

export type ResolveResult = {
  resolved: ResolvedRecipient[];
  skipped:  SkippedRecipient[];
};

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/** Fields every student query below needs so /name, /class, /stream and /Admission resolve. */
const STUDENT_SELECT = {
  fullName:        true,
  parentContact:   true,
  admissionNumber: true,
  schoolClass:     { select: { name: true, stream: true } },
} as const;

type StudentRow = {
  fullName: string;
  parentContact: string | null;
  admissionNumber: string | null;
  schoolClass: { name: string; stream: string | null } | null;
};

function studentContext(s: StudentRow): PlaceholderContext {
  const className = s.schoolClass?.name ?? "";
  return {
    name:      s.fullName,
    class:     className,
    stream:    s.schoolClass?.stream ?? extractStream(className),
    Admission: s.admissionNumber ?? "",
  };
}

type TeacherRow = { fullName: string; phone: string | null; staffId?: string | null };

function teacherContext(t: TeacherRow): PlaceholderContext {
  return { name: t.fullName, staffname: t.fullName, staffno: t.staffId ?? "" };
}

export async function resolveRecipients(
  descriptors: RecipientDescriptor[],
  schoolId: string
): Promise<ResolveResult> {
  const resolved: ResolvedRecipient[] = [];
  const skipped:  SkippedRecipient[]  = [];
  const seen = new Set<string>(); // deduplicate by phone

  function addResolved(
    label: string,
    phone: string | null | undefined,
    opts?: { groupTokens?: Record<string, string>; context?: PlaceholderContext }
  ) {
    if (!phone || phone.trim() === "") {
      skipped.push({ label, reason: "no contact number on file" });
      return;
    }
    const normalised = phone.replace(/\s+/g, "");
    if (seen.has(normalised)) return;
    seen.add(normalised);
    resolved.push({
      label,
      phone: normalised,
      ...(opts?.groupTokens ? { groupTokens: opts.groupTokens } : {}),
      context: opts?.context ?? { name: label },
    });
  }

  for (const d of descriptors) {
    switch (d.type) {
      case "external":
        addResolved(d.label, d.phone);
        break;

      case "student": {
        const s = await prisma.student.findUnique({
          where: { id: d.studentId },
          select: { ...STUDENT_SELECT, schoolId: true },
        });
        if (!s || s.schoolId !== schoolId) break;
        addResolved(s.fullName, s.parentContact, { context: studentContext(s) });
        break;
      }

      case "teacher": {
        const t = await prisma.teacher.findUnique({
          where: { id: d.teacherId },
          select: { fullName: true, phone: true, staffId: true, schoolId: true },
        });
        if (!t || t.schoolId !== schoolId) break;
        addResolved(t.fullName, t.phone, { context: teacherContext(t) });
        break;
      }

      case "class": {
        const students = await prisma.student.findMany({
          where: { classId: d.classId, schoolId },
          select: STUDENT_SELECT,
        });
        for (const s of students) addResolved(s.fullName, s.parentContact, { context: studentContext(s) });
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
          select: STUDENT_SELECT,
        });
        for (const s of students) addResolved(s.fullName, s.parentContact, { context: studentContext(s) });
        break;
      }

      case "group": {
        // Scope the group to this school — a group id from another tenant
        // must not expand into recipients here.
        const grp = await prisma.recipientGroup.findFirst({
          where: { id: d.groupId, schoolId },
          select: { name: true },
        });
        if (!grp) break;
        const token = groupToken(grp.name);

        const members = await prisma.groupMember.findMany({
          where: { groupId: d.groupId },
          select: {
            extName: true, extPhone: true,
            teacher: { select: { fullName: true, phone: true, staffId: true, schoolId: true } },
            student: { select: { ...STUDENT_SELECT, schoolId: true } },
          },
        });
        for (const m of members) {
          let name: string | null = null;
          let phone: string | null | undefined = null;
          let context: PlaceholderContext | undefined;
          if (m.teacher) {
            if (m.teacher.schoolId !== schoolId) continue;
            name = m.teacher.fullName; phone = m.teacher.phone; context = teacherContext(m.teacher);
          } else if (m.student) {
            if (m.student.schoolId !== schoolId) continue;
            name = m.student.fullName; phone = m.student.parentContact; context = studentContext(m.student);
          } else if (m.extName) {
            name = m.extName; phone = m.extPhone; context = { name: m.extName };
          }
          if (!name) continue;
          addResolved(name, phone, { groupTokens: { [token]: name }, context });
        }
        break;
      }

      case "allParents": {
        const students = await prisma.student.findMany({
          where: { schoolId },
          select: STUDENT_SELECT,
        });
        for (const s of students) addResolved(s.fullName, s.parentContact, { context: studentContext(s) });
        break;
      }

      case "allTeachers":
      case "allStaff": {
        const teachers = await prisma.teacher.findMany({
          where: { schoolId },
          select: { fullName: true, phone: true, staffId: true },
        });
        for (const t of teachers) addResolved(t.fullName, t.phone, { context: teacherContext(t) });
        break;
      }

      case "school": {
        // Parents + teachers + staff
        const [students, teachers] = await Promise.all([
          prisma.student.findMany({ where: { schoolId }, select: STUDENT_SELECT }),
          prisma.teacher.findMany({ where: { schoolId }, select: { fullName: true, phone: true, staffId: true } }),
        ]);
        for (const s of students) addResolved(s.fullName, s.parentContact, { context: studentContext(s) });
        for (const t of teachers) addResolved(t.fullName, t.phone, { context: teacherContext(t) });
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
