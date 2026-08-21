"use client";
import { useCallback, useEffect, useState } from "react";
import { Users, Clock, BarChart3, TrendingUp } from "lucide-react";
import {
  KpiCard, Section, ChartCard, TrendLineChart,
  TrendBarChart, RankRow, WindowSelector, AnalyticsSkeleton,
  CHART_COLORS, DOW_LABELS, exportToCSV,
} from "../_shared";
import { secondaryButtonClass } from "@/components/ui";

interface BorrowData {
  window: { days: number };
  kpis: { activeBorrowers: number };
  borrowing: {
    trend: { day: string; count: number }[];
    peakHours: { hour: number; count: number }[];
    peakDays:  { dow: number; count: number }[];
    avgDurationDays: number | null;
    returnCompliance: { total: number; onTime: number; rate: number | null } | null;
    topStudents: { studentId: string; fullName: string; admissionNumber: string; className: string; count: number }[];
    topClasses:  { classId: string; className: string; count: number }[];
    topTeachers: { teacherId: string; fullName: string; count: number }[];
    subjectDist: { subject: string; count: number }[];
    categoryDist:{ category: string; count: number }[];
  };
}

export default function BorrowingAnalyticsPage() {
  const [data, setData]   = useState<BorrowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays]   = useState("90");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/library/analytics/executive?days=${days}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const trendData  = data?.borrowing.trend.map(r => ({ name: r.day.slice(5), value: r.count })) ?? [];
  const hourData   = data?.borrowing.peakHours.map(r => ({ name: `${r.hour}h`, value: r.count })) ?? [];
  const dowData    = data?.borrowing.peakDays.map(r => ({ name: DOW_LABELS[r.dow], value: r.count })) ?? [];
  const subjData   = (data?.borrowing.subjectDist ?? []).slice(0, 10).map(r => ({ name: r.subject, value: r.count }));

  const rc = data?.borrowing.returnCompliance;
  const compBar = rc ? [
    { name: "On time", value: rc.onTime },
    { name: "Late", value: rc.total - rc.onTime },
  ] : [];

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-dark-text">Borrowing Analytics</h1>
          <p className="text-sm text-slate mt-0.5">Trends, patterns, and top borrowers.</p>
        </div>
        <WindowSelector value={days} onChange={setDays} />
      </div>

      {loading ? <AnalyticsSkeleton rows={8} /> : data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <KpiCard label="Active Borrowers"   value={data.kpis.activeBorrowers}   icon={<Users className="h-5 w-5" />} variant="success" />
            <KpiCard label="Avg Hold (days)"     value={data.borrowing.avgDurationDays?.toFixed(1) ?? "—"} icon={<Clock className="h-5 w-5" />} />
            <KpiCard label="Return compliance"   value={rc?.rate != null ? `${rc.rate}%` : "—"} icon={<TrendingUp className="h-5 w-5" />} variant={rc?.rate != null && rc.rate < 80 ? "warn" : "success"} />
            <KpiCard label="Total borrows"       value={trendData.reduce((s,r)=>s+r.value,0).toLocaleString()} icon={<BarChart3 className="h-5 w-5" />} />
          </div>

          <Section title="Daily Borrowing Trend">
            <ChartCard title="">
              <TrendLineChart data={trendData} height={240} />
            </ChartCard>
          </Section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <ChartCard title="Peak Borrowing Hours">
              <TrendBarChart data={hourData} bars={[{ key: "value", color: CHART_COLORS.primary, label: "Borrows" }]} height={200} />
            </ChartCard>
            <ChartCard title="Peak Days of Week">
              <TrendBarChart data={dowData} bars={[{ key: "value", color: CHART_COLORS.secondary, label: "Borrows" }]} height={200} />
            </ChartCard>
            <ChartCard title="Borrows by Subject">
              <TrendBarChart data={subjData} bars={[{ key: "value", color: CHART_COLORS.teal2, label: "Borrows" }]} height={200} />
            </ChartCard>
            <ChartCard title="Return Compliance">
              <TrendBarChart data={compBar} bars={[
                { key: "value", color: CHART_COLORS.success },
              ]} height={200} />
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
            <Section title="Top Students">
              <div className="rounded-xl border border-line bg-white overflow-hidden">
                {data.borrowing.topStudents.map((s,i) => (
                  <RankRow key={s.studentId} rank={i+1} primary={s.fullName}
                    secondary={`${s.admissionNumber} · ${s.className}`}
                    value={s.count} valueLabel="borrows" highlight={i===0} />
                ))}
              </div>
              <button className={secondaryButtonClass + " mt-2 text-xs"} onClick={() => exportToCSV(data.borrowing.topStudents.map(s => ({ name: s.fullName, admissionNumber: s.admissionNumber, class: s.className, borrows: s.count })), "top-students.csv")}>
                Export CSV
              </button>
            </Section>

            <Section title="Top Classes">
              <div className="rounded-xl border border-line bg-white overflow-hidden">
                {data.borrowing.topClasses.map((c,i) => (
                  <RankRow key={c.classId} rank={i+1} primary={c.className} value={c.count} valueLabel="borrows" highlight={i===0} />
                ))}
              </div>
            </Section>

            <Section title="Top Teachers (Classroom Loans)">
              <div className="rounded-xl border border-line bg-white overflow-hidden">
                {data.borrowing.topTeachers.length === 0
                  ? <p className="text-sm text-slate px-4 py-6 text-center">No classroom loans recorded</p>
                  : data.borrowing.topTeachers.map((t,i) => (
                    <RankRow key={t.teacherId} rank={i+1} primary={t.fullName} value={t.count} valueLabel="loans" highlight={i===0} />
                  ))}
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
