"use client";

/**
 * TeacherAttendanceOverview
 *
 * A compact today-at-a-glance strip scoped to the teacher's own classes.
 * Fetches /api/attendance (stats mode) and filters to the classIds the
 * teacher actually teaches, so they only see their own classes.
 */

import { useEffect, useState } from "react";
import type { AttendanceStatsData } from "@/components/AttendanceStats";

interface Props {
  /** IDs of the classes this teacher teaches */
  classIds: string[];
  /** ID of the class this teacher is class teacher of, if any */
  classTeacherOfId: string | null;
}

export default function TeacherAttendanceOverview({ classIds, classTeacherOfId: _classTeacherOfId }: Props) {
  const [stats, setStats] = useState<AttendanceStatsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (classIds.length === 0) return;
    const controller = new AbortController();
    fetch("/api/attendance", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) { setError("Couldn't load overview."); return; }
        const data: AttendanceStatsData = await res.json();
        // Scope the stats to only the teacher's classes
        const myClasses = data.byClass.filter((c) => classIds.includes(c.classId));
        setStats({
          ...data,
          totalStudents: myClasses.reduce((s, c) => s + c.totalStudents, 0),
          present:  myClasses.reduce((s, c) => s + c.present,  0),
          absent:   myClasses.reduce((s, c) => s + c.absent,   0),
          recorded: myClasses.reduce((s, c) => s + c.recorded, 0),
          byClass:  myClasses,
        });
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError("Couldn't load overview.");
      });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-slate-100 rounded-xl h-16" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: "My students",    value: stats.totalStudents, color: "text-ink"     },
    { label: "Present today",  value: stats.present,       color: "text-success" },
    { label: "Absent today",   value: stats.absent,        color: "text-danger"  },
    { label: "Recorded today", value: stats.recorded,      color: "text-teal"    },
  ];

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-white border border-line rounded-xl p-4 shadow-sm dark:bg-dark-surface dark:border-dark-border"
          >
            <p className={`text-2xl font-semibold ${c.color} dark:text-dark-text`}>{c.value}</p>
            <p className="text-slate text-xs mt-1 dark:text-dark-muted">{c.label}</p>
          </div>
        ))}
      </div>

      {stats.recorded === 0 && (
        <p className="text-xs text-slate">
          No attendance has been recorded for your classes today yet.
        </p>
      )}
    </div>
  );
}
