"use client";
import { useCallback, useEffect, useState } from "react";
import { Package, DollarSign, AlertTriangle, BarChart3, RefreshCw } from "lucide-react";
import {
  KpiCard, Section, ChartCard, DonutChart, TrendBarChart,
  WindowSelector, AnalyticsSkeleton, CHART_COLORS, CONDITION_COLORS,
} from "../_shared";

interface InventoryData {
  kpis: { totalTitles: number; totalCopies: number; archived: number; lost: number; damaged: number; totalInventoryValue: number };
  books: { conditionDist: { condition: string; count: number }[] };
  borrowing: { subjectDist: { subject: string; count: number }[]; categoryDist: { category: string; count: number }[] };
}

const cur = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

export default function InventoryAnalyticsPage() {
  const [data, setData]   = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays]   = useState("365");

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

  const catBarData = (data?.borrowing.categoryDist ?? []).map(r => ({
    name: r.category.replace("_"," ").replace(/\b\w/g, l => l.toUpperCase()), value: r.count,
  }));

  const subjectBarData = (data?.borrowing.subjectDist ?? []).slice(0, 10).map(r => ({
    name: r.subject, value: r.count,
  }));

  const excellent = data?.books.conditionDist.find(c => c.condition === "EXCELLENT")?.count ?? 0;
  const good      = data?.books.conditionDist.find(c => c.condition === "GOOD")?.count ?? 0;
  const fair      = data?.books.conditionDist.find(c => c.condition === "FAIR")?.count ?? 0;
  const damaged   = data?.books.conditionDist.find(c => c.condition === "DAMAGED")?.count ?? 0;
  const total     = excellent + good + fair + damaged;
  const goodRate  = total > 0 ? Math.round(((excellent + good) / total) * 100) : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-dark-text">Inventory Analytics</h1>
          <p className="text-sm text-slate mt-0.5">Condition distribution, inventory value, and replacement recommendations.</p>
        </div>
        <WindowSelector value={days} onChange={setDays} />
      </div>

      {loading ? <AnalyticsSkeleton rows={6} /> : data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            <KpiCard label="Book Titles"    value={data.kpis.totalTitles.toLocaleString()}  icon={<BarChart3 className="h-5 w-5" />} />
            <KpiCard label="Total Copies"   value={data.kpis.totalCopies.toLocaleString()}  icon={<Package className="h-5 w-5" />} />
            <KpiCard label="Inventory Value" value={cur(data.kpis.totalInventoryValue)}      icon={<DollarSign className="h-5 w-5" />} />
            <KpiCard label="Good Condition" value={goodRate != null ? `${goodRate}%` : "—"} icon={<Package className="h-5 w-5" />} variant={goodRate != null && goodRate < 70 ? "warn" : "success"} />
            <KpiCard label="Archived"       value={data.kpis.archived.toLocaleString()}      icon={<Package className="h-5 w-5" />} />
            <KpiCard label="Lost"           value={data.kpis.lost.toLocaleString()}           icon={<AlertTriangle className="h-5 w-5" />} variant={data.kpis.lost > 0 ? "warn" : "default"} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Section title="Copy Condition Distribution">
              <ChartCard title="">
                <DonutChart data={condData} height={260} />
              </ChartCard>
            </Section>

            <Section title="Borrows by Category">
              <ChartCard title="">
                <TrendBarChart data={catBarData} bars={[{ key: "value", color: CHART_COLORS.primary, label: "Borrows" }]} height={260} />
              </ChartCard>
            </Section>
          </div>

          <Section title="Borrows by Subject (Top 10)">
            <ChartCard title="">
              <TrendBarChart data={subjectBarData} bars={[{ key: "value", color: CHART_COLORS.secondary, label: "Borrows" }]} height={220} />
            </ChartCard>
          </Section>

          {/* Condition breakdown table */}
          <Section title="Condition Breakdown">
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                  <th className="px-5 py-3">Condition</th>
                  <th className="px-5 py-3 text-right">Copies</th>
                  <th className="px-5 py-3 text-right">% of total</th>
                  <th className="px-5 py-3">Action</th>
                </tr></thead>
                <tbody>
                  {data.books.conditionDist.map(r => {
                    const pct = total > 0 ? ((r.count / total) * 100).toFixed(1) : "0.0";
                    const action = r.condition === "DAMAGED" ? "Schedule for repair or replacement"
                      : r.condition === "FAIR" ? "Monitor — rebind if deteriorating"
                      : r.condition === "LOST"  ? "Process replacement order"
                      : "No action required";
                    return (
                      <tr key={r.condition} className="border-b border-line last:border-0">
                        <td className="px-5 py-3 font-medium" style={{ color: CONDITION_COLORS[r.condition] }}>{r.condition}</td>
                        <td className="px-5 py-3 text-right font-bold text-ink">{r.count.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right text-slate">{pct}%</td>
                        <td className="px-5 py-3 text-slate text-xs">{action}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Repair/replacement recommendations */}
          {(damaged > 0 || data.kpis.lost > 0) && (
            <div className="mt-6 rounded-xl border border-warn/30 bg-warn-bg/20 p-4 space-y-2">
              <p className="text-sm font-semibold text-warn flex items-center gap-2"><RefreshCw className="h-4 w-4" />Action Required</p>
              {data.kpis.lost    > 0 && <p className="text-sm text-ink">• <strong>{data.kpis.lost}</strong> lost copies — submit replacement requisition.</p>}
              {damaged > 0           && <p className="text-sm text-ink">• <strong>{damaged}</strong> damaged copies — schedule maintenance or replacement.</p>}
              {fair    > 0           && <p className="text-sm text-ink">• <strong>{fair}</strong> copies in fair condition — monitor for further deterioration.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
