"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileText, BedDouble, Users,
  UserMinus, ArrowRight, Building2, BarChart2, Wrench,
  ChevronRight, Search,
} from "lucide-react";
import { PageHeader, ErrorBanner } from "@/components/ui";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";

const NAV_ITEMS = [
  { href: "/principal/accommodation/overview",      label: "Overview",    exact: true },
  { href: "/principal/accommodation/dormitories",  label: "Dormitories" },
  { href: "/principal/accommodation/allocations",  label: "Allocations" },
  { href: "/principal/accommodation/management",   label: "Management" },
  { href: "/principal/accommodation/analytics",    label: "Analytics" },
  { href: "/principal/accommodation/inspections",  label: "Inspections" },
  { href: "/principal/accommodation/reports",      label: "Reports" },
  { href: "/principal/accommodation/settings",     label: "Settings" },
];

type ReportType =
  | "occupancy" | "vacancy" | "students" | "movement"
  | "unallocated" | "boarding_population" | "maintenance";

interface ReportMeta {
  type: ReportType;
  label: string;
  description: string;
  icon: typeof FileText;
  color: string;
}

const REPORTS: ReportMeta[] = [
  { type: "occupancy",          label: "Occupancy Report",        description: "Capacity, occupancy rate, and availability for every dorm.",           icon: BedDouble,   color: "text-teal bg-teal/10" },
  { type: "vacancy",            label: "Vacancy Report",          description: "Active dorms with available spaces — useful for new admissions.",       icon: Building2,   color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20" },
  { type: "students",           label: "Students by Dorm",        description: "Full list of allocated students with dorm, cubicle, and bed details.",  icon: Users,       color: "text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-900/20" },
  { type: "boarding_population",label: "Boarding Population",     description: "Boarding vs day students per class, with percentages.",                 icon: BarChart2,   color: "text-success bg-success/10" },
  { type: "unallocated",        label: "Unallocated Students",    description: "All active students without a current accommodation assignment.",        icon: UserMinus,   color: "text-warn bg-warn/10" },
  { type: "movement",           label: "Movement History",        description: "Allocation, transfer, and vacation events in the selected date range.",  icon: ArrowRight,  color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20" },
  { type: "maintenance",        label: "Maintenance Status",      description: "Current status of all dorms including maintenance and closed dorms.",    icon: Wrench,      color: "text-slate bg-slate/10" },
];

// ── Column definitions per report type ───────────────────────────────────────

type ColDef = { key: string; label: string; fmt?: (v: unknown) => string };

const COLUMNS: Record<ReportType, ColDef[]> = {
  occupancy: [
    { key: "dormName",        label: "Dormitory" },
    { key: "genderPolicy",    label: "Gender",    fmt: (v) => ({ BOYS_ONLY:"Boys", GIRLS_ONLY:"Girls", MIXED:"Mixed" }[v as string] ?? String(v)) },
    { key: "status",          label: "Status",    fmt: (v) => String(v).replace("_"," ") },
    { key: "totalCapacity",   label: "Capacity" },
    { key: "occupied",        label: "Occupied" },
    { key: "available",       label: "Available" },
    { key: "occupancyPct",    label: "Occupancy %", fmt: (v) => `${v}%` },
    { key: "boardingMasterName", label: "Boarding Master", fmt: (v) => (v as string | null) ?? "—" },
  ],
  vacancy: [
    { key: "dormName",      label: "Dormitory" },
    { key: "genderPolicy",  label: "Gender",    fmt: (v) => ({ BOYS_ONLY:"Boys", GIRLS_ONLY:"Girls", MIXED:"Mixed" }[v as string] ?? String(v)) },
    { key: "totalCapacity", label: "Capacity" },
    { key: "occupied",      label: "Occupied" },
    { key: "available",     label: "Available" },
    { key: "permittedForms",label: "Forms",     fmt: (v) => (v as number[]).length ? (v as number[]).map((f) => `F${f}`).join(", ") : "All" },
  ],
  students: [
    { key: "studentName",    label: "Student" },
    { key: "admissionNumber",label: "Adm. No." },
    { key: "className",      label: "Class" },
    { key: "dormName",       label: "Dormitory" },
    { key: "cubicle",        label: "Cubicle",  fmt: (v) => (v as string | null) ?? "—" },
    { key: "bed",            label: "Bed",      fmt: (v) => (v as string | null) ?? "—" },
    { key: "position",       label: "Position", fmt: (v) => (v as string | null) ?? "—" },
    { key: "allocationDate", label: "Since",    fmt: (v) => new Date(v as string).toLocaleDateString() },
  ],
  boarding_population: [
    { key: "className",       label: "Class" },
    { key: "form",            label: "Form" },
    { key: "totalStudents",   label: "Total" },
    { key: "boardingStudents",label: "Boarding" },
    { key: "dayStudents",     label: "Day" },
    { key: "boardingPct",     label: "Boarding %", fmt: (v) => `${v}%` },
  ],
  unallocated: [
    { key: "studentName",    label: "Student" },
    { key: "admissionNumber",label: "Adm. No." },
    { key: "className",      label: "Class" },
    { key: "form",           label: "Form" },
  ],
  movement: [
    { key: "studentName",    label: "Student" },
    { key: "admissionNumber",label: "Adm. No." },
    { key: "dormName",       label: "Dormitory" },
    { key: "cubicle",        label: "Cubicle",   fmt: (v) => (v as string | null) ?? "—" },
    { key: "status",         label: "Status",    fmt: (v) => String(v) },
    { key: "allocationDate", label: "Date",      fmt: (v) => new Date(v as string).toLocaleDateString() },
    { key: "vacatedDate",    label: "Vacated",   fmt: (v) => v ? new Date(v as string).toLocaleDateString() : "—" },
    { key: "notes",          label: "Notes",     fmt: (v) => (v as string | null) ?? "—" },
    { key: "allocatedBy",    label: "By",        fmt: (v) => (v as string | null) ?? "—" },
  ],
  maintenance: [
    { key: "dormName",        label: "Dormitory" },
    { key: "status",          label: "Status",   fmt: (v) => String(v).replace("_"," ") },
    { key: "genderPolicy",    label: "Gender",   fmt: (v) => ({ BOYS_ONLY:"Boys", GIRLS_ONLY:"Girls", MIXED:"Mixed" }[v as string] ?? String(v)) },
    { key: "totalCapacity",   label: "Capacity" },
    { key: "currentOccupancy",label: "Occupied" },
    { key: "boardingMasterName", label: "Boarding Master", fmt: (v) => (v as string | null) ?? "—" },
    { key: "updatedAt",       label: "Updated",  fmt: (v) => new Date(v as string).toLocaleDateString() },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function exportCSV(rows: Record<string, unknown>[], cols: ColDef[], filename: string) {
  const header = cols.map((c) => `"${c.label}"`).join(",");
  const body = rows.map((row) =>
    cols.map((c) => {
      const raw = row[c.key];
      const val = c.fmt ? c.fmt(raw) : String(raw ?? "");
      return `"${val.replace(/"/g, '""')}"`;
    }).join(",")
  );
  const csv = [header, ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function printTable(rows: Record<string, unknown>[], cols: ColDef[], title: string) {
  const header = cols.map((c) => `<th style="padding:6px 10px;border:1px solid #ddd;background:#f5f5f5;font-size:11px;text-align:left">${c.label}</th>`).join("");
  const body = rows.map((row) =>
    `<tr>${cols.map((c) => {
      const raw = row[c.key];
      const val = c.fmt ? c.fmt(raw) : String(raw ?? "");
      return `<td style="padding:5px 10px;border:1px solid #eee;font-size:11px">${val}</td>`;
    }).join("")}</tr>`
  ).join("");
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title></head><body>
    <h2 style="font-family:sans-serif;font-size:16px;margin-bottom:12px">${title}</h2>
    <p style="font-family:sans-serif;font-size:11px;color:#666;margin-bottom:16px">Generated ${new Date().toLocaleString()}</p>
    <table style="border-collapse:collapse;width:100%;font-family:sans-serif"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ── ReportTypeCard ────────────────────────────────────────────────────────────
function ReportTypeCard({ meta, active, onClick }: {
  meta: ReportMeta; active: boolean; onClick: () => void;
}) {
  const Icon = meta.icon;
  return (
    <button onClick={onClick} type="button"
      className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
        active ? "border-teal bg-teal/5" : "border-border hover:border-teal/40"
      }`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 shrink-0 ${active ? "bg-teal/15" : meta.color.split(" ")[1]}`}>
          <Icon className={`h-4 w-4 ${active ? "text-teal" : meta.color.split(" ")[0]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm font-semibold truncate ${active ? "text-teal" : "text-foreground"}`}>
              {meta.label}
            </p>
            <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${active ? "text-teal rotate-90" : "text-slate/40"}`} />
          </div>
          <p className="text-xs text-slate mt-0.5 leading-relaxed">{meta.description}</p>
        </div>
      </div>
    </button>
  );
}

// ── Main reports page ─────────────────────────────────────────────────────────
export default function AccommodationReportsPage() {
  const [activeType, setActiveType]   = useState<ReportType>("occupancy");
  const [dorms, setDorms]             = useState<{ id: string; name: string }[]>([]);
  const [dormFilter, setDormFilter]   = useState("");
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState("");
  const [search, setSearch]           = useState("");
  const [rows, setRows]               = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/accommodation/dormitories")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setDorms(d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name }))));
  }, []);

  const loadReport = useCallback(async (type: ReportType) => {
    setLoading(true); setError(null); setRows([]);
    try {
      const params = new URLSearchParams({ type });
      if (dormFilter) params.set("dormId", dormFilter);
      if (dateFrom)   params.set("from", dateFrom);
      if (dateTo)     params.set("to", dateTo);
      const res = await fetch(`/api/accommodation/reports?${params}`);
      if (!res.ok) { setError("Failed to generate report."); return; }
      const json = await res.json();
      setRows(json.rows ?? []);
      setGeneratedAt(json.generatedAt ?? null);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }, [dormFilter, dateFrom, dateTo]);

  useEffect(() => { loadReport(activeType); }, [activeType, loadReport]);

  const cols = COLUMNS[activeType] ?? [];
  const filtered = rows.filter((row) => {
    if (!search) return true;
    return Object.values(row).some((v) =>
      String(v ?? "").toLowerCase().includes(search.toLowerCase())
    );
  });

  const activeMeta = REPORTS.find((r) => r.type === activeType)!;
  const filename = `accommodation-${activeType}-${new Date().toISOString().slice(0,10)}.csv`;

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />
      <PageHeader
        title="Accommodation Reports"
        description="Generate, filter, and export boarding reports across all dormitories."
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Left: report type list ─────────────────────────────────── */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0 space-y-2">
          <p className="text-xs font-semibold text-slate uppercase tracking-wide px-1 mb-3">Report type</p>
          {REPORTS.map((meta) => (
            <ReportTypeCard key={meta.type} meta={meta} active={activeType === meta.type}
              onClick={() => { setActiveType(meta.type); setSearch(""); }} />
          ))}
        </div>

        {/* ── Right: report output ───────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Report header */}
          <div className="rounded-xl border border-border bg-card p-4 mb-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base font-semibold text-foreground">{activeMeta.label}</h2>
                <p className="text-sm text-slate">{activeMeta.description}</p>
                {generatedAt && (
                  <p className="text-xs text-slate/60/60 mt-1">
                    Generated {new Date(generatedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <WorkspaceToolbar.ExportButton onClick={() => exportCSV(filtered, cols, filename)} />
                <WorkspaceToolbar.PrintButton onClick={() => printTable(filtered, cols, activeMeta.label)} />
                <WorkspaceToolbar.RefreshButton onClick={() => loadReport(activeType)} loading={loading} />
              </div>
            </div>

            {/* Filters */}
            <div className="mt-4 flex flex-wrap gap-3">
              <select value={dormFilter} onChange={(e) => { setDormFilter(e.target.value); }}
                className="text-xs border border-border rounded-lg px-2.5 py-2 bg-card">
                <option value="">All dorms</option>
                {dorms.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              {(activeType === "movement") && (
                <>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="text-xs border border-border rounded-lg px-2.5 py-2 bg-card"
                    aria-label="From date" />
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="text-xs border border-border rounded-lg px-2.5 py-2 bg-card"
                    aria-label="To date" />
                </>
              )}
            </div>
          </div>

          {/* Search within results */}
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate/50 pointer-events-none" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search results…"
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-slate-light focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 transition-colors" />
            </div>
            {!loading && (
              <span className="text-sm text-slate tabular-nums">
                {filtered.length} {filtered.length !== rows.length ? `/ ${rows.length}` : ""} row{filtered.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-line/40/40 animate-pulse" />)}
            </div>
          )}

          {/* Empty state */}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl border border-border">
              <FileText className="h-8 w-8 text-slate/40" />
              <p className="text-slate text-sm">No data for this report</p>
            </div>
          )}

          {/* Table */}
          {!loading && filtered.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-slate-50/80/30">
                      {cols.map((c) => (
                        <th key={c.key} className="px-4 py-3 text-left text-xs font-semibold text-slate uppercase tracking-wide whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 /60 bg-card">
                    {filtered.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/60/20 transition-colors">
                        {cols.map((c) => {
                          const raw = row[c.key];
                          const val = c.fmt ? c.fmt(raw) : String(raw ?? "—");
                          return (
                            <td key={c.key} className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                              {c.key === "occupancyPct" || c.key === "boardingPct" ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 rounded-full bg-line overflow-hidden">
                                    <div className={`h-full rounded-full ${(raw as number) >= 90 ? "bg-warn" : "bg-teal"}`}
                                      style={{ width: `${Math.min(raw as number, 100)}%` }} />
                                  </div>
                                  <span className="tabular-nums">{val}</span>
                                </div>
                              ) : c.key === "status" ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  val === "CURRENT" || val === "ACTIVE"       ? "text-success bg-success/10 border-success/20" :
                                  val === "UNDER MAINTENANCE"                 ? "text-warn bg-warn/10 border-warn/20" :
                                  val === "TRANSFERRED"                       ? "text-teal bg-teal/10 border-teal/20" :
                                  "text-slate bg-slate/10 border-border"
                                }`}>{val}</span>
                              ) : val}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
