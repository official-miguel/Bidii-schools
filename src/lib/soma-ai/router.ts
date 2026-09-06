/**
 * src/lib/soma-ai/router.ts
 *
 * Smart query router — classifies incoming Soma AI messages and either:
 *   a) Answers them directly from the database (zero Gemini spend), or
 *   b) Routes them to Gemini for natural language reasoning
 *
 * Stage 3 additions:
 *   - 30+ new intent patterns for: parent/child queries, marks/results,
 *     timetable, library, discipline, report remarks, school summary
 *   - resolveIntelligenceAnswer() wires patterns to intelligence.ts resolvers
 *   - All DB answers pass through the user's permission scope
 */

import { prisma } from "@/lib/prisma";
import type { ClassifiedQuery, DbCategory } from "./config";
import type { UserScope } from "./permissions";
import {
  resolveAttendance,
  resolveMarks,
  resolveTimetable,
  resolveLibrary,
  resolveDiscipline,
  resolveReportRemarks,
  resolveChildrenOverview,
  resolveSchoolSummary,
} from "./intelligence";

// ---------------------------------------------------------------------------
// Extended DbCategory — covers all intelligence resolvers
// ---------------------------------------------------------------------------

export type ExtendedCategory =
  | DbCategory
  // Intelligence layer categories
  | "attendance_student"
  | "attendance_class"
  | "marks_student"
  | "marks_class"
  | "timetable_class"
  | "timetable_teacher"
  | "library_student"
  | "library_overview"
  | "discipline_student"
  | "report_remarks"
  | "children_overview"
  | "school_summary";

// ---------------------------------------------------------------------------
// Intent classifier — pure string matching, zero AI spend
// ---------------------------------------------------------------------------

const DB_PATTERNS: Array<{
  pattern: RegExp;
  category: ExtendedCategory;
  reason: string;
}> = [
  // ── Student counts ──────────────────────────────────────────────────────
  { pattern: /how many (students?|learners?|pupils?)/i, category: "student_count", reason: "student count" },
  { pattern: /number of (students?|learners?|pupils?)/i, category: "student_count", reason: "student count" },
  { pattern: /total (students?|learners?|enrollment)/i, category: "student_count", reason: "student count" },
  { pattern: /student count/i, category: "student_count", reason: "student count" },

  // ── Today's attendance ──────────────────────────────────────────────────
  { pattern: /\battendance\s+today\b/i, category: "attendance_today", reason: "today's attendance" },
  { pattern: /who (is|are|was|were) (absent|present|missing) today/i, category: "attendance_today", reason: "today's attendance" },
  { pattern: /today'?s?\s+attendance/i, category: "attendance_today", reason: "today's attendance" },
  { pattern: /\babsent today\b/i, category: "attendance_today", reason: "today's attendance" },
  { pattern: /\bpresent today\b/i, category: "attendance_today", reason: "today's attendance" },

  // ── Attendance summary / history ─────────────────────────────────────
  { pattern: /\battendance\b.*(rate|percentage|summary|stats|history|record)/i, category: "attendance_student", reason: "attendance summary" },
  { pattern: /(my|child'?s?|student'?s?)\s+attendance/i, category: "attendance_student", reason: "student attendance" },
  { pattern: /how (often|many times|frequently).*(absent|miss)/i, category: "attendance_student", reason: "absence frequency" },
  { pattern: /class\s+attendance/i, category: "attendance_class", reason: "class attendance" },

  // ── Marks / results ──────────────────────────────────────────────────
  { pattern: /(my|child'?s?|student'?s?)\s+(marks?|scores?|grades?|results?)/i, category: "marks_student", reason: "student marks" },
  { pattern: /(how (did|has|is))\s+\w+\s+(perform|do|score)/i, category: "marks_student", reason: "student performance" },
  { pattern: /\b(marks?|scores?|grades?|results?)\b.*(current|latest|term|period)/i, category: "marks_student", reason: "current results" },
  { pattern: /class (average|mean|results?|performance)/i, category: "marks_class", reason: "class marks" },
  { pattern: /subject (average|mean|scores?)/i, category: "marks_class", reason: "subject averages" },
  { pattern: /what did .{3,30} (score|get|achieve)/i, category: "marks_student", reason: "student score lookup" },

  // ── Timetable ────────────────────────────────────────────────────────
  { pattern: /(my|our|class)\s+timetable/i, category: "timetable_class", reason: "class timetable" },
  { pattern: /timetable (for|of)\s+\w+/i, category: "timetable_class", reason: "timetable lookup" },
  { pattern: /what (subject|lesson|class)\s+(do i|is)\s+(have|on|next)/i, category: "timetable_class", reason: "next lesson" },
  { pattern: /\bschedule\b.*(today|week|monday|tuesday|wednesday|thursday|friday)/i, category: "timetable_class", reason: "schedule" },
  { pattern: /(teaching|my lessons?|periods? (i|we) teach)/i, category: "timetable_teacher", reason: "teacher timetable" },

  // ── Library ──────────────────────────────────────────────────────────
  { pattern: /(library (card|status|fine|borrow|book))/i, category: "library_student", reason: "library card" },
  { pattern: /(books?\s+(i|student)\s+(borrowed|have|owe))/i, category: "library_student", reason: "borrowed books" },
  { pattern: /(library fine|outstanding fine|owe (the|a) library)/i, category: "library_student", reason: "library fine" },
  { pattern: /(overdue books?|books? (due|return))/i, category: "library_student", reason: "overdue books" },
  { pattern: /library (overview|summary|stats)/i, category: "library_overview", reason: "library overview" },

  // ── Discipline ────────────────────────────────────────────────────────
  { pattern: /(discipline (record|case|incident|history))/i, category: "discipline_student", reason: "discipline record" },
  { pattern: /(offence|violation|misconduct)\s+(record|history|case)/i, category: "discipline_student", reason: "discipline record" },

  // ── Report remarks ────────────────────────────────────────────────────
  { pattern: /(report (card|remark|comment))/i, category: "report_remarks", reason: "report remarks" },
  { pattern: /(teacher'?s?\s+comment|end.of.term\s+remark)/i, category: "report_remarks", reason: "report remarks" },

  // ── Parent: children overview ─────────────────────────────────────────
  { pattern: /(my (child|children|kids?|son|daughter))/i, category: "children_overview", reason: "children overview" },
  { pattern: /(how (is|are) my (child|children|son|daughter))/i, category: "children_overview", reason: "children status" },
  { pattern: /children('?s?) (overview|summary|status|progress)/i, category: "children_overview", reason: "children overview" },

  // ── School summary (admin) ────────────────────────────────────────────
  { pattern: /(school (overview|summary|snapshot|at a glance))/i, category: "school_summary", reason: "school summary" },
  { pattern: /(give me (an|the)\s+(overview|summary) of (the\s+)?school)/i, category: "school_summary", reason: "school summary" },
  { pattern: /(best|worst).*(performing|attendance).*(class|form|stream|subject)/i, category: "school_summary", reason: "performance ranking" },
  { pattern: /attendance (trend|over|last|past|this term)/i, category: "attendance_class", reason: "attendance trend" },
  { pattern: /summarize (attendance|marks|results|performance)/i, category: "school_summary", reason: "summary request" },
  { pattern: /overall (performance|results|marks|attendance)/i, category: "school_summary", reason: "overall performance" },

  // ── Lists ─────────────────────────────────────────────────────────────
  { pattern: /list (all\s+)?(classes?|forms?|streams?)/i, category: "class_list", reason: "class list" },
  { pattern: /show (me\s+)?(all\s+)?(the\s+)?(classes?|forms?)/i, category: "class_list", reason: "class list" },
  { pattern: /list (all\s+)?subjects?/i, category: "subject_list", reason: "subject list" },
  { pattern: /list (all\s+)?teachers?/i, category: "teacher_list", reason: "teacher list" },
  { pattern: /how many teachers?/i, category: "teacher_list", reason: "teacher count" },

  // ── Exam/assessment periods ───────────────────────────────────────────
  { pattern: /assessment periods?/i, category: "exam_periods", reason: "assessment periods" },
  { pattern: /(current|active|upcoming|past)\s+(exam|assessment|period)/i, category: "exam_periods", reason: "assessment periods" },

  // ── School info ───────────────────────────────────────────────────────
  { pattern: /what (is|'s) (the\s+)?school('?s)?\s+name/i, category: "school_info", reason: "school info" },
  { pattern: /school (name|info)/i, category: "school_info", reason: "school info" },
];

// Patterns that always require Gemini reasoning (override any DB match above).
//
// IMPORTANT — keep this list narrow. Broad matches like /trend/, /summarize/,
// /best performing/ used to be here but caused Soma AI to deflect data questions
// because Gemini received no live DB context. Now that buildLiveContext() injects
// a real data snapshot into every Gemini request, only patterns that genuinely
// need free-text reasoning (drafting, explaining concepts, multi-period comparison,
// predictions) belong here. Data questions should reach the DB path first.
const GEMINI_OVERRIDE_PATTERNS: RegExp[] = [
  // Text generation / drafting
  /\bdraft\b/i,
  /\bwrite (a|an|the)\b/i,
  /\bcompose\b/i,
  /\bcreate (a|an)\s+(notice|letter|report|message|email|sms)\b/i,
  /\bgenerate (a|an)\s+(remark|letter|notice|email|message)\b/i,
  /report card.*(remark|comment|draft|generate|write|improve)/i,

  // Concept explanation (not data lookup)
  /\bexplain\b.{0,40}\b(cbe|8-4-4|competency|grading|framework)\b/i,
  /\b(cbe|8-4-4|competency)\b.*(mean|explain|work|differ)/i,
  /what (does|do|did) .{5,40} mean/i,

  // Genuine reasoning / advice
  /\brecommend\b/i,
  /\badvice\b/i,
  /what should (i|we|the school)/i,
  /how (can|should|could) (i|we|the school) improve/i,
  /\bhelp me (understand|interpret|decide|plan)\b/i,

  // Predictions / forecasts (no live data can answer these)
  /\bpredict\b/i,
  /\bforecast\b/i,

  // Cross-period / multi-term comparisons (need richer reasoning)
  /compar(e|ing|ison).*(term|year|period|class|stream|form)/i,
  /between (term|class|form|stream)/i,
  /over (the )?(last|past|previous) (few|several|multiple|[2-9]|1[0-9]+)\s+(term|year|month)/i,

  // Open-ended insight requests
  /what (pattern|insight|conclusion)/i,
  /\binterpret\b/i,
  /why (is|are|does|do|did)\s+.{5,}/i,
];

export function classifyQuery(message: string): ClassifiedQuery {
  // Gemini override always wins
  for (const pat of GEMINI_OVERRIDE_PATTERNS) {
    if (pat.test(message)) {
      return { intent: "gemini", reason: `override: ${pat.toString()}` };
    }
  }

  // DB patterns
  for (const { pattern, category, reason } of DB_PATTERNS) {
    if (pattern.test(message)) {
      return {
        intent: "db",
        reason,
        dbCategory: category as DbCategory,
      };
    }
  }

  return { intent: "gemini", reason: "no direct DB pattern matched" };
}

// ---------------------------------------------------------------------------
// Intelligence-layer answer resolver (Stage 3)
// Routes extended categories to the right intelligence.ts resolver
// ---------------------------------------------------------------------------

export async function resolveIntelligenceAnswer(
  category: ExtendedCategory,
  scope: UserScope,
  message: string
): Promise<string | null> {
  switch (category) {
    case "attendance_today":
    case "attendance_student":
    case "attendance_class": {
      // Parse any student name hints from the message for future use
      return resolveAttendance(scope, {
        days: 30,
      });
    }

    case "marks_student":
    case "marks_class": {
      return resolveMarks(scope, {});
    }

    case "timetable_class": {
      // Parse day hint
      const dayMatch = message.match(
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
      );
      const dayMap: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      };
      const dayOfWeek = dayMatch ? dayMap[dayMatch[1].toLowerCase()] : undefined;
      return resolveTimetable(scope, { dayOfWeek });
    }

    case "timetable_teacher": {
      return resolveTimetable(scope, {});
    }

    case "library_student":
    case "library_overview": {
      return resolveLibrary(scope, {});
    }

    case "discipline_student": {
      return resolveDiscipline(scope, {});
    }

    case "report_remarks": {
      return resolveReportRemarks(scope, {});
    }

    case "children_overview": {
      return resolveChildrenOverview(scope);
    }

    case "school_summary": {
      return resolveSchoolSummary(scope);
    }

    // Legacy categories still handled by resolveDbAnswer below
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Legacy DB answer resolver (basic counts/lists — no scope needed)
// ---------------------------------------------------------------------------

export interface DbAnswerResult {
  answer: string;
  data?: unknown;
}

export async function resolveDbAnswer(
  schoolId: string,
  category: DbCategory,
  _message: string
): Promise<DbAnswerResult> {
  switch (category) {
    case "student_count": {
      const count = await prisma.student.count({ where: { schoolId, archivedAt: null } });
      const byClass = await prisma.schoolClass.findMany({
        where: { schoolId },
        select: { name: true, form: true, _count: { select: { students: true } } },
        orderBy: [{ form: "asc" }, { name: "asc" }],
      });
      const byClassLines = byClass
        .filter((c) => c._count.students > 0)
        .map((c) => `  • ${c.name}: ${c._count.students} student${c._count.students === 1 ? "" : "s"}`)
        .join("\n");
      return {
        answer: `**Total enrolled students: ${count}**\n\nBreakdown by class:\n${byClassLines || "  No classes with students found."}`,
        data: { count, byClass },
      };
    }

    case "attendance_today": {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
      const records = await prisma.attendance.findMany({
        where: { schoolClass: { schoolId }, date: { gte: today, lt: tomorrow } },
        include: {
          schoolClass: { select: { name: true } },
          student: { select: { fullName: true, admissionNumber: true } },
        },
        orderBy: { schoolClass: { name: "asc" } },
      });
      if (records.length === 0) {
        return { answer: `No attendance records for today (${today.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}).`, data: [] };
      }
      const present = records.filter((r) => r.status === "PRESENT").length;
      const absent = records.filter((r) => r.status === "ABSENT").length;
      const rate = records.length > 0 ? Math.round((present / records.length) * 100) : 0;
      const absentList = records.filter((r) => r.status === "ABSENT").slice(0, 20)
        .map((r) => `  • ${r.student.fullName} (${r.schoolClass.name})`).join("\n");
      return {
        answer: `**Today's attendance** (${today.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })})\n\n` +
          `**${present}** present · **${absent}** absent · **${rate}%** rate\n\n` +
          (absent > 0 ? `**Absent:**\n${absentList}${absent > 20 ? `\n  … and ${absent - 20} more` : ""}` : "All students present."),
        data: { present, absent, rate },
      };
    }

    case "attendance_summary": {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const records = await prisma.attendance.findMany({
        where: { schoolClass: { schoolId }, date: { gte: since } },
        select: { status: true, schoolClass: { select: { name: true } } },
      });
      if (records.length === 0) return { answer: "No attendance data for the last 30 days." };
      const present = records.filter((r) => r.status === "PRESENT").length;
      const absent = records.filter((r) => r.status === "ABSENT").length;
      const rate = Math.round((present / records.length) * 100);
      const byClass = new Map<string, { present: number; absent: number }>();
      for (const r of records) {
        const cur = byClass.get(r.schoolClass.name) ?? { present: 0, absent: 0 };
        if (r.status === "PRESENT") cur.present++; else cur.absent++;
        byClass.set(r.schoolClass.name, cur);
      }
      const classLines = Array.from(byClass.entries()).map(([name, v]) => {
        const total = v.present + v.absent;
        return `  • **${name}**: ${Math.round((v.present / total) * 100)}% (${v.present}/${total})`;
      }).join("\n");
      return {
        answer: `**Attendance — last 30 days**\n\nOverall: **${rate}%** (${present}/${records.length})\n\n**By class:**\n${classLines}`,
        data: { rate, present, absent },
      };
    }

    case "class_list": {
      const classes = await prisma.schoolClass.findMany({
        where: { schoolId },
        select: { name: true, form: true, _count: { select: { students: true } } },
        orderBy: [{ form: "asc" }, { name: "asc" }],
      });
      if (classes.length === 0) return { answer: "No classes configured yet." };
      const lines = classes.map((c) => `  • **${c.name}** — ${c._count.students} students`).join("\n");
      return { answer: `**Classes (${classes.length}):**\n\n${lines}`, data: classes };
    }

    case "subject_list": {
      const subjects = await prisma.subject.findMany({
        where: { schoolId },
        select: { name: true, code: true },
        orderBy: { name: "asc" },
      });
      if (subjects.length === 0) return { answer: "No subjects configured." };
      const lines = subjects.map((s) => `  • ${s.name}${s.code ? ` (${s.code})` : ""}`).join("\n");
      return { answer: `**Subjects (${subjects.length}):**\n\n${lines}`, data: subjects };
    }

    case "teacher_list": {
      const teachers = await prisma.teacher.findMany({
        where: { schoolId },
        select: { fullName: true, email: true },
        orderBy: { fullName: "asc" },
        take: 30,
      });
      const total = await prisma.teacher.count({ where: { schoolId } });
      if (total === 0) return { answer: "No teachers found." };
      const lines = teachers.map((t) => `  • ${t.fullName ?? t.email ?? "Unknown"}`).join("\n");
      return {
        answer: `**Teachers (${total}):**\n\n${lines}${total > 30 ? `\n  … and ${total - 30} more` : ""}`,
        data: { total },
      };
    }

    case "exam_periods": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const periods = await (prisma as any).assessmentPeriod.findMany({
        where: { schoolId },
        select: { name: true, academicYear: true, term: true, isCurrent: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }) as Array<{ name: string; academicYear: string; term: number | null; isCurrent: boolean }>;
      if (periods.length === 0) return { answer: "No assessment periods configured yet." };
      const lines = periods.map((p) =>
        `  • **${p.name}** — ${p.academicYear}${p.term ? ` · Term ${p.term}` : ""}${p.isCurrent ? " ✓ Current" : ""}`
      ).join("\n");
      return { answer: `**Assessment periods:**\n\n${lines}`, data: periods };
    }

    case "school_info": {
      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
      return { answer: school ? `**School:** ${school.name}` : "School information not found." };
    }

    default:
      return { answer: "I couldn't fetch that information directly." };
  }
}
