"use client";

/**
 * /super-admin/imports — School Import Dashboard
 *
 * Import types are organised into 4 dependency-ordered sections:
 *
 *  SECTION 1 — School Setup
 *    Departments → Classes (with framework) → Subjects
 *
 *  SECTION 2 — Staff
 *    Staff details + subjects they teach
 *
 *  SECTION 3 — Students
 *    Student details + elective subjects → Dorm allocation
 *
 *  SECTION 4 — Parents
 *    Parent / guardian data linked to students
 *
 * Each type has: icon, description, required/optional columns, template download.
 * Submit: creates ImportJob → uploads file → processes → shows result with error table.
 * All processors are duplicate-safe (upsert / skipDuplicates).
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Upload, History, CheckCircle2, XCircle, RefreshCw,
  Download, RotateCcw, AlertTriangle, FileText,
  Building2, BookOpen, Users, GraduationCap, BedDouble,
  DoorOpen, Heart, ChevronDown, ChevronUp, Info, Banknote,
} from "lucide-react";
import {
  PageHeader, Spinner, ErrorBanner, Badge, Card,
  primaryButtonClass, secondaryButtonClass, labelClass,
} from "@/components/ui";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ImportJob {
  id:           string;
  schoolId:     string;
  type:         string;
  fileName:     string;
  totalRows:    number;
  succeeded:    number;
  failed:       number;
  status:       string;
  errorReport:  RowError[] | null;
  rollbackAt:   string | null;
  rolledBackAt: string | null;
  createdAt:    string;
  school:       { name: string };
}
interface RowError    { row: number; field: string; message: string }
interface SchoolOption { id: string; name: string }
interface ParsedRow   { rowNum: number; data: Record<string, string>; errors: string[] }
type TabId = "new" | "history";

// ─────────────────────────────────────────────────────────────────────────────
// Import type catalogue — grouped into 4 sections
// ─────────────────────────────────────────────────────────────────────────────

interface ImportTypeDef {
  key:          string;
  label:        string;
  description:  string;
  icon:         React.ElementType;
  iconClass:    string;
  template:     string;
  requiredCols: string[];
  optionalCols: string[];
  note?:        string;
}

interface Section {
  id:    string;
  title: string;
  hint:  string;
  types: ImportTypeDef[];
}

const SECTIONS: Section[] = [
  {
    id:    "school",
    title: "Section 1 — School Setup",
    hint:  "Import in this order: Departments → Classes → Subjects → Dormitories & Beds.",
    types: [
      {
        key:          "DEPARTMENTS",
        label:        "Departments",
        description:  "Academic and administrative departments",
        icon:         Building2,
        iconClass:    "bg-purple-100 text-purple-600",
        template:     "departments-import.csv",
        requiredCols: ["name"],
        optionalCols: [],
      },
      {
        key:          "CLASSES",
        label:        "Classes",
        description:  "Form groups with curriculum framework (8-4-4 / CBC / CBE)",
        icon:         GraduationCap,
        iconClass:    "bg-sky-100 text-sky-600",
        template:     "classes-import.csv",
        requiredCols: ["name", "form"],
        optionalCols: ["stream", "framework_type"],
        note:         "framework_type: EIGHT_FOUR_FOUR, CBC, or CBE. Defaults to EIGHT_FOUR_FOUR.",
      },
      {
        key:          "SUBJECTS",
        label:        "Subjects",
        description:  "Subject catalogue linked to departments and applicable forms",
        icon:         BookOpen,
        iconClass:    "bg-blue-100 text-blue-600",
        template:     "subjects-import.csv",
        requiredCols: ["name", "code", "department_name"],
        optionalCols: ["type", "applicable_forms"],
        note:         "type: CORE or ELECTIVE. applicable_forms: comma-separated e.g. \"1,2,3,4\".",
      },
      {
        key:          "DORM_SETUP",
        label:        "Dormitories & Beds",
        description:  "Dorms, cubicles, and beds — all in one file. Sleeping positions auto-generated.",
        icon:         DoorOpen,
        iconClass:    "bg-orange-100 text-orange-600",
        template:     "dorm-setup-import.csv",
        requiredCols: ["dorm_name"],
        optionalCols: ["gender_policy", "structure", "allocation_policy", "description", "bed_label", "cubicle_name", "bed_type", "custom_occupancy"],
        note:         "Leave bed_label blank on dorm header rows. Populate bed_label on bed rows. cubicle_name only needed for CUBICLE_BASED dorms.",
      },
    ],
  },
  {
    id:    "staff",
    title: "Section 2 — Staff",
    hint:  "Import Departments and Subjects before importing Staff.",
    types: [
      {
        key:          "STAFF",
        label:        "Staff + Subject Assignments",
        description:  "Teacher details and the subjects they are qualified to teach",
        icon:         Users,
        iconClass:    "bg-teal-100 text-teal-600",
        template:     "staff-import.csv",
        requiredCols: ["staff_id", "full_name"],
        optionalCols: ["email", "phone", "designation", "department_name", "subject_codes"],
        note:         "subject_codes: comma-separated subject codes e.g. \"BIO,CHEM\". Creates TeacherSubject links.",
      },
    ],
  },
  {
    id:    "students",
    title: "Section 3 — Students",
    hint:  "Import Classes and Subjects before importing Students. Import Dormitories & Beds before Dorm Allocation.",
    types: [
      {
        key:          "STUDENTS",
        label:        "Students + Elective Subjects",
        description:  "Student registry with class assignment and optional elective enrolment",
        icon:         GraduationCap,
        iconClass:    "bg-green-100 text-green-600",
        template:     "students-import.csv",
        requiredCols: ["admission_number", "full_name", "class_name"],
        optionalCols: ["gender", "boarding_status", "date_of_birth", "elective_subject_codes"],
        note:         "Core subjects apply automatically via their applicable_forms. elective_subject_codes: comma-separated codes e.g. \"HIST,GEO\".",
      },
      {
        key:          "STUDENT_DORM",
        label:        "Dorm Allocation",
        description:  "Assign students to dormitories and sleeping positions",
        icon:         BedDouble,
        iconClass:    "bg-rose-100 text-rose-600",
        template:     "student-dorm-import.csv",
        requiredCols: ["admission_number", "dorm_name"],
        optionalCols: ["cubicle_name", "bed_label", "position", "notes"],
        note:         "Import Dormitories and Beds first. position: UPPER or LOWER for bunk beds.",
      },
    ],
  },
  {
    id:    "parents",
    title: "Section 4 — Parents",
    hint:  "Import Students before importing parent/guardian data.",
    types: [
      {
        key:          "PARENTS",
        label:        "Parents / Guardians",
        description:  "Parent and guardian contact details linked to students",
        icon:         Heart,
        iconClass:    "bg-pink-100 text-pink-600",
        template:     "parents-import.csv",
        requiredCols: ["admission_number", "parent_name"],
        optionalCols: ["parent_contact", "relationship"],
        note:         "Linked to student by admission_number. relationship e.g. Mother, Father, Guardian.",
      },
    ],
  },
  {
    id:    "finance",
    title: "Section 5 — Finance",
    hint:  "Import Students before importing opening balances. Balances are posted as OPENING_BALANCE ledger entries and cannot be undone — verify your CSV carefully before submitting.",
    types: [
      {
        key:          "STUDENT_OPENING_BALANCE",
        label:        "Student Opening Balances",
        description:  "Seed the ledger with each student's current outstanding balance from a previous system",
        icon:         Banknote,
        iconClass:    "bg-emerald-100 text-emerald-600",
        template:     "student-opening-balances-import.csv",
        requiredCols: ["admission_number", "balance"],
        optionalCols: ["student_name", "description"],
        note:         "balance: positive = student owes (debit), e.g. 15000. student_name is informational only. description defaults to \"Opening balance import\".",
      },
    ],
  },
];

// Flat lookup maps derived from SECTIONS
const ALL_TYPES: ImportTypeDef[] = SECTIONS.flatMap(s => s.types);
const TYPE_BY_KEY = new Map(ALL_TYPES.map(t => [t.key, t]));
const TYPE_LABEL: Record<string, string> = Object.fromEntries(ALL_TYPES.map(t => [t.key, t.label]));

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "success" | "warn" | "danger" | "default" | "teal"> = {
    COMPLETED: "success", PROCESSING: "teal", QUEUED: "warn", FAILED: "danger", ROLLED_BACK: "default",
  };
  return <Badge variant={map[status] ?? "default"}>{status.replace(/_/g, " ")}</Badge>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side CSV parser (preview only)
// Only validates the first PREVIEW_LIMIT rows to keep the browser responsive
// on large files. The total row count is reported accurately from a fast line
// count so the user still sees "12 000 rows total" without parsing them all.
// ─────────────────────────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 500; // rows validated + shown in preview

function parseCSV(
  text: string,
  requiredCols: string[],
): { headers: string[]; rows: ParsedRow[]; totalCount: number } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) return { headers: [], rows: [], totalCount: 0 };

  function split(line: string): string[] {
    const r: string[] = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === "," && !inQ) { r.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    r.push(cur.trim()); return r;
  }

  const headers    = split(lines[0]).map(h => h.toLowerCase().trim());
  const totalCount = lines.length - 1; // accurate total — no parsing needed

  // Only validate up to PREVIEW_LIMIT rows to avoid blocking the main thread
  // on files with tens of thousands of rows. The server validates everything.
  const previewLines = lines.slice(1, PREVIEW_LIMIT + 1);
  const rows: ParsedRow[] = previewLines.map((line, i) => {
    const vals = split(line);
    const data: Record<string, string> = {};
    headers.forEach((h, idx) => { data[h] = vals[idx] ?? ""; });
    const errors: string[] = [];
    requiredCols.forEach(col => {
      const satisfied = col.split(" or ").some(p => {
        const k = headers.find(h => h === p.trim());
        return k && data[k]?.trim();
      });
      if (!satisfied) errors.push(`${col} is required`);
    });
    if (headers.length !== vals.length)
      errors.push(`Column count mismatch (expected ${headers.length}, got ${vals.length})`);
    return { rowNum: i + 2, data, errors };
  });
  return { headers, rows, totalCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation preview table
// ─────────────────────────────────────────────────────────────────────────────

function ValidationPreview({ headers, rows, totalCount }: { headers: string[]; rows: ParsedRow[]; totalCount: number }) {
  const errCount   = rows.filter(r => r.errors.length > 0).length;
  const validCount = rows.length - errCount;
  const tableRows  = rows.slice(0, 200); // cap table render at 200 rows
  const previewedCount = rows.length;
  const isLarge = totalCount > PREVIEW_LIMIT;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-sm flex-wrap">
        <span className="flex items-center gap-1.5 text-success font-medium">
          <CheckCircle2 className="h-4 w-4" /> {validCount} valid
        </span>
        {errCount > 0 && (
          <span className="flex items-center gap-1.5 text-danger font-medium">
            <XCircle className="h-4 w-4" /> {errCount} with errors
          </span>
        )}
        <span className="text-slate dark:text-dark-muted text-xs">
          {totalCount.toLocaleString()} rows total
          {isLarge ? ` · previewing first ${previewedCount.toLocaleString()}` : ""}
          {previewedCount > 200 ? " · showing first 200 in table" : ""}
        </span>
      </div>
      {isLarge && (
        <div className="rounded-lg bg-teal-50 dark:bg-teal/5 border border-teal/20 px-4 py-2.5 flex items-start gap-2">
          <Info className="h-4 w-4 text-teal shrink-0 mt-0.5" />
          <p className="text-xs text-teal leading-relaxed">
            Large file detected — showing a preview of the first {previewedCount.toLocaleString()} rows.
            All {totalCount.toLocaleString()} rows will be fully validated and imported on the server.
          </p>
        </div>
      )}
      <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden shadow-xs max-h-60 overflow-y-auto">
        <table className="min-w-full divide-y divide-line dark:divide-dark-border text-xs">
          <thead className="sticky top-0 bg-slate-50/95 dark:bg-dark-surface z-10">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold text-slate uppercase tracking-wide w-10">#</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate uppercase tracking-wide w-8">✓</th>
              {headers.slice(0, 6).map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
            {tableRows.map(row => (
              <tr key={row.rowNum} className={row.errors.length > 0 ? "bg-danger-bg/40" : "hover:bg-slate-50/40"}>
                <td className="px-3 py-2 text-slate tabular-nums">{row.rowNum}</td>
                <td className="px-3 py-2">
                  {row.errors.length > 0
                    ? <span title={row.errors.join("; ")}><XCircle className="h-3.5 w-3.5 text-danger" /></span>
                    : <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                </td>
                {headers.slice(0, 6).map(h => (
                  <td key={h} className={`px-3 py-2 max-w-[140px] truncate
                    ${row.errors.some(e => e.startsWith(h)) ? "text-danger font-medium" : "text-ink dark:text-dark-text"}`}>
                    {row.data[h] || <span className="text-slate/40 italic">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errCount > 0 && (
        <div className="rounded-lg bg-warn-bg border border-warn/20 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" />
          <p className="text-xs text-warn leading-relaxed">
            {errCount} row{errCount !== 1 ? "s have" : " has"} validation issues.
            You can still submit — errored rows will be skipped and logged.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Column hints panel
// ─────────────────────────────────────────────────────────────────────────────

function ColumnHints({ def }: { def: ImportTypeDef }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-dark-bg border border-line dark:border-dark-border px-4 py-3 space-y-2 mt-3">
      <p className="text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide">Required columns</p>
      <div className="flex flex-wrap gap-1.5">
        {def.requiredCols.map(c => (
          <span key={c} className="inline-flex rounded-md bg-danger/10 border border-danger/20 text-danger text-[11px] font-mono px-2 py-0.5">{c}</span>
        ))}
      </div>
      {def.optionalCols.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide pt-1">Optional columns</p>
          <div className="flex flex-wrap gap-1.5">
            {def.optionalCols.map(c => (
              <span key={c} className="inline-flex rounded-md bg-slate-100 dark:bg-dark-surface text-slate dark:text-dark-muted text-[11px] font-mono px-2 py-0.5 border border-line dark:border-dark-border">{c}</span>
            ))}
          </div>
        </>
      )}
      {def.note && (
        <div className="flex items-start gap-1.5 pt-1">
          <Info className="h-3.5 w-3.5 text-teal shrink-0 mt-0.5" />
          <p className="text-[11px] text-teal leading-snug">{def.note}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Result screen after processing
// ─────────────────────────────────────────────────────────────────────────────

function ProcessResult({
  job, result, onReset,
}: {
  job:     ImportJob;
  result:  { succeeded: number; failed: number; errors: RowError[] };
  onReset: () => void;
}) {
  const [showErrors, setShowErrors] = useState(false);
  const allGood = result.failed === 0;

  function downloadErrors() {
    const blob = new Blob([JSON.stringify(result.errors, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${job.fileName}-errors.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col items-center gap-5 py-10 animate-fade-in">
      <div className={`flex items-center justify-center h-16 w-16 rounded-full ${allGood ? "bg-success-bg" : "bg-warn-bg"}`}>
        {allGood
          ? <CheckCircle2 className="h-8 w-8 text-success" strokeWidth={2} />
          : <AlertTriangle className="h-8 w-8 text-warn" strokeWidth={2} />}
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-ink dark:text-dark-text">
          {allGood ? "Import complete" : "Import finished with errors"}
        </p>
        <p className="text-sm text-slate dark:text-dark-muted mt-1">
          {TYPE_LABEL[job.type] ?? job.type} · {job.fileName}
        </p>
      </div>
      {/* Stats */}
      <div className="flex items-center gap-6 rounded-xl border border-line dark:border-dark-border bg-paper dark:bg-dark-bg px-6 py-4 text-sm">
        <div className="text-center">
          <p className="text-2xl font-bold text-success">{result.succeeded}</p>
          <p className="text-xs text-slate dark:text-dark-muted mt-0.5">Succeeded</p>
        </div>
        <div className="h-8 w-px bg-line dark:bg-dark-border" />
        <div className="text-center">
          <p className={`text-2xl font-bold ${result.failed > 0 ? "text-danger" : "text-slate dark:text-dark-muted"}`}>{result.failed}</p>
          <p className="text-xs text-slate dark:text-dark-muted mt-0.5">Failed rows</p>
        </div>
        <div className="h-8 w-px bg-line dark:bg-dark-border" />
        <div className="text-center">
          <p className="text-2xl font-bold text-ink dark:text-dark-text">{result.succeeded + result.failed}</p>
          <p className="text-xs text-slate dark:text-dark-muted mt-0.5">Total rows</p>
        </div>
      </div>
      {/* Error accordion */}
      {result.errors.length > 0 && (
        <div className="w-full max-w-xl space-y-2">
          <button type="button" onClick={() => setShowErrors(v => !v)}
            className="w-full flex items-center justify-between rounded-xl border border-danger/30 bg-danger-bg/40 px-4 py-3 text-sm font-medium text-danger">
            <span className="flex items-center gap-2"><XCircle className="h-4 w-4" />{result.errors.length} row error{result.errors.length !== 1 ? "s" : ""}</span>
            {showErrors ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showErrors && (
            <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden max-h-64 overflow-y-auto">
              <table className="min-w-full divide-y divide-line dark:divide-dark-border text-xs">
                <thead className="sticky top-0 bg-slate-50/95 dark:bg-dark-surface">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate uppercase tracking-wide w-12">Row</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate uppercase tracking-wide w-28">Field</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate uppercase tracking-wide">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
                  {result.errors.map((e, idx) => (
                    <tr key={idx} className="hover:bg-danger-bg/20">
                      <td className="px-3 py-2 tabular-nums text-slate">{e.row || "—"}</td>
                      <td className="px-3 py-2 font-mono text-danger">{e.field}</td>
                      <td className="px-3 py-2 text-ink dark:text-dark-text">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        {result.errors.length > 0 && (
          <button type="button" onClick={downloadErrors} className={secondaryButtonClass}>
            <Download className="h-4 w-4" /> Download error report
          </button>
        )}
        <button type="button" onClick={onReset} className={primaryButtonClass}>Start another import</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step badge
// ─────────────────────────────────────────────────────────────────────────────

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex items-center justify-center h-6 w-6 rounded-full bg-teal text-white text-xs font-bold shrink-0">{n}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section + type selector
// ─────────────────────────────────────────────────────────────────────────────

function TypeSelector({
  value, onChange,
}: {
  value:    string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="space-y-4">
      {SECTIONS.map((section, si) => (
        <div key={section.id} className="space-y-2">
          {/* Section header */}
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-slate-200 dark:bg-dark-border text-slate dark:text-dark-muted text-[10px] font-bold shrink-0">
              {si + 1}
            </span>
            <p className="text-xs font-bold text-ink dark:text-dark-text uppercase tracking-wide">{section.title.replace(/^Section \d — /, "")}</p>
            <div className="flex-1 h-px bg-line dark:bg-dark-border" />
          </div>
          {/* Section hint */}
          <p className="text-[11px] text-slate dark:text-dark-muted pl-7 flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 text-warn shrink-0 mt-0.5" />{section.hint}
          </p>
          {/* Type cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-4">
            {section.types.map(def => {
              const Icon     = def.icon;
              const selected = value === def.key;
              return (
                <button key={def.key} type="button" onClick={() => onChange(def.key)}
                  className={`relative flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-all
                    ${selected
                      ? "border-teal bg-teal-50/60 dark:bg-teal/5 shadow-sm"
                      : "border-line dark:border-dark-border hover:border-teal/40 hover:bg-slate-50 dark:hover:bg-dark-border/20"
                    }`}>
                  <div className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${def.iconClass}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${selected ? "text-teal" : "text-ink dark:text-dark-text"}`}>{def.label}</p>
                    <p className="text-[11px] text-slate dark:text-dark-muted leading-tight mt-0.5 line-clamp-2">{def.description}</p>
                  </div>
                  {selected && (
                    <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-teal">
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New Import tab
// ─────────────────────────────────────────────────────────────────────────────

function NewImportTab() {
  const [schools,    setSchools]    = useState<SchoolOption[]>([]);
  const [schoolId,   setSchoolId]   = useState("");
  const [importType, setImportType] = useState<string>("DEPARTMENTS");
  const [file,       setFile]       = useState<File | null>(null);
  const [preview,    setPreview]    = useState<{ headers: string[]; rows: ParsedRow[]; totalCount: number } | null>(null);
  const [parsing,    setParsing]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<"uploading" | "processing" | null>(null);
  const [uploadPct,  setUploadPct]  = useState(0);
  const [apiError,   setApiError]   = useState<string | null>(null);
  const [doneJob,    setDoneJob]    = useState<ImportJob | null>(null);
  const [doneResult, setDoneResult] = useState<{ succeeded: number; failed: number; errors: RowError[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const typeDef = TYPE_BY_KEY.get(importType) ?? ALL_TYPES[0];

  useEffect(() => {
    fetch("/api/super-admin/schools?limit=200")
      .then(r => r.json())
      .then(j => setSchools((j.schools ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))));
  }, []);

  // Re-parse when import type changes (required columns differ)
  useEffect(() => {
    if (!file) return;
    setParsing(true);
    file.text().then(text => {
      setPreview(parseCSV(text, typeDef.requiredCols));
      setParsing(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importType]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f); setParsing(true); setPreview(null);
    try { setPreview(parseCSV(await f.text(), typeDef.requiredCols)); }
    catch { setPreview({ headers: [], rows: [], totalCount: 0 }); }
    finally { setParsing(false); }
  }

  async function handleSubmit() {
    if (!schoolId || !file) return;
    setSubmitting(true); setApiError(null); setUploadPct(0); setSubmitPhase("uploading");
    try {
      // Step 1 — create the job record
      const createRes = await fetch("/api/super-admin/imports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ schoolId, type: importType, fileName: file.name, totalRows: preview?.totalCount ?? 0 }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) throw new Error(createJson.error ?? "Failed to create import job");

      // Step 2 — upload + process with real upload-progress tracking via XHR
      const form = new FormData();
      form.append("jobId", createJson.job.id);
      form.append("file",  file);

      const processJson = await new Promise<{ succeeded: number; failed: number; errors: RowError[]; error?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/super-admin/imports/process");

        // Track upload progress (bytes sent to server)
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
        });
        xhr.upload.addEventListener("load", () => {
          // Upload finished — server is now processing
          setUploadPct(100);
          setSubmitPhase("processing");
        });

        xhr.addEventListener("load", () => {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error("Invalid server response")); }
        });
        xhr.addEventListener("error",  () => reject(new Error("Network error — check your connection and try again")));
        xhr.addEventListener("abort",  () => reject(new Error("Upload cancelled")));
        xhr.send(form);
      });

      if ("error" in processJson && processJson.error) throw new Error(processJson.error);

      setDoneJob(createJson.job);
      setDoneResult({ succeeded: processJson.succeeded, failed: processJson.failed, errors: processJson.errors ?? [] });
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
      setSubmitPhase(null);
      setUploadPct(0);
    }
  }

  function handleReset() {
    setDoneJob(null); setDoneResult(null);
    setFile(null); setPreview(null); setSchoolId(""); setApiError(null);
    setSubmitPhase(null); setUploadPct(0);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (doneJob && doneResult) return <ProcessResult job={doneJob} result={doneResult} onReset={handleReset} />;

  return (
    <div className="space-y-6 max-w-2xl">
      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Step 1 — School */}
      <Card className="dark:bg-dark-surface dark:border-dark-border">
        <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-line dark:border-dark-border">
          <StepBadge n={1} /><h3 className="text-sm font-semibold text-ink dark:text-dark-text">Select School</h3>
        </div>
        <label className={labelClass}>School <span className="text-danger">*</span></label>
        <select value={schoolId} onChange={e => setSchoolId(e.target.value)}
          className="w-full rounded-lg border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                     px-3.5 py-2.5 text-sm text-ink dark:text-dark-text focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15">
          <option value="">Choose a school…</option>
          {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Card>

      {/* Step 2 — Import type */}
      <Card className="dark:bg-dark-surface dark:border-dark-border">
        <div className="flex items-center gap-2.5 mb-5 pb-3.5 border-b border-line dark:border-dark-border">
          <StepBadge n={2} /><h3 className="text-sm font-semibold text-ink dark:text-dark-text">Import Type</h3>
        </div>
        <TypeSelector value={importType} onChange={key => { setImportType(key); setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }} />
        <ColumnHints def={typeDef} />
      </Card>

      {/* Step 3 — File upload */}
      <Card className="dark:bg-dark-surface dark:border-dark-border">
        <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-line dark:border-dark-border">
          <StepBadge n={3} /><h3 className="text-sm font-semibold text-ink dark:text-dark-text">Upload File</h3>
        </div>
        <div className="space-y-3">
          {/* Template download */}
          <div className="flex items-center gap-2 text-xs text-slate dark:text-dark-muted flex-wrap">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            Download template for <strong>{typeDef.label}</strong>:
            <a href={`/templates/${typeDef.template}`} download
              className="text-teal font-medium hover:underline flex items-center gap-0.5">
              <Download className="h-3 w-3" /> {typeDef.template}
            </a>
          </div>
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileChange({ target: { files: [f] } } as unknown as React.ChangeEvent<HTMLInputElement>); }}
            className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
                       border-line dark:border-dark-border bg-paper dark:bg-dark-bg py-10 px-6
                       cursor-pointer hover:border-teal/40 hover:bg-teal-50/30 transition-colors"
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={handleFileChange} />
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-teal-50">
              <Upload className="h-6 w-6 text-teal" strokeWidth={1.8} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-ink dark:text-dark-text">{file ? file.name : "Drop your file here or click to browse"}</p>
              <p className="text-xs text-slate dark:text-dark-muted mt-1">CSV · max 50 MB · no row limit</p>
            </div>
            {file && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg border border-success/20 text-success text-xs font-medium px-2.5 py-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> {file.name}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Step 4 — Preview */}
      {(parsing || preview) && (
        <Card className="dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-line dark:border-dark-border">
            <StepBadge n={4} /><h3 className="text-sm font-semibold text-ink dark:text-dark-text">Validation Preview</h3>
          </div>
          {parsing
            ? <div className="flex items-center gap-2 text-sm text-slate"><Spinner size="sm" /> Parsing…</div>
            : preview && <ValidationPreview headers={preview.headers} rows={preview.rows} totalCount={preview.totalCount} />}
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 pt-2">
        {/* Progress bar — shown while uploading or processing */}
        {submitting && (
          <div className="rounded-xl border border-line dark:border-dark-border bg-paper dark:bg-dark-bg px-5 py-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium text-ink dark:text-dark-text">
                <Spinner size="sm" />
                {submitPhase === "uploading"
                  ? uploadPct < 100 ? `Uploading… ${uploadPct}%` : "Upload complete"
                  : "Processing rows on server…"}
              </span>
              {submitPhase === "uploading" && (
                <span className="text-xs text-slate dark:text-dark-muted tabular-nums">{uploadPct}%</span>
              )}
            </div>
            {submitPhase === "uploading" && (
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-dark-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-teal transition-all duration-200"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
            )}
            {submitPhase === "processing" && (
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-dark-border overflow-hidden">
                <div className="h-full rounded-full bg-teal animate-pulse w-full" />
              </div>
            )}
            <p className="text-xs text-slate dark:text-dark-muted">
              {submitPhase === "processing"
                ? "Large files may take a minute — please keep this tab open."
                : "Uploading your file…"}
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
            className={secondaryButtonClass} disabled={!file || submitting}>Clear</button>
          <button type="button" onClick={handleSubmit} disabled={!schoolId || !file || submitting} className={primaryButtonClass}>
            {submitting ? <><Spinner size="sm" /> {submitPhase === "processing" ? "Processing…" : "Uploading…"}</> : <><Upload className="h-4 w-4" /> Import {typeDef.label}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// History tab
// ─────────────────────────────────────────────────────────────────────────────

function HistoryTab() {
  const [jobs,         setJobs]         = useState<ImportJob[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [loading,      setLoading]      = useState(true);
  const [apiError,     setApiError]     = useState<string | null>(null);
  const [fStatus,      setFStatus]      = useState("");
  const [rollbackBusy, setRollbackBusy] = useState<string | null>(null);
  const [rollbackMsg,  setRollbackMsg]  = useState<string | null>(null);

  const load = useCallback(async (pg = 1) => {
    setLoading(true); setApiError(null);
    try {
      const p = new URLSearchParams({ page: String(pg) });
      if (fStatus) p.set("status", fStatus);
      const res = await fetch(`/api/super-admin/imports?${p}`);
      if (!res.ok) throw new Error("Failed to load imports");
      const j = await res.json();
      setJobs(j.jobs ?? []); setTotal(j.total ?? 0); setPage(pg);
    } catch (e) { setApiError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [fStatus]);

  useEffect(() => { load(1); }, [load]);

  async function handleRollback(jobId: string) {
    setRollbackBusy(jobId); setApiError(null);
    try {
      const res = await fetch(`/api/super-admin/imports/${jobId}/rollback`, { method: "POST" });
      const j   = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Rollback failed");
      setRollbackMsg(`Import ${jobId.slice(0, 8)}… rolled back`);
      setTimeout(() => setRollbackMsg(null), 3000);
      await load(page);
    } catch (e) { setApiError(e instanceof Error ? e.message : String(e)); }
    finally { setRollbackBusy(null); }
  }

  function canRollback(job: ImportJob) {
    return job.status === "COMPLETED" && !!job.rollbackAt && new Date() < new Date(job.rollbackAt);
  }
  function downloadErrorReport(job: ImportJob) {
    if (!job.errorReport) return;
    const blob = new Blob([JSON.stringify(job.errorReport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `${job.fileName}-errors.json`; a.click(); URL.revokeObjectURL(url);
  }

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-5">
      {apiError    && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}
      {rollbackMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-success-bg border border-success/20 text-success text-sm px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {rollbackMsg}
        </div>
      )}
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          className="rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                     px-3.5 py-2.5 text-sm text-ink dark:text-dark-text focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 shadow-xs">
          <option value="">All statuses</option>
          {["QUEUED","PROCESSING","COMPLETED","FAILED","ROLLED_BACK"].map(s => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button type="button" onClick={() => load(1)} className={`${secondaryButtonClass} shrink-0`}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>
      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-2 text-slate dark:text-dark-muted rounded-xl border border-dashed border-line dark:border-dark-border">
          <History className="h-8 w-8 opacity-40" /><p className="text-sm">No imports yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line dark:divide-dark-border">
              <thead className="bg-slate-50/80 dark:bg-dark-surface text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3.5 text-left">School</th>
                  <th className="px-5 py-3.5 text-left hidden sm:table-cell">Type</th>
                  <th className="px-5 py-3.5 text-left">File</th>
                  <th className="px-5 py-3.5 text-left hidden md:table-cell">Rows</th>
                  <th className="px-5 py-3.5 text-left">Status</th>
                  <th className="px-5 py-3.5 text-right hidden lg:table-cell">Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
                {jobs.map(job => {
                  const busy      = rollbackBusy === job.id;
                  const rollback  = canRollback(job);
                  const hasErrors = Boolean(job.errorReport) && job.failed > 0;
                  return (
                    <tr key={job.id} className={`transition-colors hover:bg-slate-50/50 dark:hover:bg-dark-border/30 ${busy ? "opacity-50 pointer-events-none" : ""}`}>
                      <td className="px-5 py-3.5"><p className="text-sm font-medium text-ink dark:text-dark-text truncate max-w-[160px]">{job.school?.name ?? "—"}</p></td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <Badge variant="teal">{TYPE_LABEL[job.type] ?? job.type}</Badge>
                      </td>
                      <td className="px-5 py-3.5"><p className="text-sm text-ink dark:text-dark-text font-mono truncate max-w-[180px]">{job.fileName}</p></td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <div className="text-xs text-slate dark:text-dark-muted space-y-0.5">
                          <p>{job.totalRows} total</p>
                          <p className="text-success">{job.succeeded} ok</p>
                          {job.failed > 0 && <p className="text-danger">{job.failed} failed</p>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><StatusBadge status={job.status} /></td>
                      <td className="px-5 py-3.5 hidden lg:table-cell text-xs text-slate dark:text-dark-muted text-right whitespace-nowrap">
                        {new Date(job.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 justify-end">
                          {hasErrors && (
                            <button type="button" onClick={() => downloadErrorReport(job)} title="Download error report"
                              className="flex items-center justify-center h-8 w-8 rounded-lg text-slate hover:bg-slate-100 dark:hover:bg-dark-border transition-colors">
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {rollback && (
                            <button type="button" onClick={() => handleRollback(job.id)} disabled={busy} title="Rollback"
                              className="flex items-center justify-center h-8 w-8 rounded-lg text-danger hover:bg-danger-bg transition-colors">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {job.rollbackAt && job.status === "COMPLETED" && !rollback && (
                            <span className="text-[10px] text-slate dark:text-dark-muted italic whitespace-nowrap">Window expired</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate dark:text-dark-muted">Page {page} of {totalPages} · {total} imports</p>
          <div className="flex gap-2">
            <button onClick={() => load(page - 1)} disabled={page <= 1 || loading} className={secondaryButtonClass}>Previous</button>
            <button onClick={() => load(page + 1)} disabled={page >= totalPages || loading} className={secondaryButtonClass}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ImportsPage() {
  const [tab, setTab] = useState<TabId>("new");
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Import Dashboard"
        description="Bulk-import your entire school — departments, classes, subjects, staff, students, parents, and dormitory allocations."
      />
      <div className="border-b border-line dark:border-dark-border flex gap-0">
        {([
          { id: "new"     as TabId, label: "New Import",     Icon: Upload  },
          { id: "history" as TabId, label: "Import History", Icon: History },
        ] as const).map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px
              ${tab === id ? "border-teal text-teal" : "border-transparent text-slate hover:text-ink dark:text-dark-muted dark:hover:text-dark-text"}`}>
            <Icon className="h-4 w-4 shrink-0" /> {label}
          </button>
        ))}
      </div>
      {tab === "new"     && <NewImportTab />}
      {tab === "history" && <HistoryTab  />}
    </div>
  );
}
