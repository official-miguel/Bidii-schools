"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import React from "react";
import {
  PageHeader,
  EmptyState,
  Avatar,
  ActionIconButton,
} from "@/components/ui";
import { useVirtualizer }   from "@tanstack/react-virtual";
import { SkeletonTable }    from "@/components/ui/ProgressivePage";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import { ExternalLink, Pencil } from "lucide-react";

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Student = {
  id: string;
  fullName: string;
  admissionNumber: string;
  classId: string;
  parentName: string | null;
};

const VIRTUAL_THRESHOLD = 100;

// ---------------------------------------------------------------------------
// Table header
// ---------------------------------------------------------------------------

const TABLE_HEADER = (
  <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide">
    <th className="px-5 py-3.5 w-[260px]">Student</th>
    <th className="px-5 py-3.5 w-[130px]">Adm. No.</th>
    <th className="px-5 py-3.5 w-[130px]">Class</th>
    <th className="px-5 py-3.5 w-[64px]" />
  </tr>
);

// ---------------------------------------------------------------------------
// StudentRow
// ---------------------------------------------------------------------------

const StudentRow = React.memo(function StudentRow({
  s,
  className,
  onNavigate,
  onEdit,
  canEdit,
}: {
  s: Student;
  className: string;
  onNavigate: (id: string) => void;
  onEdit?: (id: string) => void;
  canEdit?: boolean;
}) {
  return (
    <tr className="group border-b border-line last:border-0 hover:bg-slate-50/50 transition-colors">
      <td className="px-5 py-3.5">
        <button
          className="flex items-center gap-3 text-left"
          onClick={() => onNavigate(s.id)}
        >
          <Avatar name={s.fullName} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink hover:text-teal transition-colors truncate">
              {s.fullName}
            </p>
            {s.parentName && (
              <p className="text-xs text-slate/70 truncate">{s.parentName}</p>
            )}
          </div>
        </button>
      </td>
      <td className="px-5 py-3.5">
        <span className="text-xs font-mono text-slate bg-slate-50 border border-line rounded px-1.5 py-0.5">
          {s.admissionNumber}
        </span>
      </td>
      <td className="px-5 py-3.5 text-sm text-ink">{className || "—"}</td>
      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canEdit && onEdit && (
            <ActionIconButton
              icon={<Pencil className="h-4 w-4" />}
              label="Edit student"
              onClick={() => onEdit(s.id)}
            />
          )}
          <ActionIconButton
            icon={<ExternalLink className="h-4 w-4" />}
            label="View profile"
            onClick={() => onNavigate(s.id)}
          />
        </div>
      </td>
    </tr>
  );
});

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function TeacherStudentsPage() {
  const router = useRouter();
  const parentRef = useRef<HTMLDivElement>(null);

  // ── Direct API state (no store cache) ────────────────────────────────────
  const [rawStudents,      setRawStudents]      = useState<Student[]>([]);
  const [rawClasses,       setRawClasses]       = useState<{ id: string; name: string }[]>([]);
  const [pageLoading,      setPageLoading]      = useState(true);
  const [classTeacherOfId, setClassTeacherOfId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setPageLoading(true);
    Promise.all([
      fetch("/api/students"),
      fetch("/api/classes"),
      fetch("/api/teacher/me"),
    ])
      .then(([stuRes, clsRes, meRes]) => Promise.all([
        stuRes.ok ? stuRes.json() : [],
        clsRes.ok ? clsRes.json() : [],
        meRes.ok ? meRes.json() : null,
      ]))
      .then(([stuData, clsData, meData]) => {
        if (cancelled) return;
        setRawStudents(stuData);
        setRawClasses(clsData);
        // If teacher is a class teacher, default filter to their class
        if (meData?.classTeacherOf?.id) {
          setClassTeacherOfId(meData.classTeacherOf.id);
          setFilterClassId(meData.classTeacherOf.id); // default filter (R4.3)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPageLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const [search,        setSearch]        = useState("");
  const [filterClassId, setFilterClassId] = useState("");
  const q = useDebounced(search.trim().toLowerCase(), 200);

  const classMap = useMemo(() => new Map(rawClasses.map((c) => [c.id, c])), [rawClasses]);

  const students: Student[] = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (rawStudents as any[])
      .filter((s) => !s.archivedAt)
      .map((s) => ({
        id:              s.id,
        fullName:        s.fullName,
        admissionNumber: s.admissionNumber,
        classId:         s.classId,
        parentName:      s.parentName ?? null,
      })),
    [rawStudents]
  );

  const visibleStudents = useMemo(() => {
    let list = students;
    // Only apply class filter when there's no active search query
    // (search is always cross-class per R4.3)
    if (filterClassId && !q) list = list.filter((s) => s.classId === filterClassId);
    if (q) list = list.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.admissionNumber.toLowerCase().includes(q)
    );
    return list;
  }, [students, filterClassId, q]);

  const rowVirtualizer = useVirtualizer({
    count: visibleStudents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 57,
    overscan: 10,
  });

  const useVirtual = visibleStudents.length > VIRTUAL_THRESHOLD;
  const showLoading = pageLoading && rawStudents.length === 0;
  const activeFilters = [q, filterClassId].filter(Boolean).length;

  const handleNavigate = useCallback(
    (id: string) => router.push(`/teacher/students/${id}`),
    [router]
  );

  const handleEdit = useCallback(
    (id: string) => router.push(`/teacher/students/${id}/edit`),
    [router]
  );

  return (
    <div>
      <PageHeader
        title="Students"
        description="View students on your timetable and their profiles."
      />

      <WorkspaceToolbar>
        <WorkspaceToolbar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search by name or admission number…"
        />
        <WorkspaceToolbar.Filter
          label="Filter by class"
          value={filterClassId}
          options={[
            { value: "", label: "All classes" },
            ...rawClasses.map((c) => ({ value: c.id, label: c.name })),
          ]}
          onChange={setFilterClassId}
        />
        {activeFilters > 0 && (
          <button
            type="button"
            className="text-sm text-teal hover:text-teal/80 transition-colors"
            onClick={() => { setSearch(""); setFilterClassId(""); }}
          >
            Clear filters
          </button>
        )}
        <WorkspaceToolbar.Actions>
          <WorkspaceToolbar.ResultCount
            count={visibleStudents.length}
            total={students.length}
            label="student"
          />
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {showLoading ? (
        <SkeletonTable rows={8} cols={4} hasAvatar />
      ) : visibleStudents.length === 0 ? (
        <EmptyState
          message={q || filterClassId ? "No students match your search." : "No students found."}
        />
      ) : useVirtual ? (
        <div
          ref={parentRef}
          className="bg-white border border-line rounded-xl overflow-auto shadow-sm"
          style={{ height: "65vh" }}
        >
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <thead className="sticky top-0 z-10">{TABLE_HEADER}</thead>
          </table>
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const s = visibleStudents[virtualItem.index];
              return (
                <div
                  key={s.id}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: `${virtualItem.size}px`, transform: `translateY(${virtualItem.start}px)` }}
                >
                  <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                    <tbody>
                      <StudentRow
                        s={s}
                        className={classMap.get(s.classId)?.name ?? ""}
                        onNavigate={handleNavigate}
                        onEdit={handleEdit}
                        canEdit={!!classTeacherOfId && s.classId === classTeacherOfId}
                      />
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="sticky top-0 z-10">{TABLE_HEADER}</thead>
              <tbody>
                {visibleStudents.map((s) => (
                  <StudentRow
                    key={s.id}
                    s={s}
                    className={classMap.get(s.classId)?.name ?? ""}
                    onNavigate={handleNavigate}
                    onEdit={handleEdit}
                    canEdit={!!classTeacherOfId && s.classId === classTeacherOfId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
