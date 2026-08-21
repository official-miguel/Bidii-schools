"use client";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, AlertTriangle, RefreshCw, Archive } from "lucide-react";
import Link from "next/link";
import {
  KpiCard, Section, ChartCard, DonutChart,
  TrendBarChart, RankRow, WindowSelector, AnalyticsSkeleton,
  CHART_COLORS, CONDITION_COLORS, exportToCSV,
} from "../_shared";
import { secondaryButtonClass } from "@/components/ui";

interface BooksData {
  window: { days: number };
  kpis: { totalTitles: number; totalCopies: number; neverBorrowed: number; overdue: number; lost: number; damaged: number };
  books: {
    popular:      { id: string; title: string; subject: string | null; borrowCount: number }[];
    leastUsed:    { id: string; title: string; subject: string | null; category: string }[];
    mostOverdue:  { id: string; title: string; overdueCount: number; maxDaysOverdue: number }[];
    conditionDist:{ condition: string; count: number }[];
  };
}

export default function BookAnalyticsPage() {
  const [data, setData]   = useState<BooksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays]   = useState("90");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/library/analytics/executive?days=${days}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const condData = (data?.books.conditionDist ?? []).map(r => ({
    name: r.condition, value: r.count, color: CONDITION_COLORS[r.condition] ?? CHART_COLORS.slate,
  }));

  const popularBarData = (data?.books.popular ?? []).slice(0, 10).map(r => ({
    name: r.title.length > 20 ? r.title.slice(0, 20) + "…" : r.title,
    value: r.borrowCount,
  }));

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-dark-text">Book Analytics</h1>
          <p className="text-sm text-slate mt-0.5">Popular books, overdue titles, condition analysis and recommendations.</p>
        </div>
        <WindowSelector value={days} onChange={setDays} />
      </div>

      {loading ? <AnalyticsSkeleton rows={8} /> : data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            <KpiCard label="Titles"         value={data.kpis.totalTitles.toLocaleString()}  icon={<BookOpen className="h-5 w-5" />} />
            <KpiCard label="Copies"         value={data.kpis.totalCopies.toLocaleString()}  icon={<BookOpen className="h-5 w-5" />} />
            <KpiCard label="Never Borrowed" value={data.kpis.neverBorrowed.toLocaleString()} icon={<Archive className="h-5 w-5" />} variant={data.kpis.neverBorrowed > 10 ? "warn" : "default"} />
            <KpiCard label="Overdue"        value={data.kpis.overdue.toLocaleString()}       icon={<AlertTriangle className="h-5 w-5" />} variant={data.kpis.overdue > 0 ? "danger" : "default"} />
            <KpiCard label="Lost"           value={data.kpis.lost.toLocaleString()}           icon={<AlertTriangle className="h-5 w-5" />} variant={data.kpis.lost > 0 ? "warn" : "default"} />
            <KpiCard label="Damaged"        value={data.kpis.damaged.toLocaleString()}        icon={<AlertTriangle className="h-5 w-5" />} variant={data.kpis.damaged > 0 ? "warn" : "default"} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            <Section title="Most Borrowed Books">
              <ChartCard title="">
                <TrendBarChart data={popularBarData} bars={[{ key: "value", color: CHART_COLORS.primary, label: "Borrows" }]} height={240} />
              </ChartCard>
            </Section>

            <Section title="Copy Condition Distribution">
              <ChartCard title="">
                <DonutChart data={condData} height={240} />
              </ChartCard>
            </Section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Section title="Most Borrowed (Ranked)"
              action={<button className={secondaryButtonClass + " text-xs"} onClick={() => exportToCSV(data.books.popular.map(b => ({ title: b.title, subject: b.subject ?? "", borrows: b.borrowCount })), "popular-books.csv")}>Export CSV</button>}>
              <div className="rounded-xl border border-line bg-white overflow-hidden">
                {data.books.popular.map((b, i) => (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-slate-50/40">
                    <span className="text-xs font-bold text-slate w-5">#{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <Link href={`/staff/library/inventory/${b.id}`} className="text-sm font-medium text-teal hover:underline truncate block">{b.title}</Link>
                      <p className="text-xs text-slate">{b.subject ?? "—"}</p>
                    </div>
                    <span className="text-sm font-bold text-ink">{b.borrowCount}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Most Overdue Books"
              action={<button className={secondaryButtonClass + " text-xs"} onClick={() => exportToCSV(data.books.mostOverdue.map(b => ({ title: b.title, overdueCount: b.overdueCount, maxDaysOverdue: b.maxDaysOverdue })), "overdue-books.csv")}>Export CSV</button>}>
              <div className="rounded-xl border border-line bg-white overflow-hidden">
                {data.books.mostOverdue.length === 0
                  ? <p className="text-sm text-slate px-4 py-6 text-center">No overdue books — great!</p>
                  : data.books.mostOverdue.map((b, i) => (
                    <RankRow key={b.id} rank={i+1} primary={b.title}
                      secondary={`Max ${b.maxDaysOverdue}d overdue`}
                      value={b.overdueCount} valueLabel="copies overdue"
                      highlight={b.maxDaysOverdue > 30} />
                  ))}
              </div>
            </Section>
          </div>

          <Section title="Never Borrowed Titles" description="These books have had no circulation activity in the selected period. Consider promoting or relocating them.">
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              {data.books.leastUsed.slice(0, 15).map((b, i) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-slate-50/40">
                  <span className="text-xs font-bold text-slate/50 w-5">#{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <Link href={`/staff/library/inventory/${b.id}`} className="text-sm font-medium text-ink hover:text-teal truncate block">{b.title}</Link>
                    <p className="text-xs text-slate">{[b.subject, b.category?.replace("_"," ")].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className="text-xs text-warn font-medium">Never borrowed</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Replacement recommendations */}
          {(data.kpis.lost > 0 || data.kpis.damaged > 0) && (
            <div className="mt-6 rounded-xl border border-warn/30 bg-warn-bg/20 p-4">
              <p className="text-sm font-semibold text-warn flex items-center gap-2 mb-2">
                <RefreshCw className="h-4 w-4" /> Replacement Recommendations
              </p>
              <ul className="space-y-1.5 text-sm text-ink">
                {data.kpis.lost    > 0 && <li>• <strong>{data.kpis.lost}</strong> copies reported lost — replacement orders recommended.</li>}
                {data.kpis.damaged > 0 && <li>• <strong>{data.kpis.damaged}</strong> damaged copies — assess for rebinding or replacement.</li>}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
