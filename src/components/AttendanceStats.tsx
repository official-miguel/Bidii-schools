"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui";

export type AttendanceStatsData = {
  date: string;
  totalStudents: number;
  present: number;
  absent: number;
  recorded: number;
  byClass: {
    classId: string;
    className: string;
    totalStudents: number;
    present: number;
    absent: number;
    recorded: number;
  }[];
};

type Props = {
  compact?: boolean;
  /**
   * Pre-fetched stats data. When provided the component renders immediately
   * with no client-side network request — eliminates the duplicate
   * /api/attendance fetch that would otherwise fire after SSR.
   */
  initialData?: AttendanceStatsData;
};

export default function AttendanceStats({ compact = false, initialData }: Props) {
  const [stats, setStats] = useState<AttendanceStatsData | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Skip the fetch entirely when data was already loaded server-side.
    if (initialData) return;

    const controller = new AbortController();
    fetch("/api/attendance", { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Couldn't load attendance stats.");
          return;
        }
        setStats(data);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError("Couldn't load attendance stats.");
      });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!stats) return <p className="text-sm text-slate">Loading…</p>;

  const cards = [
    { label: "Students", value: stats.totalStudents },
    { label: "Present today", value: stats.present },
    { label: "Absent today", value: stats.absent },
    { label: "Recorded today", value: stats.recorded },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <p className="text-2xl font-semibold text-foreground">{c.value}</p>
            <p className="text-slate text-xs mt-1">{c.label}</p>
          </div>
        ))}
      </div>
      {stats.recorded === 0 && (
        <p className="text-xs text-slate mt-2">
          No attendance has been recorded for {stats.date} yet.
        </p>
      )}
      {!compact && (
        <div className="mt-6 bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          {stats.byClass.length === 0 ? (
            <div className="px-5 py-12">
              <EmptyState message="No classes set up yet." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                    <th className="px-5 py-3.5">Class</th>
                    <th className="px-5 py-3.5 w-[100px]">Present</th>
                    <th className="px-5 py-3.5 w-[100px]">Absent</th>
                    <th className="px-5 py-3.5 w-[160px]">Recorded / Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byClass.map((c) => (
                    <tr key={c.classId} className="border-b border-border last:border-0 hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-foreground">{c.className}</td>
                      <td className="px-5 py-3.5 text-success font-semibold">{c.present}</td>
                      <td className="px-5 py-3.5 text-danger font-semibold">{c.absent}</td>
                      <td className="px-5 py-3.5 text-slate tabular-nums">{c.recorded} / {c.totalStudents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
