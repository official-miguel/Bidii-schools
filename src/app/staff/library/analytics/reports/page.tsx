"use client";

import { useCallback, useEffect, useState, useId } from "react";
import { Download, Printer, BarChart3, RefreshCw, Filter } from "lucide-react";
import {
  Section, ChartCard, TrendBarChart, RankRow,
  CHART_COLORS, exportToCSV, printSection,
} from "../_shared";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface ReportData {
  meta: { from: string; to: string; groupBy: string; classId?: string; subject?: string; category?: string };
  summary: { totalBorrows: number; totalReturns: number; uniqueBorrowers: number; totalFinesCharged: number; newBooksAdded: number };
  trends: {
    borrows:  { period: string; count: number }[];
    returns:  { period: string; count: number }[];
    overdue:  { period: string; count: number }[];
    fines:    { period: string; amount: number }[];
  };
  topBooks:    { id: string; title: string; subject: string | null; borrowCount: number }[];
  topStudents: { studentId: string; fullName: string; admissionNumber: string; className: string; count: number }[];
  topClasses:  { classId: string; className: string; form: number; count: number }[];
}

interface ClassOption { id: string; name: string; form: number }

// ── Helpers ────────────────────────────────────────────────────────────────

function isoToday() { return new Date().toISOString().slice(0, 10); }
function isoMonthsAgo(n: number) {
  const d = new Date(); d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

const cur = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

// ── Preset periods ─────────────────────────────────────────────────────────

const PRESETS = [
  { label: "This month",     from: isoMonthsAgo(0).slice(0,7) + "-01",  to: isoToday() },
  { label: "Last month",     from: isoMonthsAgo(1).slice(0,7) + "-01",  to: isoMonthsAgo(1).slice(0,7) + "-" + new Date(new Date().getFullYear(), new Date().getMonth(), 0).getDate() },
  { label: "Last 3 months",  from: isoMonthsAgo(3), to: isoToday() },
  { label: "Last 6 months",  from: isoMonthsAgo(6), to: isoToday() },
  { label: "This year",      from: new Date().getFullYear() + "-01-01", to: isoToday() },
];

// ── Main ───────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const printId = useId().replace(/:/g, "");
  const [from, setFrom]       = useState(isoMonthsAgo(3));
  const [to, setTo]           = useState(isoToday());
  const [groupBy, setGroupBy] = useState<"day"|"week"|"month">("month");
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [data, setData]       = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Load classes for filter
  useEffect(() => {
    fetch("/api/classes").then(r => r.ok ? r.json() : [])
      .then(d => setClasses(Array.isArray(d) ? d : (d.classes ?? [])))
      .catch(() => {});
  }, []);

  const generate = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ from, to, groupBy });
    if (classId)  sp.set("classId", classId);
    if (subject)  sp.set("subject", subject);
    if (category) sp.set("category", category);
    const res = await fetch(`/api/library/analytics/report?${sp}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [from, to, groupBy, classId, subject, category]);

  // Auto-generate on first load
  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const borrowTrend = data?.trends.borrows.map(r => ({ name: r.period, value: r.count })) ?? [];
  const returnTrend = data?.trends.returns.map(r => ({ name: r.period, value: r.count })) ?? [];
  const overdueTrend = data?.trends.overdue.map(r => ({ name: r.period, value: r.count })) ?? [];
  const fineTrend   = data?.trends.fines.map(r => ({ name: r.period, value: r.amount })) ?? [];

  // Unified trend data for combined chart
  const combinedTrend = (() => {
    const map = new Map<string, { name: string; borrows: number; returns: number }>();
    for (const r of borrowTrend)  { const e = map.get(r.name) ?? { name: r.name, borrows: 0, returns: 0 }; e.borrows  = r.value; map.set(r.name, e); }
    for (const r of returnTrend)  { const e = map.get(r.name) ?? { name: r.name, borrows: 0, returns: 0 }; e.returns  = r.value; map.set(r.name, e); }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();

  function doExportCSV() {
    if (!data) return;
    exportToCSV([
      { metric: "Total Borrows",       value: data.summary.totalBorrows },
      { metric: "Total Returns",       value: data.summary.totalReturns },
      { metric: "Unique Borrowers",    value: data.summary.uniqueBorrowers },
      { metric: "Fines Charged (KES)", value: data.summary.totalFinesCharged },
      { metric: "New Books Added",     value: data.summary.newBooksAdded },
    ], `library-report-${from}-${to}.csv`);
  }

  return (
    <div>

      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-dark-text">Library Reports</h1>
          <p className="text-sm text-slate mt-0.5">Filtered reports with date range, class, subject and category filters.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className={secondaryButtonClass} onClick={() => printSection(printId)}>
            <Printer className="h-4 w-4" /> Print
          </button>
          <button className={secondaryButtonClass} onClick={doExportCSV} disabled={!data}>
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* ── Filter panel ── */}
      <div className="rounded-xl border border-line bg-white p-5 mb-6 dark:bg-dark-surface dark:border-dark-border">
        <div className="flex flex-wrap items-end gap-4">
          {/* Quick presets */}
          <div>
            <label className={labelClass}>Quick period</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to); }}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${from === p.from && to === p.to ? "bg-teal text-white border-teal" : "border-line text-slate hover:border-teal/30 hover:text-teal"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom date range */}
          <div className="flex items-end gap-2">
            <div>
              <label className={labelClass}>From</label>
              <input type="date" className={inputClass + " w-36"} value={from} max={to} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>To</label>
              <input type="date" className={inputClass + " w-36"} value={to} min={from} max={isoToday()} onChange={e => setTo(e.target.value)} />
            </div>
          </div>

          {/* Group by */}
          <div>
            <label className={labelClass}>Group by</label>
            <select className={inputClass} value={groupBy} onChange={e => setGroupBy(e.target.value as typeof groupBy)}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>

          {/* Advanced filters toggle */}
          <button onClick={() => setShowFilters(v => !v)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${showFilters ? "border-teal/50 bg-teal-50 text-teal" : "border-line text-slate hover:text-ink"}`}>
            <Filter className="h-4 w-4" /> Filters
          </button>

          <button className={primaryButtonClass} disabled={loading} onClick={generate}>
            {loading ? <><RefreshCw className="h-4 w-4 animate-spin" />Generating…</> : <><BarChart3 className="h-4 w-4" />Generate Report</>}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-line animate-slide-down">
            <div>
              <label className={labelClass}>Class</label>
              <select className={inputClass} value={classId} onChange={e => setClassId(e.target.value)}>
                <option value="">All classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Subject</label>
              <input className={inputClass} placeholder="e.g. Mathematics" value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select className={inputClass} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {["TEXTBOOK","REFERENCE","FICTION","NON_FICTION","PERIODICAL","DICTIONARY","ATLAS","NOVEL","SCIENCE","MATHEMATICS","HUMANITIES","LANGUAGES","OTHER"].map(c => (
                  <option key={c} value={c}>{c.replace("_"," ")}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 gap-3 text-slate">
          <RefreshCw className="h-5 w-5 animate-spin" /> Generating report…
        </div>
      )}

      {!loading && data && (
        <div id={printId}>
          {/* Report header */}
          <div className="flex items-center justify-between gap-4 mb-6 p-4 rounded-xl border border-teal/20 bg-teal-50/30">
            <div>
              <p className="text-sm font-semibold text-teal">Report Period</p>
              <p className="text-sm text-ink">{new Date(data.meta.from).toLocaleDateString("en-KE",{day:"numeric",month:"long",year:"numeric"})} — {new Date(data.meta.to).toLocaleDateString("en-KE",{day:"numeric",month:"long",year:"numeric"})}</p>
              {(data.meta.classId || data.meta.subject || data.meta.category) && (
                <p className="text-xs text-slate mt-0.5">
                  Filters: {[data.meta.classId && "Class filtered", data.meta.subject, data.meta.category?.replace("_"," ")].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-slate">Generated</p>
              <p className="text-xs text-ink font-mono">{new Date().toLocaleString("en-KE")}</p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
            {[
              { label: "Total Borrows",    value: data.summary.totalBorrows.toLocaleString() },
              { label: "Total Returns",    value: data.summary.totalReturns.toLocaleString() },
              { label: "Unique Borrowers", value: data.summary.uniqueBorrowers.toLocaleString() },
              { label: "Fines Charged",    value: cur(data.summary.totalFinesCharged) },
              { label: "New Books Added",  value: data.summary.newBooksAdded.toLocaleString() },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-line bg-white p-4 dark:bg-dark-surface dark:border-dark-border">
                <p className="text-xl font-bold text-ink dark:text-dark-text">{s.value}</p>
                <p className="text-xs text-slate mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Trends */}
          <Section title="Borrowing & Return Trend">
            <ChartCard title="">
              <TrendBarChart
                data={combinedTrend}
                bars={[
                  { key: "borrows", color: CHART_COLORS.primary,   label: "Borrows" },
                  { key: "returns", color: CHART_COLORS.success,    label: "Returns" },
                ]}
                height={260}
              />
            </ChartCard>
          </Section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Section title="Overdue Trend">
              <ChartCard title="">
                <TrendBarChart data={overdueTrend} bars={[{ key: "value", color: CHART_COLORS.danger, label: "Overdue" }]} height={200} />
              </ChartCard>
            </Section>
            <Section title="Fines Generated (KES)">
              <ChartCard title="">
                <TrendBarChart data={fineTrend} bars={[{ key: "value", color: CHART_COLORS.warn, label: "KES" }]} height={200} />
              </ChartCard>
            </Section>
          </div>

          {/* Top tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
            <Section title="Top Books">
              <div className="rounded-xl border border-line bg-white overflow-hidden">
                {data.topBooks.slice(0, 10).map((b, i) => (
                  <RankRow key={b.id} rank={i+1} primary={b.title} secondary={b.subject ?? undefined} value={b.borrowCount} valueLabel="borrows" highlight={i===0} />
                ))}
                {data.topBooks.length === 0 && <p className="text-sm text-slate px-4 py-6 text-center">No data for period.</p>}
              </div>
            </Section>

            <Section title="Top Students">
              <div className="rounded-xl border border-line bg-white overflow-hidden">
                {data.topStudents.slice(0, 10).map((s, i) => (
                  <RankRow key={s.studentId} rank={i+1} primary={s.fullName} secondary={`${s.admissionNumber} · ${s.className}`} value={s.count} valueLabel="borrows" highlight={i===0} />
                ))}
                {data.topStudents.length === 0 && <p className="text-sm text-slate px-4 py-6 text-center">No data for period.</p>}
              </div>
              <button className={secondaryButtonClass + " mt-2 text-xs"} onClick={() => exportToCSV(data.topStudents.map(s => ({ name: s.fullName, admissionNumber: s.admissionNumber, class: s.className, borrows: s.count })), `top-students-${from}-${to}.csv`)}>
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </Section>

            <Section title="Top Classes">
              <div className="rounded-xl border border-line bg-white overflow-hidden">
                {data.topClasses.slice(0, 10).map((c, i) => (
                  <RankRow key={c.classId} rank={i+1} primary={c.className} secondary={`Form ${c.form}`} value={c.count} valueLabel="borrows" highlight={i===0} />
                ))}
                {data.topClasses.length === 0 && <p className="text-sm text-slate px-4 py-6 text-center">No data for period.</p>}
              </div>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
