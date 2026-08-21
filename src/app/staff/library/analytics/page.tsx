"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen, Package, Users, AlertTriangle, DollarSign,
  BarChart3, Archive, Clock, Activity,
} from "lucide-react";
import {
  KpiCard, Section, ChartCard, TrendLineChart,
  TrendBarChart, DonutChart, RankRow, WindowSelector, AnalyticsSkeleton,
  CHART_COLORS, CONDITION_COLORS, DOW_LABELS,
} from "./_shared";

// ── Types ──────────────────────────────────────────────────────────────────
interface ExecData {
  window: { days: number; since: string };
  kpis: {
    totalTitles: number; totalCopies: number; available: number; borrowed: number;
    reserved: number; lost: number; damaged: number; archived: number;
    overdue: number; activeBorrowers: number; neverBorrowed: number; totalInventoryValue: number;
  };
  borrowing: {
    trend:  { day: string; count: number }[];
    peakHours: { hour: number; count: number }[];
    peakDays:  { dow: number; count: number }[];
    avgDurationDays: number | null;
    returnCompliance: { total: number; onTime: number; rate: number | null } | null;
    topStudents: { studentId: string; fullName: string; admissionNumber: string; className: string; count: number }[];
    topClasses:  { classId: string; className: string; count: number }[];
    subjectDist: { subject: string; count: number }[];
  };
  books: {
    popular: { id: string; title: string; subject: string | null; borrowCount: number }[];
    conditionDist: { condition: string; count: number }[];
  };
  fines: { totalGenerated: number; outstanding: number; paid: number; waived: number };
  students: { activeBorrowers: number; neverBorrowed: number };
}

const fmt = (n: number) => n.toLocaleString();
const currency = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function LibraryAnalyticsPage() {
  const [data, setData]     = useState<ExecData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays]     = useState("90");
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/library/analytics/executive?days=${days}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setData(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load analytics."); }
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Chart transforms
  const trendData = data?.borrowing.trend.slice(-30).map(r => ({
    name: r.day.slice(5), value: r.count,
  })) ?? [];

  const hourData = data?.borrowing.peakHours.map(r => ({
    name: `${r.hour}:00`, value: r.count,
  })) ?? [];

  const dowData = data?.borrowing.peakDays.map(r => ({
    name: DOW_LABELS[r.dow], value: r.count,
  })) ?? [];

  const subjectData = (data?.borrowing.subjectDist ?? []).slice(0, 8).map(r => ({
    name: r.subject, value: r.count,
    color: Object.values(CHART_COLORS)[Math.abs(r.subject.charCodeAt(0)) % Object.values(CHART_COLORS).length],
  }));

  const conditionData = (data?.books.conditionDist ?? []).map(r => ({
    name: r.condition, value: r.count, color: CONDITION_COLORS[r.condition] ?? CHART_COLORS.slate,
  }));

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-dark-text">Library Analytics</h1>
          <p className="text-sm text-slate mt-0.5">Executive overview — KPIs, trends and insights.</p>
        </div>
        <WindowSelector value={days} onChange={setDays} />
      </div>

      {error && <div className="rounded-lg bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3 mb-6">{error}</div>}

      {/* ── KPI Grid ── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
          {[...Array(12)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-line/40 animate-pulse" />)}
        </div>
      ) : data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
          <KpiCard label="Book Titles"        value={fmt(data.kpis.totalTitles)}      icon={<BookOpen className="h-5 w-5" />} />
          <KpiCard label="Total Copies"       value={fmt(data.kpis.totalCopies)}      icon={<Package className="h-5 w-5" />} />
          <KpiCard label="Available"          value={fmt(data.kpis.available)}         icon={<BookOpen className="h-5 w-5" />} variant="success" />
          <KpiCard label="Currently Borrowed" value={fmt(data.kpis.borrowed)}          icon={<Users className="h-5 w-5" />}   variant="info" />
          <KpiCard label="Reserved"           value={fmt(data.kpis.reserved)}          icon={<Clock className="h-5 w-5" />}   variant="info" />
          <KpiCard label="Overdue"            value={fmt(data.kpis.overdue)}            icon={<AlertTriangle className="h-5 w-5" />} variant={data.kpis.overdue > 0 ? "danger" : "default"} />
          <KpiCard label="Lost Books"         value={fmt(data.kpis.lost)}              icon={<AlertTriangle className="h-5 w-5" />} variant={data.kpis.lost > 0 ? "warn" : "default"} />
          <KpiCard label="Damaged Books"      value={fmt(data.kpis.damaged)}           icon={<AlertTriangle className="h-5 w-5" />} variant={data.kpis.damaged > 0 ? "warn" : "default"} />
          <KpiCard label="Archived Copies"    value={fmt(data.kpis.archived)}          icon={<Archive className="h-5 w-5" />} />
          <KpiCard label="Active Borrowers"   value={fmt(data.kpis.activeBorrowers)}  icon={<Users className="h-5 w-5" />}   variant="success" />
          <KpiCard label="Never Borrowed Titles" value={fmt(data.kpis.neverBorrowed)} icon={<BarChart3 className="h-5 w-5" />} variant={data.kpis.neverBorrowed > 10 ? "warn" : "default"} />
          <KpiCard label="Inventory Value"    value={currency(data.kpis.totalInventoryValue)} icon={<DollarSign className="h-5 w-5" />} sub="total copy cost" />
        </div>
      )}

      {/* ── Summary metrics row ── */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Avg hold duration", value: data.borrowing.avgDurationDays != null ? `${data.borrowing.avgDurationDays}d` : "—" },
            { label: "Return compliance", value: data.borrowing.returnCompliance?.rate != null ? `${data.borrowing.returnCompliance.rate}%` : "—" },
            { label: "Fines outstanding", value: currency(data.fines.outstanding), hi: data.fines.outstanding > 0 },
            { label: "Fines collected",   value: currency(data.fines.paid) },
          ].map(m => (
            <div key={m.label} className={`rounded-xl border p-4 ${m.hi ? "border-danger/30 bg-danger-bg/20" : "border-line bg-white dark:bg-dark-surface dark:border-dark-border"}`}>
              <p className={`text-xl font-bold ${m.hi ? "text-danger" : "text-ink dark:text-dark-text"}`}>{m.value}</p>
              <p className="text-xs text-slate mt-1">{m.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading && <AnalyticsSkeleton rows={6} />}

      {!loading && data && (
        <>
          {/* ── Borrowing trend ── */}
          <Section title="Borrowing Trend" description={`Daily borrows over last ${days} days`}
            action={<Link href="/staff/library/analytics/borrowing" className="text-xs text-teal hover:underline">View full →</Link>}>
            <ChartCard title="">
              <TrendLineChart data={trendData} height={220} />
            </ChartCard>
          </Section>

          {/* ── Charts grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            <ChartCard title="Borrows by Hour of Day">
              <TrendBarChart data={hourData} bars={[{ key: "value", color: CHART_COLORS.primary }]} height={180} />
            </ChartCard>
            <ChartCard title="Borrows by Day of Week">
              <TrendBarChart data={dowData} bars={[{ key: "value", color: CHART_COLORS.secondary }]} height={180} />
            </ChartCard>
            <ChartCard title="By Subject">
              <DonutChart data={subjectData} height={180} />
            </ChartCard>
            <ChartCard title="Copy Condition Distribution">
              <DonutChart data={conditionData} height={180} />
            </ChartCard>
            <ChartCard title="Fine Breakdown" className="md:col-span-1">
              <DonutChart data={[
                { name: "Paid",      value: data.fines.paid,      color: CHART_COLORS.success },
                { name: "Outstanding", value: data.fines.outstanding, color: CHART_COLORS.danger },
                { name: "Waived",    value: data.fines.waived,    color: CHART_COLORS.slate },
              ]} height={180} />
            </ChartCard>
          </div>

          {/* ── Top performers ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Section title="Most Borrowed Books"
              action={<Link href="/staff/library/analytics/books" className="text-xs text-teal hover:underline">View all →</Link>}>
              <div className="rounded-xl border border-line bg-white overflow-hidden dark:bg-dark-surface dark:border-dark-border">
                {data.books.popular.slice(0, 8).map((b, i) => (
                  <RankRow key={b.id} rank={i + 1} primary={b.title}
                    secondary={b.subject ?? undefined} value={b.borrowCount} valueLabel="borrows"
                    highlight={i === 0} />
                ))}
              </div>
            </Section>

            <Section title="Most Active Students"
              action={<Link href="/staff/library/analytics/students" className="text-xs text-teal hover:underline">View all →</Link>}>
              <div className="rounded-xl border border-line bg-white overflow-hidden dark:bg-dark-surface dark:border-dark-border">
                {data.borrowing.topStudents.slice(0, 8).map((s, i) => (
                  <RankRow key={s.studentId} rank={i + 1} primary={s.fullName}
                    secondary={`${s.admissionNumber} · ${s.className}`}
                    value={s.count} valueLabel="borrows" highlight={i === 0} />
                ))}
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Section title="Top Borrowing Classes"
              action={<Link href="/staff/library/analytics/students" className="text-xs text-teal hover:underline">View all →</Link>}>
              <div className="rounded-xl border border-line bg-white overflow-hidden dark:bg-dark-surface dark:border-dark-border">
                {data.borrowing.topClasses.slice(0, 6).map((c, i) => (
                  <RankRow key={c.classId} rank={i + 1} primary={c.className}
                    value={c.count} valueLabel="borrows" />
                ))}
              </div>
            </Section>

            <Section title="Analytics Quick Links">
              <div className="grid grid-cols-1 gap-2">
                {[
                  { href: "/staff/library/analytics/borrowing", icon: <Activity className="h-5 w-5" />, label: "Borrowing Analytics", desc: "Trends, peak hours, top borrowers" },
                  { href: "/staff/library/analytics/books",     icon: <BookOpen className="h-5 w-5" />,  label: "Book Analytics",     desc: "Popular, overdue, condition" },
                  { href: "/staff/library/analytics/fines",     icon: <DollarSign className="h-5 w-5" />,label: "Fine Analytics",      desc: "Trends, top debtors" },
                  { href: "/staff/library/analytics/inventory", icon: <Package className="h-5 w-5" />,   label: "Inventory Analytics", desc: "Value, condition, replacement" },
                  { href: "/staff/library/analytics/reports",   icon: <BarChart3 className="h-5 w-5" />, label: "Reports",             desc: "Export PDF/CSV/print" },
                ].map(a => (
                  <Link key={a.href} href={a.href}
                    className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 hover:border-teal/40 hover:shadow-sm transition-all dark:bg-dark-surface dark:border-dark-border">
                    <div className="h-9 w-9 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">{a.icon}</div>
                    <div>
                      <p className="text-sm font-semibold text-ink dark:text-dark-text">{a.label}</p>
                      <p className="text-xs text-slate dark:text-dark-muted">{a.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
