"use client";

/**
 * HistoryStudentsTab
 *
 * Scrollable table of all archived students (TRANSFER + EXPULSION).
 * Matching the existing Students module visual language exactly:
 * same table structure, avatars, chip badges, row hover actions,
 * infinite scroll, empty states, and skeleton loading.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeftRight, UserX, GraduationCap, ExternalLink } from "lucide-react";
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
  archiveType: string | null;
  archiveReason: string | null;
  schoolClass: { id: string; name: string; form: number; stream: string | null };
  disciplineRecords: { id: string }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function ArchiveBadge({ type }: { type: string | null }) {
  if (type === "EXPULSION")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium
                       bg-danger-bg text-danger border border-danger/20
                       px-2.5 py-0.5 rounded-full">
        <UserX className="h-3 w-3" />Expelled
      </span>
    );
  if (type === "GRADUATION")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium
                       bg-success-bg text-success border border-success/20
                       px-2.5 py-0.5 rounded-full">
        <GraduationCap className="h-3 w-3" />Graduated
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium
                     bg-info-bg text-info border border-info/20
                     px-2.5 py-0.5 rounded-full">
      <ArrowLeftRight className="h-3 w-3" />Transferred
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  globalSearch: string;
  typeFilter: string; // "" | "TRANSFER" | "EXPULSION"
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HistoryStudentsTab({ globalSearch, typeFilter }: Props) {
  const [students, setStudents]     = useState<ArchivedStudent[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch page
  const fetchPage = useCallback(async (cursor?: string, reset = false) => {
    if (reset) setStudents(null);
    setLoadingMore(true);
    const params = new URLSearchParams({ limit: "50" });
    if (cursor) params.set("cursor", cursor);
    if (globalSearch.trim()) params.set("q", globalSearch.trim());
    if (typeFilter) params.set("type", typeFilter);

    try {
      const res = await fetch(`/api/history/students?${params}`);
      const data: ArchivedStudent[] = await res.json();
      const next = res.headers.get("X-Next-Cursor") ?? undefined;
      setNextCursor(next);
      setStudents((prev) => reset ? data : [...(prev ?? []), ...data]);
    } catch {
      // silent — show whatever we have
    } finally {
      setLoadingMore(false);
    }
  }, [globalSearch, typeFilter]);

  // Refetch when search/filter changes
  useEffect(() => {
    void fetchPage(undefined, true);
  }, [fetchPage]);

  // Infinite scroll
  useEffect(() => {
    if (!nextCursor) return;
    const el = bottomRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loadingMore) {
          void fetchPage(nextCursor);
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [nextCursor, loadingMore, fetchPage]);

  if (students === null) return <SkeletonTable rows={6} cols={5} hasAvatar />;

  if (students.length === 0) {
    return (
      <EmptyState
        message={
          globalSearch
            ? "No archived students match your search."
            : "No transferred or expelled students yet."
        }
      />
    );
  }

  return (
    <>
      {/* ── Desktop table ── */}
      <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-slate-50/80 text-left text-xs
                             font-semibold text-slate uppercase tracking-wide">
                <th className="px-5 py-3.5 w-[260px]">Student</th>
                <th className="px-5 py-3.5 w-[120px]">Adm. No.</th>
                <th className="px-5 py-3.5 w-[130px]">Last class</th>
                <th className="px-5 py-3.5 w-[140px]">Status</th>
                <th className="px-5 py-3.5 w-[130px]">Removed</th>
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
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-foreground">{s.schoolClass.name}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col gap-1">
                      <ArchiveBadge type={s.archiveType} />
                      {s.archiveType === "EXPULSION" && s.disciplineRecords.length > 0 && (
                        <span className="text-[10px] text-danger/70 font-medium">
                          {s.disciplineRecords.length} discipline record{s.disciplineRecords.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate">
                    {fmtDate(s.archivedAt)}
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

      {/* ── Mobile cards ── */}
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
                  {s.admissionNumber} · {s.schoolClass.name} · {fmtDate(s.archivedAt)}
                </p>
              </div>
              <ArchiveBadge type={s.archiveType} />
            </div>
          </button>
        ))}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={bottomRef} className="h-4" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <span className="inline-block h-5 w-5 rounded-full border-2
                           border-teal border-t-transparent animate-spin" />
        </div>
      )}

      {/* Profile drawer */}
      {selectedId && (
        <ArchivedStudentDrawer
          studentId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
