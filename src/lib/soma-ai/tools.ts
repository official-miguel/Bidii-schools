/**
 * src/lib/soma-ai/tools.ts
 *
 * Gemini function/tool calling definitions and resolvers for Soma AI.
 *
 * Instead of injecting a static snapshot into the system prompt, Soma AI
 * now declares tool functions that Gemini calls on-demand when a question
 * requires live data. Each tool hits the DB with a targeted Prisma query
 * and returns structured markdown back to the model.
 *
 * Tool catalogue:
 *   getStudentCount          — total enrollment, breakdown by class
 *   getTodayAttendance       — who is absent/present today
 *   getAttendanceTrends      — attendance rate over N days, by class
 *   getExamResults           — marks for current/specified period
 *   getClassRankings         — ranked class performance by mean score
 *   getDormOccupancy         — boarding: beds occupied, vacant, by dorm
 *   getStudentProfile        — a single student's attendance + marks overview
 *   getLibraryStatus         — library card, borrowed books, fines
 *   getDisciplineRecords     — discipline incidents for scoped students
 *   getSchoolSummary         — admin: quick snapshot of key school stats
 *   getTimetable             — timetable for a class or teacher
 *   getTeacherList           — list of teachers in the school
 *   getClassList             — list of classes with student counts
 *   getAssessmentPeriods     — active and recent assessment periods
 */

import { prisma } from "@/lib/prisma";
import type { UserScope } from "./permissions";
import { buildDenialMessage } from "./permissions";

// ---------------------------------------------------------------------------
// TTL cache — 30-60s for frequently-requested, slow-changing data
// ---------------------------------------------------------------------------

interface CacheEntry {
  value: string;
  expires: number;
}

const _toolCache = new Map<string, CacheEntry>();

function getCached(key: string): string | null {
  const entry = _toolCache.get(key);
  if (entry && entry.expires > Date.now()) return entry.value;
  _toolCache.delete(key);
  return null;
}

function setCached(key: string, value: string, ttlMs: number): void {
  _toolCache.set(key, { value, expires: Date.now() + ttlMs });
}

/** Clear all expired entries (call occasionally to prevent memory leak) */
export function pruneToolCache(): void {
  const now = Date.now();
  for (const [key, entry] of _toolCache) {
    if (entry.expires <= now) _toolCache.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "N/A";
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Gemini tool declaration schema (sent with every chat request)
// ---------------------------------------------------------------------------

export interface GeminiToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export const SOMA_TOOL_DECLARATIONS: GeminiToolDeclaration[] = [
  {
    name: "getStudentCount",
    description: "Returns total enrolled student count and breakdown by class. Use when asked about enrollment numbers.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "getTodayAttendance",
    description: "Returns today's attendance: who is present, who is absent, and the overall rate. Use for any question about attendance today.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "getAttendanceTrends",
    description: "Returns attendance rate trends over a period. Use for questions about attendance history, rates over time, or class-level attendance.",
    parameters: {
      type: "OBJECT",
      properties: {
        days: { type: "number", description: "Lookback window in days. Default 30." },
        classId: { type: "string", description: "Optional: filter to a specific class id." },
      },
    },
  },
  {
    name: "getExamResults",
    description: "Returns assessment/exam results for the current or specified period. Use when asked about marks, scores, grades, results, or performance.",
    parameters: {
      type: "OBJECT",
      properties: {
        periodId: { type: "string", description: "Assessment period id. Omit for the current period." },
        classId:  { type: "string", description: "Filter to a specific class." },
        studentId: { type: "string", description: "Filter to a single student." },
        subjectId: { type: "string", description: "Filter to a specific subject." },
      },
    },
  },
  {
    name: "getClassRankings",
    description: "Returns classes ranked by mean score for the current assessment period. Use when asked which class is performing best/worst.",
    parameters: {
      type: "OBJECT",
      properties: {
        periodId: { type: "string", description: "Assessment period id. Omit for the current period." },
      },
    },
  },
  {
    name: "getDormOccupancy",
    description: "Returns boarding/dorm occupancy: beds occupied, vacant, capacity per dorm. Use for any question about boarding, dormitory, or hostel.",
    parameters: {
      type: "OBJECT",
      properties: {
        dormId: { type: "string", description: "Optional: filter to a specific dorm/hostel id." },
      },
    },
  },
  {
    name: "getStudentProfile",
    description: "Returns a single student's attendance rate and marks overview. Use when asked about a specific student by name.",
    parameters: {
      type: "OBJECT",
      properties: {
        studentName: { type: "string", description: "Full or partial name of the student to look up." },
        studentId:   { type: "string", description: "Student id if known." },
      },
    },
  },
  {
    name: "getLibraryStatus",
    description: "Returns library card status, borrowed books, and any fines for the scoped student(s). Use for library questions.",
    parameters: {
      type: "OBJECT",
      properties: {
        studentId: { type: "string", description: "Optional: filter to a specific student." },
      },
    },
  },
  {
    name: "getDisciplineRecords",
    description: "Returns recent discipline incidents for the scoped students. Use when asked about discipline, offences, or misconduct.",
    parameters: {
      type: "OBJECT",
      properties: {
        studentId: { type: "string", description: "Optional: filter to a single student." },
        limit:     { type: "number", description: "Max records to return. Default 10." },
      },
    },
  },
  {
    name: "getSchoolSummary",
    description: "Returns a quick school-wide summary: enrollment, staff count, today's attendance, active assessment period. Use for overview questions.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "getTimetable",
    description: "Returns the timetable for the user's class(es) or teaching schedule. Use for schedule/timetable/lesson questions.",
    parameters: {
      type: "OBJECT",
      properties: {
        dayOfWeek: { type: "number", description: "0=Sunday … 6=Saturday. Omit for full week." },
        classId:   { type: "string", description: "Optional: specific class id." },
      },
    },
  },
  {
    name: "getTeacherList",
    description: "Returns a list of teachers in the school. Use when asked about staff or teachers.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "getClassList",
    description: "Returns a list of classes with student counts. Use when asked to list classes or forms.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "getAssessmentPeriods",
    description: "Returns active and recent assessment/exam periods. Use when asked about current term, exam periods, or academic calendar.",
    parameters: { type: "OBJECT", properties: {} },
  },
];

// ---------------------------------------------------------------------------
// Tool argument types
// ---------------------------------------------------------------------------

export interface ToolArgs {
  getStudentCount: Record<string, never>;
  getTodayAttendance: Record<string, never>;
  getAttendanceTrends: { days?: number; classId?: string };
  getExamResults: { periodId?: string; classId?: string; studentId?: string; subjectId?: string };
  getClassRankings: { periodId?: string };
  getDormOccupancy: { dormId?: string };
  getStudentProfile: { studentName?: string; studentId?: string };
  getLibraryStatus: { studentId?: string };
  getDisciplineRecords: { studentId?: string; limit?: number };
  getSchoolSummary: Record<string, never>;
  getTimetable: { dayOfWeek?: number; classId?: string };
  getTeacherList: Record<string, never>;
  getClassList: Record<string, never>;
  getAssessmentPeriods: Record<string, never>;
}

export type ToolName = keyof ToolArgs;

// ---------------------------------------------------------------------------
// Tool dispatcher — routes a function call to the correct resolver
// ---------------------------------------------------------------------------

export async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  scope: UserScope
): Promise<string> {
  switch (toolName as ToolName) {
    case "getStudentCount":      return getStudentCount(scope);
    case "getTodayAttendance":   return getTodayAttendance(scope);
    case "getAttendanceTrends":  return getAttendanceTrends(scope, args as ToolArgs["getAttendanceTrends"]);
    case "getExamResults":       return getExamResults(scope, args as ToolArgs["getExamResults"]);
    case "getClassRankings":     return getClassRankings(scope, args as ToolArgs["getClassRankings"]);
    case "getDormOccupancy":     return getDormOccupancy(scope, args as ToolArgs["getDormOccupancy"]);
    case "getStudentProfile":    return getStudentProfile(scope, args as ToolArgs["getStudentProfile"]);
    case "getLibraryStatus":     return getLibraryStatus(scope, args as ToolArgs["getLibraryStatus"]);
    case "getDisciplineRecords": return getDisciplineRecords(scope, args as ToolArgs["getDisciplineRecords"]);
    case "getSchoolSummary":     return getSchoolSummary(scope);
    case "getTimetable":         return getTimetable(scope, args as ToolArgs["getTimetable"]);
    case "getTeacherList":       return getTeacherList(scope);
    case "getClassList":         return getClassList(scope);
    case "getAssessmentPeriods": return getAssessmentPeriods(scope);
    default:
      return `Unknown tool: ${toolName}. Please try a different approach.`;
  }
}

// ---------------------------------------------------------------------------
// Tool resolvers — each hits Prisma directly and returns markdown
// ---------------------------------------------------------------------------

async function getStudentCount(scope: UserScope): Promise<string> {
  const cacheKey = `studentCount:${scope.schoolId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const count = await prisma.student.count({
    where: { schoolId: scope.schoolId, archivedAt: null },
  });
  const byClass = await prisma.schoolClass.findMany({
    where: { schoolId: scope.schoolId },
    select: { name: true, form: true, _count: { select: { students: true } } },
    orderBy: [{ form: "asc" }, { name: "asc" }],
  });
  const byClassLines = byClass
    .filter((c) => c._count.students > 0)
    .map((c) => `  • ${c.name}: ${c._count.students}`)
    .join("\n");

  const result = `**Total students: ${count}**\n\n**By class:**\n${byClassLines || "No classes with students."}`;
  setCached(cacheKey, result, 60_000); // 60s TTL
  return result;
}

async function getTodayAttendance(scope: UserScope): Promise<string> {
  const cacheKey = `todayAttendance:${scope.schoolId}:${scope.userId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const filter = scope.isAdmin
    ? { schoolClass: { schoolId: scope.schoolId }, date: { gte: today, lt: tomorrow } }
    : { studentId: { in: scope.studentIds }, date: { gte: today, lt: tomorrow } };

  const records = await prisma.attendance.findMany({
    where: filter,
    include: {
      student: { select: { fullName: true, admissionNumber: true } },
      schoolClass: { select: { name: true } },
    },
    orderBy: { schoolClass: { name: "asc" } },
  });

  if (records.length === 0) {
    return `No attendance marked yet for today (${fmtDate(today)}).`;
  }

  const present = records.filter((r) => r.status === "PRESENT").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  const rate = pct(present, records.length);
  const absentList = records
    .filter((r) => r.status === "ABSENT")
    .slice(0, 15)
    .map((r) => `  • ${r.student.fullName} (${r.schoolClass.name})`)
    .join("\n");

  const result =
    `**Today's attendance (${fmtDate(today)}):**\nPresent: **${present}** · Absent: **${absent}** · Rate: **${rate}**\n` +
    (absent > 0 ? `\n**Absent students:**\n${absentList}${absent > 15 ? `\n  … and ${absent - 15} more` : ""}` : "\nAll students present.");

  setCached(cacheKey, result, 30_000); // 30s TTL
  return result;
}

async function getAttendanceTrends(scope: UserScope, args: ToolArgs["getAttendanceTrends"]): Promise<string> {
  const days = args.days ?? 30;
  const cacheKey = `attendanceTrends:${scope.schoolId}:${days}:${args.classId ?? "all"}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const filter = scope.isAdmin
    ? { schoolId: scope.schoolId, date: { gte: since }, ...(args.classId ? { classId: args.classId } : {}) }
    : { studentId: { in: scope.studentIds }, date: { gte: since } };

  const records = await prisma.attendance.findMany({
    where: filter,
    select: { status: true, schoolClass: { select: { name: true } } },
    take: 2000,
  });

  if (records.length === 0) return `No attendance data for the last ${days} days.`;

  const present = records.filter((r) => r.status === "PRESENT").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  const rate = pct(present, records.length);

  // By class breakdown
  const byClass = new Map<string, { present: number; absent: number }>();
  for (const r of records) {
    const cls = r.schoolClass?.name ?? "Unknown";
    const cur = byClass.get(cls) ?? { present: 0, absent: 0 };
    if (r.status === "PRESENT") cur.present++;
    else cur.absent++;
    byClass.set(cls, cur);
  }

  const classLines = Array.from(byClass.entries())
    .sort(([, a], [, b]) => {
      const rateA = a.present / (a.present + a.absent);
      const rateB = b.present / (b.present + b.absent);
      return rateA - rateB; // lowest rate first
    })
    .slice(0, 8)
    .map(([cls, v]) => {
      const total = v.present + v.absent;
      return `  • ${cls}: ${pct(v.present, total)} (${v.present}/${total})`;
    })
    .join("\n");

  const result =
    `**Attendance trends (last ${days} days):**\nOverall: **${rate}** (${present} present / ${absent} absent)\n\n` +
    `**By class (lowest first):**\n${classLines}`;

  setCached(cacheKey, result, 45_000); // 45s TTL
  return result;
}

async function getExamResults(scope: UserScope, args: ToolArgs["getExamResults"]): Promise<string> {
  // Resolve period
  let periodId = args.periodId;
  let periodName = "current period";
  if (!periodId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = await (prisma as any).assessmentPeriod.findFirst({
      where: { schoolId: scope.schoolId, isCurrent: true },
      select: { id: true, name: true, academicYear: true, term: true },
    }) as { id: string; name: string; academicYear: string; term: number | null } | null;
    if (!current) return "No active assessment period found. Ask the principal to set one as current.";
    periodId = current.id;
    periodName = `${current.name} (${current.academicYear}${current.term ? ` · Term ${current.term}` : ""})`;
  }

  const cacheKey = `examResults:${scope.schoolId}:${periodId}:${args.classId ?? ""}:${args.studentId ?? ""}:${args.subjectId ?? ""}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Build student id filter
  let studentFilter: { studentId?: string | { in: string[] } } = {};
  if (args.studentId) {
    if (!scope.isAdmin && !scope.studentIds.includes(args.studentId)) {
      return buildDenialMessage("that student's results");
    }
    studentFilter = { studentId: args.studentId };
  } else {
    const baseIds = scope.isAdmin
      ? undefined
      : scope.studentIds;

    if (baseIds !== undefined) {
      studentFilter = { studentId: { in: baseIds } };
    }
  }

  // Optional class filter — map to student ids
  let classStudentIds: string[] | undefined;
  if (args.classId) {
    const classStudents = await prisma.student.findMany({
      where: { classId: args.classId, archivedAt: null },
      select: { id: true },
    });
    classStudentIds = classStudents.map((s) => s.id);
  }

  const items = await prisma.assessmentItem.findMany({
    where: {
      schoolId: scope.schoolId,
      periodId,
      ...(classStudentIds ? { studentId: { in: classStudentIds } } : studentFilter),
      ...(args.subjectId ? { subjectId: args.subjectId } : {}),
    },
    include: {
      student: { select: { fullName: true, admissionNumber: true, schoolClass: { select: { name: true } } } },
      subject: { select: { name: true } },
    },
    orderBy: [{ student: { fullName: "asc" } }, { subject: { name: "asc" } }],
    take: 400,
  });

  if (items.length === 0) return `No results found for ${periodName}.`;

  // Single student
  if (args.studentId || scope.studentIds.length === 1) {
    const name = items[0]?.student.fullName ?? "this student";
    const bySubject = new Map<string, number[]>();
    for (const item of items) {
      if (item.numericScore == null) continue;
      const arr = bySubject.get(item.subject?.name ?? "Unknown") ?? [];
      arr.push(item.numericScore);
      bySubject.set(item.subject?.name ?? "Unknown", arr);
    }
    const rows = Array.from(bySubject.entries())
      .map(([subj, scores]) => `  • ${subj}: **${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}**`);
    const result = `**Results for ${name} — ${periodName}**\n\n${rows.join("\n") || "No scores recorded yet."}`;
    setCached(cacheKey, result, 30_000);
    return result;
  }

  // Class/aggregate view
  const bySubject = new Map<string, number[]>();
  for (const item of items) {
    if (item.numericScore == null) continue;
    const arr = bySubject.get(item.subject?.name ?? "Unknown") ?? [];
    arr.push(item.numericScore);
    bySubject.set(item.subject?.name ?? "Unknown", arr);
  }
  const rows = Array.from(bySubject.entries())
    .sort(([, a], [, b]) => {
      const avgA = a.reduce((x, y) => x + y, 0) / a.length;
      const avgB = b.reduce((x, y) => x + y, 0) / b.length;
      return avgB - avgA;
    })
    .map(([subj, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return `  • ${subj}: avg **${avg.toFixed(1)}** | range ${Math.min(...scores)}–${Math.max(...scores)} (${scores.length} students)`;
    });

  const result = `**Results summary — ${periodName}**\n\n${rows.join("\n") || "No scores recorded yet."}`;
  setCached(cacheKey, result, 30_000);
  return result;
}

async function getClassRankings(scope: UserScope, args: ToolArgs["getClassRankings"]): Promise<string> {
  if (!scope.isAdmin) return buildDenialMessage("school-wide class rankings");

  let periodId = args.periodId;
  let periodName = "current period";
  if (!periodId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = await (prisma as any).assessmentPeriod.findFirst({
      where: { schoolId: scope.schoolId, isCurrent: true },
      select: { id: true, name: true },
    }) as { id: string; name: string } | null;
    if (!current) return "No active assessment period set.";
    periodId = current.id;
    periodName = current.name;
  }

  const cacheKey = `classRankings:${scope.schoolId}:${periodId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const items = await prisma.assessmentItem.findMany({
    where: { schoolId: scope.schoolId, periodId },
    select: {
      numericScore: true,
      student: { select: { schoolClass: { select: { name: true } } } },
    },
    take: 2000,
  });

  if (items.length === 0) return `No marks entered for ${periodName} yet.`;

  const byClass = new Map<string, number[]>();
  for (const item of items) {
    if (item.numericScore == null) continue;
    const cls = item.student.schoolClass?.name ?? "Unknown";
    const arr = byClass.get(cls) ?? [];
    arr.push(item.numericScore);
    byClass.set(cls, arr);
  }

  const ranked = Array.from(byClass.entries())
    .map(([cls, scores]) => ({
      cls,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      n: scores.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  const rows = ranked.map((r, i) => `  ${i + 1}. **${r.cls}** — ${r.avg.toFixed(1)} mean (${r.n} scores)`);
  const result = `**Class rankings — ${periodName}:**\n\n${rows.join("\n")}`;
  setCached(cacheKey, result, 60_000);
  return result;
}

async function getDormOccupancy(scope: UserScope, args: ToolArgs["getDormOccupancy"]): Promise<string> {
  if (!scope.isAdmin) return buildDenialMessage("dormitory occupancy data");

  const cacheKey = `dormOccupancy:${scope.schoolId}:${args.dormId ?? "all"}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    const dorms = await db.dormitory.findMany({
      where: {
        schoolId: scope.schoolId,
        ...(args.dormId ? { id: args.dormId } : {}),
      },
      select: {
        id: true,
        name: true,
        capacity: true,
        gender: true,
        _count: { select: { boarders: true } },
      },
      orderBy: { name: "asc" },
    }) as Array<{
      id: string;
      name: string;
      capacity: number | null;
      gender: string | null;
      _count: { boarders: number };
    }>;

    if (dorms.length === 0) {
      return "No dormitories found. Boarding may not be configured for this school.";
    }

    const rows = dorms.map((d) => {
      const occupied = d._count.boarders;
      const capacity = d.capacity ?? "?";
      const vacant = typeof d.capacity === "number" ? d.capacity - occupied : "?";
      const genderLabel = d.gender ? ` (${d.gender})` : "";
      const pctFull = typeof d.capacity === "number" && d.capacity > 0
        ? ` — ${Math.round((occupied / d.capacity) * 100)}% full`
        : "";
      return `  • **${d.name}**${genderLabel}: ${occupied} occupied / ${capacity} capacity · ${vacant} vacant${pctFull}`;
    });

    const totalOccupied = dorms.reduce((sum, d) => sum + d._count.boarders, 0);
    const totalCapacity = dorms.reduce((sum, d) => sum + (d.capacity ?? 0), 0);

    const result =
      `**Dormitory occupancy:**\n\n${rows.join("\n")}\n\n` +
      `**Total: ${totalOccupied} boarders${totalCapacity > 0 ? ` / ${totalCapacity} capacity (${Math.round((totalOccupied / totalCapacity) * 100)}% full)` : ""}**`;

    setCached(cacheKey, result, 60_000);
    return result;
  } catch {
    return "Boarding/dormitory data is not available. This module may not be active for your school.";
  }
}

async function getStudentProfile(scope: UserScope, args: ToolArgs["getStudentProfile"]): Promise<string> {
  let targetId = args.studentId;
  if (!targetId && args.studentName) {
    // Fuzzy name search within scope
    const matches = await prisma.student.findMany({
      where: {
        schoolId: scope.schoolId,
        id: scope.isAdmin ? undefined : { in: scope.studentIds },
        fullName: { contains: args.studentName, mode: "insensitive" },
        archivedAt: null,
      },
      select: { id: true, fullName: true },
      take: 5,
    });
    if (matches.length === 0) return `No student found matching "${args.studentName}".`;
    if (matches.length > 1) {
      const names = matches.map((s) => `• ${s.fullName}`).join("\n");
      return `Multiple students match "${args.studentName}":\n${names}\n\nPlease specify which one.`;
    }
    targetId = matches[0].id;
  }

  if (!targetId) return "Please provide a student name or id.";
  if (!scope.isAdmin && !scope.studentIds.includes(targetId)) {
    return buildDenialMessage("that student's profile");
  }

  const student = await prisma.student.findUnique({
    where: { id: targetId },
    select: {
      fullName: true,
      admissionNumber: true,
      schoolClass: { select: { name: true } },
    },
  });

  if (!student) return "Student not found.";

  // Attendance last 30 days
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const attRecords = await prisma.attendance.findMany({
    where: { studentId: targetId, date: { gte: since } },
    select: { status: true },
  });
  const present = attRecords.filter((r) => r.status === "PRESENT").length;
  const absent = attRecords.filter((r) => r.status === "ABSENT").length;
  const attRate = attRecords.length > 0 ? pct(present, attRecords.length) : "N/A";

  // Current period marks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentPeriod = await (prisma as any).assessmentPeriod.findFirst({
    where: { schoolId: scope.schoolId, isCurrent: true },
    select: { id: true, name: true },
  }) as { id: string; name: string } | null;

  let marksText = "No current assessment period.";
  if (currentPeriod) {
    const items = await prisma.assessmentItem.findMany({
      where: { studentId: targetId, periodId: currentPeriod.id },
      select: { subject: { select: { name: true } }, numericScore: true },
    });
    if (items.length > 0) {
      const bySubject = items
        .filter((i) => i.numericScore != null)
        .map((i) => `${i.subject?.name ?? "Unknown"}: ${i.numericScore}`);
      marksText = bySubject.join(" · ");
    } else {
      marksText = `No marks recorded for ${currentPeriod.name}.`;
    }
  }

  return (
    `**${student.fullName}** (${student.admissionNumber}) — ${student.schoolClass.name}\n\n` +
    `**Attendance (last 30 days):** ${attRate} (${present} present / ${absent} absent)\n\n` +
    `**Current marks:** ${marksText}`
  );
}

async function getLibraryStatus(scope: UserScope, args: ToolArgs["getLibraryStatus"]): Promise<string> {
  if (scope.studentIds.length === 0) return buildDenialMessage("library records");

  const targetIds = args.studentId
    ? scope.isAdmin || scope.studentIds.includes(args.studentId)
      ? [args.studentId]
      : []
    : scope.studentIds;

  if (targetIds.length === 0) return buildDenialMessage("that student's library records");

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const cards = await db.libraryCard.findMany({
      where: { schoolId: scope.schoolId, studentId: { in: targetIds } },
      include: {
        student: { select: { fullName: true, admissionNumber: true } },
        borrows: {
          where: { returnedAt: null },
          include: { book: { select: { title: true } } },
          orderBy: { dueAt: "asc" },
          take: 10,
        },
      },
    }) as Array<{
      status: string;
      fineBalance: number;
      currentBorrowCount: number;
      student: { fullName: string; admissionNumber: string };
      borrows: Array<{ dueAt: Date; book: { title: string } | null }>;
    }>;

    if (cards.length === 0) return "No library cards found.";

    const sections = cards.map((card) => {
      const statusLabel = card.status === "ACTIVE" ? "Active" : card.status;
      const fine = card.fineBalance > 0 ? ` · Fine: KES ${card.fineBalance.toFixed(2)}` : "";
      const borrowList = card.borrows.length > 0
        ? card.borrows.map((b) => {
            const overdue = new Date(b.dueAt) < new Date() ? " ⚠️ OVERDUE" : "";
            return `    • ${b.book?.title ?? "Unknown"} — due ${fmtDate(b.dueAt)}${overdue}`;
          }).join("\n")
        : "    No books borrowed.";
      return (
        `**${card.student.fullName}** (${card.student.admissionNumber})\n` +
        `  Status: ${statusLabel} · ${card.currentBorrowCount} book(s) out${fine}\n` +
        `  **Currently borrowed:**\n${borrowList}`
      );
    });

    return sections.join("\n\n");
  } catch {
    return "Library data is not available. This module may not be active.";
  }
}

async function getDisciplineRecords(scope: UserScope, args: ToolArgs["getDisciplineRecords"]): Promise<string> {
  if (scope.studentIds.length === 0) return buildDenialMessage("discipline records");

  const targetIds = args.studentId
    ? scope.isAdmin || scope.studentIds.includes(args.studentId)
      ? [args.studentId]
      : []
    : scope.studentIds;

  if (targetIds.length === 0) return buildDenialMessage("that student's discipline records");

  const records = await prisma.disciplineRecord.findMany({
    where: { schoolId: scope.schoolId, studentId: { in: targetIds } },
    include: { student: { select: { fullName: true } } },
    orderBy: { dateOfOffence: "desc" },
    take: args.limit ?? 10,
  });

  if (records.length === 0) return "No discipline records found.";

  const lines = records.map((r) => {
    const status = r.status === "OPEN" ? "Open" : r.status === "RESOLVED" ? "Resolved" : r.status;
    return `  • **${r.student.fullName}** — ${r.offence} (${fmtDate(r.dateOfOffence)}) · ${status}`;
  });

  return `**Discipline records:**\n\n${lines.join("\n")}`;
}

async function getSchoolSummary(scope: UserScope): Promise<string> {
  if (!scope.isAdmin) return buildDenialMessage("school-wide summary");

  const cacheKey = `schoolSummary:${scope.schoolId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [students, teachers, classes, absentToday, currentPeriod] = await Promise.all([
    prisma.student.count({ where: { schoolId: scope.schoolId, archivedAt: null } }),
    prisma.teacher.count({ where: { schoolId: scope.schoolId } }),
    prisma.schoolClass.count({ where: { schoolId: scope.schoolId } }),
    prisma.attendance.count({
      where: { schoolClass: { schoolId: scope.schoolId }, date: { gte: today, lt: tomorrow }, status: "ABSENT" },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).assessmentPeriod.findFirst({
      where: { schoolId: scope.schoolId, isCurrent: true },
      select: { name: true, academicYear: true },
    }) as Promise<{ name: string; academicYear: string } | null>,
  ]);

  const result =
    `**School snapshot:**\n` +
    `  • Students: **${students}**\n` +
    `  • Teachers: **${teachers}**\n` +
    `  • Classes: **${classes}**\n` +
    `  • Absent today: **${absentToday}**\n` +
    `  • Active period: **${currentPeriod ? `${currentPeriod.name} (${currentPeriod.academicYear})` : "None set"}**`;

  setCached(cacheKey, result, 60_000);
  return result;
}

async function getTimetable(scope: UserScope, args: ToolArgs["getTimetable"]): Promise<string> {
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const classFilter = args.classId
    ? { classId: args.classId }
    : scope.isAdmin
      ? {}
      : scope.teacherId
        ? { teacherId: scope.teacherId }
        : { classId: { in: scope.classIds } };

  const slots = await prisma.timetableSlot.findMany({
    where: {
      schoolId: scope.schoolId,
      ...classFilter,
      ...(args.dayOfWeek !== undefined ? { dayOfWeek: args.dayOfWeek } : {}),
    },
    include: {
      subject: { select: { name: true } },
      schoolClass: { select: { name: true } },
      teacher: { select: { fullName: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });

  if (slots.length === 0) return "No timetable slots found for your classes.";

  const byDay = new Map<number, typeof slots>();
  for (const slot of slots) {
    const arr = byDay.get(slot.dayOfWeek) ?? [];
    arr.push(slot);
    byDay.set(slot.dayOfWeek, arr);
  }

  const lines: string[] = [];
  for (const [day, daySlots] of Array.from(byDay.entries()).sort(([a], [b]) => a - b)) {
    lines.push(`\n**${DAY_NAMES[day] ?? `Day ${day}`}**`);
    for (const s of daySlots.sort((a, b) => a.period - b.period)) {
      const classLabel = scope.teacherId ? ` (${s.schoolClass.name})` : "";
      lines.push(`  P${s.period}: ${s.subject.name}${classLabel}${s.room ? ` [${s.room}]` : ""}`);
    }
  }

  return `**Timetable**${lines.join("\n")}`;
}

async function getTeacherList(scope: UserScope): Promise<string> {
  const total = await prisma.teacher.count({ where: { schoolId: scope.schoolId } });
  if (total === 0) return "No teachers found.";

  // Only fullName is selected — email/phone are contact details and must
  // never be surfaced to non-admin roles (teachers, parents, students) who
  // can also call this tool.
  const teachers = await prisma.teacher.findMany({
    where: { schoolId: scope.schoolId },
    select: { fullName: true },
    orderBy: { fullName: "asc" },
    take: 30,
  });

  const lines = teachers.map((t) => `  • ${t.fullName ?? "Unknown"}`);
  return `**Teachers (${total}):**\n\n${lines.join("\n")}${total > 30 ? `\n  … and ${total - 30} more` : ""}`;
}

async function getClassList(scope: UserScope): Promise<string> {
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId: scope.schoolId },
    select: { name: true, form: true, _count: { select: { students: true } } },
    orderBy: [{ form: "asc" }, { name: "asc" }],
  });

  if (classes.length === 0) return "No classes configured yet.";
  const lines = classes.map((c) => `  • **${c.name}** — ${c._count.students} student(s)`);
  return `**Classes (${classes.length}):**\n\n${lines.join("\n")}`;
}

async function getAssessmentPeriods(scope: UserScope): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periods = await (prisma as any).assessmentPeriod.findMany({
    where: { schoolId: scope.schoolId },
    select: { name: true, academicYear: true, term: true, isCurrent: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  }) as Array<{ name: string; academicYear: string; term: number | null; isCurrent: boolean }>;

  if (periods.length === 0) return "No assessment periods configured yet.";

  const lines = periods.map((p) =>
    `  • **${p.name}** — ${p.academicYear}${p.term ? ` · Term ${p.term}` : ""}${p.isCurrent ? " ✓ Current" : ""}`
  );
  return `**Assessment periods:**\n\n${lines.join("\n")}`;
}
