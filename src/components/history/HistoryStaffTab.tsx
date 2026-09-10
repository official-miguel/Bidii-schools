"use client";

/**
 * HistoryStaffTab
 *
 * Scrollable table of all archived (transferred) staff members.
 * Mirrors the Staff directory visual language.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { Avatar, Chip, EmptyState } from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";
import ArchivedStaffDrawer from "@/components/history/ArchivedStaffDrawer";

// ── Types ─────────────────────────────────────────────────────────────────────

type ArchivedStaff = {
  id: string;
  staffId: string;
  fullName: string;
  email: string | null;
  createdAt: string;
  archivedAt: string;
  archiveReason: string | null;
  departmentSnapshot: string | null;
  employmentStartDate: string | null;
  primaryDepartment: { id: string; name: string } | null;
  teacherSubjects: { subject: { id: string; name: string; code: string } }[];
  user: { email: string; role: string } | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  globalSearch: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HistoryStaffTab({ globalSearch }: Props) {
  const [staff, setStaff]           = useState<ArchivedStaff[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (cursor?: string, reset = false) => {
    if (reset) setStaff(null);
    setLoadingMore(true);
    const params = new URLSearchParams({ limit: "50" });
    if (cursor) params.set("cursor", cursor);
    if (globalSearch.trim()) params.set("q", globalSearch.trim());

    try {
      const res = await fetch(`/api/history/staff?${params}`);
      const data: ArchivedStaff[] = await res.json();
      const next = res.headers.get("X-Next-Cursor") ?? undefined;
      setNextCursor(next);
      setStaff((prev) => reset ? data : [...(prev ?? []), ...data]);
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
        if (entries[0].isIntersecting && nextCursor && !loadingMore) {
          void fetchPage(nextCursor);
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [nextCursor, loadingMore, fetchPage]);

  if (staff === null) return <SkeletonTable rows={5} cols={6} hasAvatar />;
  if (staff.length === 0) {
    return (
      <EmptyState
        message={
          globalSearch
            ? "No archived staff match your search."
            : "No transferred staff yet."
        }
      />
    );
  }

  return (
    <>
      {/* ── Desktop table ── */}
      <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-slate-50/80 text-left text-xs
                             font-semibold text-slate uppercase tracking-wide">
                <th className="px-5 py-3.5 w-[240px]">Staff member</th>
                <th className="px-5 py-3.5 w-[100px]">Staff ID</th>
                <th className="px-5 py-3.5 w-[150px]">Department</th>
                <th className="px-5 py-3.5 hidden lg:table-cell">Subjects</th>
                <th className="px-5 py-3.5 w-[130px]">Joined</th>
                <th className="px-5 py-3.5 w-[130px]">Left</th>
                <th className="px-5 py-3.5 w-[48px]" />
              </tr>
            </thead>
            <tbody>
              {staff.map((t) => {
                const dept = t.primaryDepartment?.name ?? t.departmentSnapshot ?? null;
                return (
                  <tr
                    key={t.id}
                    className="group border-b border-border last:border-0
                               hover:bg-slate-50/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedId(t.id)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={t.fullName} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate
                                       group-hover:text-teal transition-colors">
                            {t.fullName}
                          </p>
                          {t.email && (
                            <p className="text-xs text-slate/70 truncate">{t.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-mono text-slate bg-slate-50
                                      border border-border rounded px-1.5 py-0.5">
                        {t.staffId}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {dept
                        ? <Chip variant="default" size="xs">{dept}</Chip>
                        : <span className="text-xs text-slate/50">—</span>}
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      {t.teacherSubjects.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {t.teacherSubjects.slice(0, 4).map((ts) => (
                            <Chip key={ts.subject.id} variant="teal" size="xs">
                              {ts.subject.code}
                            </Chip>
                          ))}
                          {t.teacherSubjects.length > 4 && (
                            <Chip variant="default" size="xs">
                              +{t.teacherSubjects.length - 4}
                            </Chip>
                          )}
                        </div>
                      ) : <span className="text-xs text-slate/50">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate">
                      {fmtDate(t.employmentStartDate ?? t.createdAt)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate">
                      {fmtDate(t.archivedAt)}
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        aria-label="View profile"
                        onClick={(e) => { e.stopPropagation(); setSelectedId(t.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity
                                   flex items-center justify-center h-8 w-8 rounded-lg
                                   text-slate hover:text-teal hover:bg-teal-50 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile cards ── */}
      <div className="md:hidden space-y-3">
        {staff.map((t) => {
          const dept = t.primaryDepartment?.name ?? t.departmentSnapshot ?? null;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className="w-full text-left rounded-xl border border-border bg-card
                         shadow-xs px-4 py-3.5 hover:border-teal/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Avatar name={t.fullName} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{t.fullName}</p>
                  <p className="text-xs text-slate/70 truncate">
                    ID {t.staffId}
                    {dept && ` · ${dept}`}
                    {" · Left "}{fmtDate(t.archivedAt)}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-medium bg-info-bg text-info
                                 border border-info/20 px-2 py-0.5 rounded-full">
                  Transferred
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div ref={bottomRef} className="h-4" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <span className="inline-block h-5 w-5 rounded-full border-2
                           border-teal border-t-transparent animate-spin" />
        </div>
      )}

      {selectedId && (
        <ArchivedStaffDrawer
          staffId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
