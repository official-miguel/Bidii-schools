"use client";

import { useEffect, useState } from "react";
import { Calendar, Users, TrendingUp, ChevronLeft } from "lucide-react";

type TaughtClass = { id: string; name: string };

type RosterRow = {
  studentId: string;
  fullName: string;
  admissionNumber: string;
  present: boolean;
};

type TrendRow = {
  date: string;
  present: number;
  total: number;
  rate: number;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function AttendanceViewTab({
  taughtClasses,
  classTeacherOfId,
}: {
  taughtClasses: TaughtClass[];
  classTeacherOfId?: string | null;
}) {
  const [selected, setSelected] = useState<TaughtClass | null>(null);
  const [date, setDate] = useState<string>(today);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [trendFrom, setTrendFrom] = useState<string>(() => daysAgo(13));
  const [trendTo, setTrendTo] = useState<string>(today);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  // Load daily roster when class or date changes
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setRosterLoading(true);
    setRosterError(null);
    fetch(`/api/attendance?classId=${selected.id}&date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data) => {
        if (!cancelled) setRoster(data.students ?? []);
      })
      .catch(() => {
        if (!cancelled) setRosterError("Couldn't load roster for this class.");
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, date]);

  // Load trend data when class or date range changes
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setTrendLoading(true);
    fetch(`/api/attendance?classId=${selected.id}&from=${trendFrom}&to=${trendTo}&trend=1`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setTrend(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setTrend([]);
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, trendFrom, trendTo]);

  // R8.9: if no taught classes, render nothing (DOM absent)
  if (taughtClasses.length === 0) return null;

  // ── Class tile grid ──────────────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate">
          Select a class to view its attendance records.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {taughtClasses.map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => setSelected(cls)}
              className={`flex items-center gap-3 p-5 rounded-xl border text-left transition-all duration-150 hover:border-teal/40 hover:shadow-sm
                ${
                  cls.id === classTeacherOfId
                    ? "bg-teal/5 border-teal/30"
                    : "bg-card border-border"
                }`}
            >
              <div className="w-10 h-10 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {cls.name}
                </p>
                {cls.id === classTeacherOfId && (
                  <p className="text-xs text-teal mt-0.5">My class</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Detail view for selected class ───────────────────────────────────────
  const presentCount = roster.filter((r) => r.present).length;
  const absentCount = roster.length - presentCount;
  const maxRate = trend.length > 0 ? Math.max(...trend.map((t) => t.rate), 1) : 100;

  return (
    <div className="space-y-5">
      {/* Back navigation */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="flex items-center gap-1 text-sm text-teal hover:text-teal/80 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All classes
        </button>
        <span className="text-slate">/</span>
        <span className="text-sm font-semibold text-foreground">{selected.name}</span>
      </div>

      {/* Daily register */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4 text-teal" />
            Daily Register
          </h3>
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 text-foreground"
          />
        </div>

        {rosterError && (
          <p className="text-sm text-danger">{rosterError}</p>
        )}

        {rosterLoading ? (
          <p className="text-sm text-slate">Loading…</p>
        ) : roster.length === 0 ? (
          <p className="text-sm text-slate">
            No attendance recorded for this date.
          </p>
        ) : (
          <>
            <div className="flex gap-4 text-sm">
              <span className="text-success font-semibold">{presentCount} present</span>
              <span className="text-danger font-semibold">{absentCount} absent</span>
              <span className="text-slate">{roster.length} total</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b border-border bg-slate-50/80/40 text-xs font-semibold text-slate uppercase tracking-wide">
                    <th className="px-4 py-3 text-left w-[120px]">Adm. No.</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left w-[100px]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r) => (
                    <tr
                      key={r.studentId}
                      className={`border-b border-border last:border-0
                        ${r.present ? "" : "bg-danger-bg/20 dark:bg-danger/5"}`}
                    >
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-slate bg-slate-50 border border-border rounded px-1.5 py-0.5">
                          {r.admissionNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {r.fullName}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-semibold ${r.present ? "text-success" : "text-danger"}`}
                        >
                          {r.present ? "Present" : "Absent"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Trend chart */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-teal" />
            Attendance Trend
          </h3>
          <div className="flex items-center gap-2 text-xs text-slate">
            <input
              type="date"
              value={trendFrom}
              max={trendTo}
              onChange={(e) => setTrendFrom(e.target.value)}
              className="border border-border rounded px-2 py-1"
            />
            <span>to</span>
            <input
              type="date"
              value={trendTo}
              max={today()}
              onChange={(e) => setTrendTo(e.target.value)}
              className="border border-border rounded px-2 py-1"
            />
          </div>
        </div>

        {trendLoading ? (
          <p className="text-sm text-slate">Loading trend…</p>
        ) : trend.length === 0 ? (
          <p className="text-sm text-slate">
            No attendance data for this range.
          </p>
        ) : (
          <div className="flex items-end gap-1 h-28 overflow-x-auto pb-1">
            {trend.map((t) => (
              <div
                key={t.date}
                className="flex flex-col items-center gap-1 min-w-[28px] flex-1"
              >
                <span className="text-[10px] text-slate leading-none">{t.rate}%</span>
                <div
                  className={`w-full rounded-t transition-all ${
                    t.rate >= 80
                      ? "bg-teal/70"
                      : t.rate >= 60
                        ? "bg-warn/70"
                        : "bg-danger/60"
                  }`}
                  style={{
                    height: `${Math.max(4, Math.round((t.rate / maxRate) * 72))}px`,
                  }}
                  title={`${t.date}: ${t.present}/${t.total} (${t.rate}%)`}
                />
                <span className="text-[9px] text-slate/70 hidden sm:block">
                  {t.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
