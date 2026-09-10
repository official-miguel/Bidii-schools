"use client";

/**
 * AttendanceView — attendance taking component.
 *
 * Read path:
 *   1. Student roster is fetched directly from /api/students?classId=...
 *      on every class selection — no Zustand store dependency.
 *   2. Attendance status comes from attendanceStore.loadClassDate() which
 *      reads IDB first, then the store is kept fresh by SSE + background sync.
 *   3. If the student API returns empty, falls back to the /api/attendance
 *      endpoint for the roster overlay.
 *
 * Write path:
 *   POST /api/attendance → success → attendanceStore.upsertMany() updates
 *   IDB + in-memory state → SSE event propagates to other open tabs.
 *
 * Teacher once-a-day rule (lockClass=true):
 *   - Date is locked to today — the date picker is replaced with plain text.
 *   - After the first save the button label changes to "Update attendance"
 *     so the teacher knows a record already exists but can still correct it.
 *   - The API enforces this server-side too (past-date submissions rejected
 *     for TEACHER role).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBanner, EmptyState, inputClass, labelClass, primaryButtonClass } from "@/components/ui";
import { useAttendanceStore, getAttendanceForClassDate } from "@/lib/stores/attendanceStore";
import type { LocalAttendance } from "@/lib/stores/attendanceStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StudentRow = {
  studentId:       string;
  fullName:        string;
  admissionNumber: string;
  present:         boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AttendanceView({
  classes,
  lockClass = false,
}: {
  classes: { id: string; name: string }[];
  /** When true the class and date are locked to today — teacher mode. */
  lockClass?: boolean;
}) {
  const [classId, setClassId] = useState(classes[0]?.id || "");

  // In teacher (lockClass) mode the date is always today and cannot be changed.
  const [date, setDate] = useState(today());

  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt,   setSavedAt]   = useState<number | null>(null);

  // Whether today's attendance has already been submitted at least once.
  // Drives the "Update attendance" label and the advisory banner.
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  // ── Store reads ────────────────────────────────────────────────────────────
  const attendanceLoading = useAttendanceStore((s) => s.loading);

  // ── Student roster state (fetched directly from API) ──────────────────────
  const [storeStudents, setStoreStudents] = useState<{ id: string; fullName: string; admissionNumber: string; classId: string }[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // ── Fallback state for cold-cache visits ──────────────────────────────────
  const [apiFallbackRows, setApiFallbackRows] = useState<StudentRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Load attendance records for the selected class + date from IDB ─────────
  useEffect(() => {
    if (!classId) return;
    setSavedAt(null);
    useAttendanceStore.getState().loadClassDate(classId, date).catch(console.error);
  }, [classId, date]);

  // ── Fetch student roster from API when classId changes ───────────────────
  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    setStudentsLoading(true);
    fetch(`/api/students?classId=${classId}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: string; fullName: string; admissionNumber: string; classId: string; archivedAt?: string | null }[]) => {
        if (cancelled) return;
        const rows = data
          .filter((s) => !s.archivedAt)
          .map((s) => ({ id: s.id, fullName: s.fullName, admissionNumber: s.admissionNumber, classId: s.classId }))
          .sort((a, b) => a.admissionNumber.localeCompare(b.admissionNumber, undefined, { numeric: true }));
        setStoreStudents(rows);
      })
      .catch(() => { if (!cancelled) setStoreStudents([]); })
      .finally(() => { if (!cancelled) setStudentsLoading(false); });
    return () => { cancelled = true; };
  }, [classId]);

  useEffect(() => {
    if (!studentsLoading && storeStudents.length > 0) {
      setApiFallbackRows(null);
      setLoadError(null);
      return;
    }

    if (!studentsLoading && storeStudents.length === 0 && classId) {
      setLoadError(null);
      const controller = new AbortController();
      fetch(`/api/attendance?classId=${classId}&date=${date}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { setLoadError(data.error); setApiFallbackRows([]); return; }
          setApiFallbackRows(
            (data.students ?? []).map((s: {
              studentId: string; fullName: string;
              admissionNumber: string; present: boolean;
            }) => ({
              studentId:       s.studentId,
              fullName:        s.fullName,
              admissionNumber: s.admissionNumber,
              present:         s.present,
            }))
          );
        })
        .catch((err) => {
          if (err.name !== "AbortError") { setLoadError("Couldn't load attendance."); setApiFallbackRows([]); }
        });
      return () => controller.abort();
    }
  }, [studentsLoading, storeStudents.length, classId, date]);

  // ── Overlay store attendance status onto the roster ────────────────────────
  const byClassDate = useAttendanceStore((s) => s.byClassDate);
  const storedRecords: LocalAttendance[] = useMemo(
    () => getAttendanceForClassDate(classId, date),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classId, date, byClassDate]
  );
  const storedByStudent = useMemo(
    () => new Map(storedRecords.map((r) => [r.studentId, r])),
    [storedRecords]
  );

  // ── Detect whether today already has saved records (teacher mode) ──────────
  useEffect(() => {
    if (!lockClass) return;
    setAlreadySubmitted(storedRecords.length > 0);
  }, [lockClass, storedRecords]);

  // Local override state — reset when classId or date changes.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  useEffect(() => { setOverrides(new Map()); }, [classId, date]);

  // Compute the final visible rows.
  const rows: StudentRow[] = useMemo(() => {
    const source = storeStudents.length > 0
      ? storeStudents.map((s) => ({
          studentId:       s.id,
          fullName:        s.fullName,
          admissionNumber: s.admissionNumber,
          present:         true,
        }))
      : (apiFallbackRows ?? []);

    return source.map((s) => {
      if (overrides.has(s.studentId)) {
        return { ...s, present: overrides.get(s.studentId)! };
      }
      const stored = storedByStudent.get(s.studentId);
      if (stored) return { ...s, present: stored.status === "PRESENT" };
      return s;
    });
  }, [storeStudents, apiFallbackRows, overrides, storedByStudent]);

  // ── Checkbox handlers ──────────────────────────────────────────────────────

  const setPresent = useCallback((studentId: string, present: boolean) => {
    setOverrides((prev) => new Map(prev).set(studentId, present));
  }, []);

  const markAll = useCallback((present: boolean) => {
    setOverrides(new Map(rows.map((r) => [r.studentId, present])));
  }, [rows]);

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (rows.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/attendance", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          date,
          records: rows.map((r) => ({ studentId: r.studentId, present: r.present })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error || "Couldn't save attendance."); return; }

      const now = new Date().toISOString();
      const localRecords: LocalAttendance[] = rows.map((r) => ({
        id:           storedByStudent.get(r.studentId)?.id ?? `local-${r.studentId}-${date}`,
        schoolId:     "",
        studentId:    r.studentId,
        classId,
        date,
        status:       r.present ? "PRESENT" : "ABSENT",
        recordedById: null,
        createdAt:    now,
        updatedAt:    now,
      }));
      await useAttendanceStore.getState().upsertMany(localRecords);

      setOverrides(new Map());
      setSavedAt(Date.now());
      setAlreadySubmitted(true);
    } catch {
      setSaveError("Couldn't save attendance.");
    } finally {
      setSaving(false);
    }
  }

  // ── Derived counts ─────────────────────────────────────────────────────────

  const presentCount = rows.filter((r) => r.present).length;
  const absentCount  = rows.length - presentCount;

  const showLoading = (studentsLoading || attendanceLoading) && rows.length === 0 && !apiFallbackRows;

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 mb-5">
        {!lockClass && classes.length > 1 && (
          <div>
            <label className={labelClass}>Class</label>
            <select
              className={inputClass}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Date — locked to today in teacher mode, editable for principal */}
        {lockClass ? (
          <div>
            <p className={labelClass}>Date</p>
            <p className="text-sm font-medium text-foreground py-1.5">
              {todayLabel}
            </p>
          </div>
        ) : (
          <div>
            <label className={labelClass}>Date</label>
            <input
              type="date"
              className={inputClass}
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex gap-4 pb-0.5">
            <button type="button" className="text-sm text-royal hover:underline" onClick={() => markAll(true)}>
              Mark all present
            </button>
            <button type="button" className="text-sm text-slate hover:underline" onClick={() => markAll(false)}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Already-submitted advisory (teacher mode, before this session's save) */}
      {lockClass && alreadySubmitted && !savedAt && (
        <div className="mb-4 rounded-md bg-teal/8 border border-teal/20 text-teal text-sm px-3 py-2">
          Attendance has already been submitted for today. You can still make corrections and update.
        </div>
      )}

      {/* Success banner */}
      {savedAt && (
        <div className="mb-4 rounded-md bg-success-bg text-success text-sm px-3 py-2">
          {alreadySubmitted ? "Attendance updated." : "Attendance saved."}
        </div>
      )}
      {saveError && <ErrorBanner message={saveError} />}
      {loadError && <ErrorBanner message={loadError} />}

      {/* Roster */}
      {!classId ? (
        <EmptyState message="No class available yet." />
      ) : showLoading ? (
        <p className="text-slate text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState message="No students in this class yet." />
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-slate-50/80/40 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                    <th className="px-5 py-3.5 w-[130px]">Adm. No.</th>
                    <th className="px-5 py-3.5">Name</th>
                    <th className="px-5 py-3.5 w-[140px]">Present</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.studentId}
                      className={`border-b border-border last:border-0 cursor-pointer transition-colors ${
                        r.present
                          ? "hover:bg-slate-50/50/20"
                          : "bg-danger-bg/20 hover:bg-danger-bg/30 dark:bg-danger/5 dark:hover:bg-danger/10"
                      }`}
                      onClick={() => setPresent(r.studentId, !r.present)}
                    >
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono text-slate bg-slate-50 border border-border rounded px-1.5 py-0.5">
                          {r.admissionNumber}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-foreground">{r.fullName}</td>
                      <td className="px-5 py-3.5">
                        <label
                          className="inline-flex items-center gap-2 text-sm cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-teal cursor-pointer rounded border-border"
                            checked={r.present}
                            onChange={(e) => setPresent(r.studentId, e.target.checked)}
                          />
                          <span className={`font-medium ${r.present ? "text-success" : "text-danger"}`}>
                            {r.present ? "Present" : "Absent"}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
            <p className="text-sm">
              <span className="text-success font-semibold">{presentCount} present</span>
              {" · "}
              <span className="text-danger font-semibold">{absentCount} absent</span>
              {" · "}
              <span className="text-slate">{rows.length} students</span>
            </p>
            <button className={primaryButtonClass} disabled={saving} onClick={handleSave}>
              {saving
                ? "Saving…"
                : alreadySubmitted
                  ? "Update attendance"
                  : "Save attendance"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
