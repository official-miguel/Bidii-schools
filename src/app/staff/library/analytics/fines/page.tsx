"use client";
import { useCallback, useEffect, useState } from "react";
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  KpiCard, Section, ChartCard, TrendBarChart,
  RankRow, WindowSelector, AnalyticsSkeleton, CHART_COLORS, exportToCSV,
} from "../_shared";
import { secondaryButtonClass } from "@/components/ui";

interface FinesData {
  fines: {
    totalGenerated: number; outstanding: number; paid: number; waived: number;
    trend: { month: string; charged: number; collected: number }[];
    topStudents: { studentId: string; fullName: string; admissionNumber: string; className: string; fineBalance: number }[];
  };
}

const cur = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FineAnalyticsPage() {
  const [data, setData]   = useState<FinesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays]   = useState("90");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/library/analytics/executive?days=${days}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const trendData = (data?.fines.trend ?? []).map(r => ({
    name: r.month, charged: r.charged, collected: r.collected,
  }));

  const collectionRate = data
    ? data.fines.totalGenerated > 0
      ? Math.round((data.fines.paid / data.fines.totalGenerated) * 100)
      : 0
    : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-dark-text">Fine Analytics</h1>
          <p className="text-sm text-slate mt-0.5">Fine generation, collection rates, and top debtors.</p>
        </div>
        <WindowSelector value={days} onChange={setDays} />
      </div>

      {loading ? <AnalyticsSkeleton rows={6} /> : data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <KpiCard label="Total Generated" value={cur(data.fines.totalGenerated)} icon={<DollarSign className="h-5 w-5" />} />
            <KpiCard label="Outstanding"     value={cur(data.fines.outstanding)}     icon={<AlertTriangle className="h-5 w-5" />} variant={data.fines.outstanding > 0 ? "danger" : "default"} />
            <KpiCard label="Collected"       value={cur(data.fines.paid)}            icon={<CheckCircle2 className="h-5 w-5" />} variant="success" />
            <KpiCard label="Collection Rate" value={collectionRate != null ? `${collectionRate}%` : "—"} icon={<TrendingUp className="h-5 w-5" />} variant={collectionRate != null && collectionRate < 50 ? "warn" : "success"} />
          </div>

          <Section title="Monthly Fine Trend">
            <ChartCard title="">
              <TrendBarChart
                data={trendData}
                bars={[
                  { key: "charged",   color: CHART_COLORS.danger,  label: "Charged (KES)" },
                  { key: "collected", color: CHART_COLORS.success,  label: "Collected (KES)" },
                ]}
                height={260}
              />
            </ChartCard>
          </Section>

          <Section title="Students with Highest Outstanding Fines"
            action={
              <button className={secondaryButtonClass + " text-xs"} onClick={() => exportToCSV(data.fines.topStudents.map(s => ({ name: s.fullName, admissionNumber: s.admissionNumber, class: s.className, fineBalance: s.fineBalance })), "fine-debtors.csv")}>
                Export CSV
              </button>
            }>
            {data.fines.topStudents.length === 0
              ? <p className="text-sm text-slate py-8 text-center">No outstanding fines — all clear!</p>
              : (
                <div className="rounded-xl border border-line bg-white overflow-hidden">
                  {data.fines.topStudents.map((s, i) => (
                    <RankRow key={s.studentId} rank={i+1} primary={s.fullName}
                      secondary={`${s.admissionNumber} · ${s.className}`}
                      value={cur(s.fineBalance)} valueLabel="outstanding"
                      highlight={s.fineBalance > 500} />
                  ))}
                </div>
              )}
          </Section>

          {data.fines.waived > 0 && (
            <div className="rounded-xl border border-teal/20 bg-teal-50/30 p-4 mt-4">
              <p className="text-sm font-medium text-teal">
                Waived fines: <strong>{cur(data.fines.waived)}</strong> cleared via manual override.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
