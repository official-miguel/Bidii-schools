"use client";

/**
 * HistoryGraduantsTab
 *
 * Table of students archived with archiveType === "GRADUATION".
 * Follows the same design language as HistoryStudentsTab.
 * For now backed by the same /api/history/students?type=GRADUATION endpoint.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { GraduationCap, ExternalLink } from "lucide-react";
import { Avatar, EmptyState } from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";
import ArchivedStudentDrawer from "@/components/history/ArchivedStudentDrawer";

// ── Types ─────────────────────────────────────────────────────────────────────

type ArchivedStudent = {
  id: string;
  admissionNumber: string;
  fullName: string;
  parentName: string | null;
  createdAt: string;
  archivedAt: string;
  archiveReason: string | null;
  schoolClass: { id: string; name: string; form: number };
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function graduationYear(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).getFullYear().toString();
}

interface Props { globalSearch: string; }

export default function HistoryGraduantsTab({ globalSearch }: Props) {
  const [students, setStudents]     = useState<ArchivedStudent[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (cursor?: string, reset = false) => {
    if (reset) setStudents(null);
    setLoadingMore(true);
    const params = new URLSearchParams({ limit: "50", type: "GRADUATION" });
    if (cursor) params.set("cursor", cursor);
    if (globalSearch.trim()) params.set("q", globalSearch.trim());
    try {
      const res = await fetch(`/api/history/students?${params}`);
      const data: ArchivedStudent[] = await res.json();
      const next = res.headers.get("X-Next-Cursor") ?? undefined;
      setNextCursor(next);
      setStudents((prev) => reset ? data : [...(prev ?? []), ...data]);
    } catch { /* silent */ }
    finally { setLoadingMore(false); }
  }, [globalSearch]);

  useEffect(() => { void fetchPage(undefined, true); }, [fetchPage]);

  useEffect(() => {
    if (!nextCursor) return;
    const el = bottomRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loadingMore)
          void fetchPage(nextCursor);
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [nextCursor, loadingMore, fetchPage]);

  if (students === null) return <SkeletonTable rows={5} cols={5} hasAvatar />;
  if (students.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap className="h-6 w-6" />}
        message={
          globalSearch
            ? "No graduants match your search."
            : "No graduants recorded yet. Use the graduation workflow to mark students who have completed their studies."
        }
      />
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-slate-50/80 text-left text-xs
                             font-semibold text-slate uppercase tracking-wide">
                <th className="px-5 py-3.5 w-[260px]">Student</th>
                <th className="px-5 py-3.5 w-[120px]">Adm. No.</th>
                <th className="px-5 py-3.5 w-[140px]">Final class</th>
                <th className="px-5 py-3.5 w-[120px]">Graduation year</th>
                <th className="px-5 py-3.5 w-[130px]">Enrolled</th>
                <th className="px-5 py-3.5 w-[48px]" />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  className="group border-b border-border last:border-0
                             hover:bg-slate-50/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedId(s.id)}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate
                                     group-hover:text-teal transition-colors">
                          {s.fullName}
                        </p>
                        {s.parentName && (
                          <p className="text-xs text-slate/70 truncate">{s.parentName}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-mono text-slate bg-slate-50
                                    border border-border rounded px-1.5 py-0.5">
                      {s.admissionNumber}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-foreground">
                    {s.schoolClass.name}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold
                                     bg-success-bg text-success border border-success/20
                                     px-2.5 py-0.5 rounded-full">
                      <GraduationCap className="h-3 w-3" />
                      {graduationYear(s.archivedAt)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate">
                    {fmtDate(s.createdAt)}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      type="button"
                      aria-label="View profile"
                      onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity
                                 flex items-center justify-center h-8 w-8 rounded-lg
                                 text-slate hover:text-teal hover:bg-teal-50 transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {students.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedId(s.id)}
            className="w-full text-left rounded-xl border border-border bg-card
                       shadow-xs px-4 py-3.5 hover:border-teal/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Avatar name={s.fullName} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{s.fullName}</p>
                <p className="text-xs text-slate/70 truncate">
                  {s.admissionNumber} · {s.schoolClass.name} · Class of {graduationYear(s.archivedAt)}
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-semibold bg-success-bg
                               text-success border border-success/20 px-2 py-0.5 rounded-full">
                {graduationYear(s.archivedAt)}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div ref={bottomRef} className="h-4" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <span className="inline-block h-5 w-5 rounded-full border-2
                           border-teal border-t-transparent animate-spin" />
        </div>
      )}
      {selectedId && (
        <ArchivedStudentDrawer
          studentId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
