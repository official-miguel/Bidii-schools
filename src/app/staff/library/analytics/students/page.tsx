"use client";
import { useCallback, useEffect, useState } from "react";
import { Users, AlertTriangle, BookOpen, Activity } from "lucide-react";
import {
  KpiCard, Section, ChartCard, TrendBarChart,
  RankRow, WindowSelector, AnalyticsSkeleton, CHART_COLORS, exportToCSV,
} from "../_shared";
import { secondaryButtonClass } from "@/components/ui";

interface StudentData {
  kpis: { activeBorrowers: number; neverBorrowed: number; totalTitles: number };
  borrowing: {
    topStudents: { studentId: string; fullName: string; admissionNumber: string; className: string; count: number }[];
    topClasses:  { classId: string; className: string; count: number }[];
    subjectDist: { subject: string; count: number }[];
  };
  students: {
    activeBorrowers: number; neverBorrowed: number;
    repeatOffenders: { studentId: string; fullName: string; admissionNumber: string; overdueCount: number }[];
  };
}

export default function StudentAnalyticsPage() {
  const [data, setData]   = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays]   = useState("90");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/library/analytics/executive?days=${days}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const topStudentBar = (data?.borrowing.topStudents ?? []).slice(0, 10).map(r => ({
    name: r.fullName.split(" ")[0] + " " + (r.fullName.split(" ").at(-1)?.[0] ?? "") + ".",
    value: r.count,
  }));

  const topClassBar = (data?.borrowing.topClasses ?? []).map(r => ({ name: r.className, value: r.count }));

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-dark-text">Student Reading Analytics</h1>
          <p className="text-sm text-slate mt-0.5">Active borrowers, reading frequency, overdue patterns and never-borrowed students.</p>
        </div>
        <WindowSelector value={days} onChange={setDays} />
      </div>

      {loading ? <AnalyticsSkeleton rows={8} /> : data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <KpiCard label="Active Borrowers"     value={data.students.activeBorrowers} icon={<Users className="h-5 w-5" />} variant="success" />
            <KpiCard label="Repeat Overdue"        value={data.students.repeatOffenders.length} icon={<AlertTriangle className="h-5 w-5" />} variant={data.students.repeatOffenders.length > 0 ? "danger" : "default"} />
            <KpiCard label="Never Borrowed Titles" value={data.kpis.neverBorrowed}        icon={<BookOpen className="h-5 w-5" />} variant={data.kpis.neverBorrowed > 20 ? "warn" : "default"} />
            <KpiCard label="Top Borrowers"         value={data.borrowing.topStudents.length > 0 ? data.borrowing.topStudents[0].count + " borrows" : "—"} icon={<Activity className="h-5 w-5" />} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            <Section title="Top 10 Most Active Students">
              <ChartCard title="">
                <TrendBarChart data={topStudentBar} bars={[{ key: "value", color: CHART_COLORS.primary, label: "Borrows" }]} height={220} />
              </ChartCard>
            </Section>
            <Section title="Borrows by Class">
              <ChartCard title="">
                <TrendBarChart data={topClassBar} bars={[{ key: "value", color: CHART_COLORS.secondary, label: "Borrows" }]} height={220} />
              </ChartCard>
            </Section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Section title="Most Active Students (Detailed)"
              action={<button className={secondaryButtonClass + " text-xs"} onClick={() => exportToCSV(data.borrowing.topStudents.map(s => ({ name: s.fullName, admissionNumber: s.admissionNumber, class: s.className, borrows: s.count })), "active-students.csv")}>Export CSV</button>}>
              <div className="rounded-xl border border-line bg-white overflow-hidden">
                {data.borrowing.topStudents.map((s, i) => (
                  <RankRow key={s.studentId} rank={i+1} primary={s.fullName}
                    secondary={`${s.admissionNumber} · ${s.className}`}
                    value={s.count} valueLabel="borrows" highlight={i===0} />
                ))}
              </div>
            </Section>

            <Section title="Repeat Overdue Borrowers" description="Students with 2+ unreturned overdue books.">
              {data.students.repeatOffenders.length === 0
                ? <p className="text-sm text-slate py-8 text-center rounded-xl border border-line bg-white">No repeat offenders — great discipline!</p>
                : (
                  <div className="rounded-xl border border-danger/20 bg-danger-bg/10 overflow-hidden">
                    {data.students.repeatOffenders.map((s, i) => (
                      <RankRow key={s.studentId} rank={i+1} primary={s.fullName}
                        secondary={s.admissionNumber}
                        value={s.overdueCount} valueLabel="overdue books" highlight />
                    ))}
                  </div>
                )}
            </Section>
          </div>

          <Section title="Class Reading Rankings">
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              {data.borrowing.topClasses.map((c, i) => (
                <RankRow key={c.classId} rank={i+1} primary={c.className} value={c.count} valueLabel="borrows" highlight={i===0} />
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
