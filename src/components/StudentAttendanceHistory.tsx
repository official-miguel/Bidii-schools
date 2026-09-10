"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui";

type History = {
  totalDays: number;
  present: number;
  absent: number;
  rate: number | null;
  records: { date: string; status: "PRESENT" | "ABSENT"; className: string }[];
};

/// One student's attendance record — rendered inside the student profile
/// modal/page so attendance is analysable per student.
export default function StudentAttendanceHistory({ studentId }: { studentId: string }) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHistory(null);
    setError(null);
    fetch(`/api/attendance?studentId=${studentId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Couldn't load attendance history.");
          return;
        }
        setHistory(data);
      })
      .catch(() => setError("Couldn't load attendance history."));
  }, [studentId]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!history) return <p className="text-sm text-slate">Loading attendance…</p>;
  if (history.totalDays === 0) {
    return <EmptyState message="No attendance recorded for this student yet." />;
  }

  const cards = [
    { label: "Days recorded", value: String(history.totalDays), cls: "text-foreground" },
    { label: "Present", value: String(history.present), cls: "text-success" },
    { label: "Absent", value: String(history.absent), cls: "text-danger" },
    {
      label: "Attendance rate",
      value: `${history.rate}%`,
      cls: (history.rate ?? 0) >= 90 ? "text-success" : (history.rate ?? 0) >= 75 ? "text-warn" : "text-danger",
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4">
            <p className={`text-xl font-display font-semibold ${c.cls}`}>{c.value}</p>
            <p className="text-slate text-xs mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Class</th>
              <th className="px-5 py-3 w-[110px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {history.records.map((r) => (
              <tr key={r.date + r.className} className="border-b border-border last:border-0 hover:bg-slate-50/50 transition-colors">
                <td className="px-5 py-3 text-foreground text-sm">{r.date}</td>
                <td className="px-5 py-3 text-slate text-sm">{r.className}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                    r.status === "PRESENT"
                      ? "bg-success-bg border-success/20 text-success"
                      : "bg-danger-bg border-danger/20 text-danger"
                  }`}>
                    {r.status === "PRESENT" ? "Present" : "Absent"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
