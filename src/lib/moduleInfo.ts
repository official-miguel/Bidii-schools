import type { Module } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Module registry — single source of truth for labels, descriptions, and which
// navigation hub each module belongs to. Adding a new module here is the only
// change needed for it to appear in the permission matrix, nav filters, and
// role seeding automatically.
//
// Deliberately dependency-free (only a Prisma type import) so it can be read
// by tooling and by Soma AI's page map without dragging in auth/prisma.
// ─────────────────────────────────────────────────────────────────────────────

export type NavHub =
  | "dashboard"
  | "academic"
  | "people"
  | "student-life"
  | "calendar"
  | "communication"
  /** Archived institutional records — leavers, graduands, transferred staff. */
  | "archives"
  | "administration"
  | "diary"
  | "parent";

export const MODULE_INFO: Record<
  Module,
  { label: string; description: string; hub: NavHub }
> = {
  DEPARTMENTS:          { label: "Departments",               description: "Manage subject departments and heads",                                hub: "people" },
  SUBJECTS:             { label: "Subjects",                  description: "Manage the school's subject list",                                   hub: "academic" },
  STAFF:                { label: "Staff",                     description: "Manage teaching and non-teaching staff",                             hub: "people" },
  STAFF_ROLES:          { label: "Staff Roles & Permissions", description: "Define roles and what each can access (Principal only)",             hub: "administration" },
  CLASSES:              { label: "Classes",                   description: "Manage classes/streams",                                             hub: "academic" },
  STUDENTS:             { label: "Students",                  description: "Manage student records",                                             hub: "people" },
  TIMETABLE:            { label: "Timetable",                 description: "Build and edit the weekly timetable",                               hub: "academic" },
  RESULTS:              { label: "Results (legacy)",          description: "Legacy module — superseded by ASSESSMENTS",                         hub: "academic" },
  ASSESSMENTS:          { label: "Assessments",               description: "Enter and view assessment results across all frameworks",            hub: "academic" },
  ASSESSMENT_FRAMEWORK: { label: "Assessment Framework",      description: "Configure learning areas, strands, papers, and competency units",   hub: "academic" },
  TOD:                  { label: "Teacher on Duty",           description: "Manage duty rosters",                                               hub: "people" },
  COMMUNICATION:        { label: "Communication Centre",      description: "Send messages to staff, parents, and students",                     hub: "communication" },
  CALENDAR:             { label: "School Calendar",           description: "Manage the school calendar",                                        hub: "calendar" },
  AI_TOOLS:             { label: "AI Tools",                  description: "AI-assisted timetable, TOD, and insights",                         hub: "administration" },
  REPORTS:              { label: "Reports",                   description: "End-of-term and analytics reports",                                 hub: "administration" },
  RECORDS:              { label: "Conduct & Recognition",     description: "Discipline records, cases, and student achievements",               hub: "student-life" },
  RECORDS_DISCIPLINE:   { label: "Conduct & Recognition — Discipline",    description: "Discipline cases, files, AI summaries, print/export",              hub: "student-life" },
  RECORDS_ACHIEVEMENTS: { label: "Conduct & Recognition — Achievements", description: "Achievements, shared achievements, files, AI summaries",            hub: "student-life" },
  ANALYTICS:            { label: "Analytics",                 description: "School performance analytics and insights",                         hub: "administration" },
  LIBRARY:              { label: "Library",                   description: "Book catalogue, student library cards, borrowing, and fines",       hub: "academic" },
  HISTORY:              { label: "Archives",                  description: "Leavers and graduands: transferred, expelled, and graduated students, and staff who have left", hub: "archives" },
  ACCOMMODATION:        { label: "Accommodation",             description: "Dormitories, cubicles, beds, and student boarding allocations",     hub: "student-life" },
  ATTENDANCE:           { label: "Attendance",                description: "Take and review daily class attendance for any class",               hub: "academic" },
  FEES:                 { label: "Fees Management",           description: "School finance: fee structures, invoicing, payments, debtor tracking, and reports", hub: "administration" },
  DIARY:                { label: "Diary",                     description: "Post and view assignments, homework, and subject announcements",                       hub: "diary" },
};

export const ALL_MODULES = Object.keys(MODULE_INFO) as Module[];
