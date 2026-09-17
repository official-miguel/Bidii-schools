"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldAlert, Plus, Filter, X, Users, Lock, Search } from "lucide-react";
import QuickIncidentModal from "./QuickIncidentModal";
import { fetchAllStudents } from "@/lib/utils/fetchAllStudents";
import {
  Avatar,
  DisciplineRecord,
  StudentLite,
  Skeleton,
  StatCard,
  formatCreator,
  fmtDate,
  offenceIcon,
} from "./shared";

type ClassLite = { id: string; name: string; form: number; stream?: string | null };

const selectClass =
  "rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function EmptyBlock({
  text,
  action,
}: {
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-4 py-16 text-center">
      <ShieldAlert className="h-10 w-10 text-slate/30 mx-auto mb-3" aria-hidden />
      <p className="text-sm text-slate">{text}</p>
      {action && (
        <button
          type="button"
          className="mt-4 text-sm px-4 py-2 rounded-lg bg-teal text-white hover:bg-teal-dark transition-colors"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ── Parent-visibility pill ─────────────────────────────────────────────── */
function VisibilityPill({ visible }: { visible: boolean }) {
  return visible ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-royal-50 text-royal">
      <Users className="h-3 w-3" /> Parent notified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-line text-slate">
      <Lock className="h-3 w-3" /> Staff only
    </span>
  );
}

/* ── Incident row ────────────────────────────────────────────────────────── */
const IncidentRow = memo(function IncidentRow({
  record,
  caseHrefBase,
}: {
  record: DisciplineRecord;
  caseHrefBase?: string;
}) {
  const icon = offenceIcon(record.offence + " " + (record.aiSummary || ""));
  const createdByName = formatCreator(record.recordedBy);
  const caseHref = caseHrefBase ? `${caseHrefBase}/${record.id}` : null;

  return (
    <li>
      <div className="relative bg-card border border-border rounded-xl px-4 py-3.5 hover:border-teal/30 hover:shadow-sm transition-all flex items-start gap-3 group">

        {/* Entire-row link to case page (sits behind everything) */}
        {caseHref && (
          <Link href={caseHref} className="absolute inset-0 rounded-xl cursor-pointer" aria-label={`Open case: ${record.offence}`} />
        )}

        {/* Offence icon */}
        <span
          className="relative mt-0.5 w-9 h-9 rounded-lg bg-danger-bg/50 flex items-center justify-center text-base shrink-0"
          aria-hidden
        >
          {icon}
        </span>

        {/* Main info */}
        <div className="relative min-w-0 flex-1 z-10">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{record.offence}</span>
            <VisibilityPill visible={record.isVisibleToParent} />
            {record._count.files > 0 && (
              <span className="text-xs text-slate" title={`${record._count.files} attachment(s)`}>
                📎 {record._count.files}
              </span>
            )}
            {record._count.caseNotes > 0 && (
              <span className="text-xs text-slate" title={`${record._count.caseNotes} note(s)`}>
                💬 {record._count.caseNotes}
              </span>
            )}
          </div>
          {record.aiSummary && (
            <p className="text-xs text-royal mt-0.5 truncate">✨ {record.aiSummary}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* Student name — links to their profile, sits above the row link */}
            <Link
              href={`/principal/students/${record.student.id}`}
              className="relative flex items-center gap-1.5 hover:opacity-80 transition-opacity z-10"
              title="View student profile"
              onClick={(e) => e.stopPropagation()}
            >
              <Avatar name={record.student.fullName} size="sm" />
              <span className="text-xs font-medium text-foreground">{record.student.fullName}</span>
              <span className="text-xs text-slate font-mono">{record.student.admissionNumber}</span>
            </Link>
            {record.student.schoolClass && (
              <span className="text-xs text-slate">· {record.student.schoolClass.name}</span>
            )}
            {createdByName && (
              <span className="text-xs text-slate/60">· by {createdByName}</span>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="relative flex flex-col items-end gap-2 shrink-0 z-10">
          <span className="text-xs text-slate">{fmtDate(record.dateOfOffence)}</span>
        </div>
      </div>
    </li>
  );
});

/* ── Main export ─────────────────────────────────────────────────────────── */
export default function DisciplineDashboard({
  canManage,
  caseHrefBase,
}: {
  canManage: boolean;
  caseHrefBase?: string;
}) {
  const [records, setRecords]   = useState<DisciplineRecord[] | null>(null);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [classes, setClasses]   = useState<ClassLite[]>([]);

  const [search, setSearch]     = useState("");
  const q = useDebounced(search.trim().toLowerCase(), 250);
  const [classId, setClassId]   = useState("");
  const [stream, setStream]     = useState("");
  const [visibility, setVisibility] = useState(""); // "" | "parent" | "staff"
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [hasFiles, setHasFiles] = useState(false);
  const [hasAi, setHasAi]       = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [incidentModal, setIncidentModal]       = useState<{ studentId?: string } | null>(null);
  const [refreshKey, setRefreshKey]             = useState(0);

  const load = useCallback(async () => {
    await Promise.all([
      fetchAllStudents().then((data) => {
        setStudents(
          data.map((s) => {
            const st = s as StudentLite;
            return {
              id: st.id,
              fullName: st.fullName,
              admissionNumber: st.admissionNumber,
              schoolClass: st.schoolClass || null,
            };
          })
        );
      }),
      fetch("/api/classes").then(async (r) => {
        if (r.ok) setClasses(await r.json());
      }),
      fetch("/api/discipline").then(async (r) => {
        setRecords(r.ok ? await r.json() : []);
      }),
    ]);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const loading = records === null;

  const streams = useMemo(() => {
    const set = new Set<string>();
    classes.forEach((c) => c.stream && set.add(c.stream));
    return [...set].sort();
  }, [classes]);

  const matchesStudent = useCallback(
    (s: StudentLite) => {
      if (classId && s.schoolClass?.id !== classId) return false;
      if (stream && s.schoolClass?.stream !== stream) return false;
      return true;
    },
    [classId, stream]
  );

  const inDateRange = useCallback(
    (d: string) => {
      const day = d.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    },
    [dateFrom, dateTo]
  );

  const stats = useMemo(() => {
    const parentNotified = records?.filter((r) => r.isVisibleToParent).length ?? 0;
    return { total: records?.length ?? 0, parentNotified, staffOnly: (records?.length ?? 0) - parentNotified };
  }, [records]);

  const filtered = useMemo(() => {
    if (!records) return [];
    return records
      .filter((r) => {
        if (!matchesStudent(r.student)) return false;
        if (visibility === "parent" && !r.isVisibleToParent) return false;
        if (visibility === "staff" && r.isVisibleToParent) return false;
        if (!inDateRange(r.dateOfOffence)) return false;
        if (hasFiles && r._count.files === 0) return false;
        if (hasAi && !r.aiSummary) return false;
        if (q) {
          const hay =
            `${r.student.fullName} ${r.student.admissionNumber} ${r.student.schoolClass?.name || ""} ${r.offence} ${r.description || ""} ${r.aiSummary || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.dateOfOffence.localeCompare(a.dateOfOffence));
  }, [records, q, visibility, matchesStudent, inDateRange, hasFiles, hasAi]);

  const activeFilters = !!(classId || stream || visibility || dateFrom || dateTo || hasFiles || hasAi);

  function clearFilters() {
    setClassId(""); setStream(""); setVisibility("");
    setDateFrom(""); setDateTo("");
    setHasFiles(false); setHasAi(false);
  }

  function saved() {
    setIncidentModal(null);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xs:grid-cols-3 gap-3 mb-6">
        <StatCard
          label="Total cases"
          value={stats.total}
          icon={<ShieldAlert className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          label="Parent notified"
          value={stats.parentNotified}
          icon={<Users className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          label="Staff only"
          value={stats.staffOnly}
          icon={<Lock className="h-5 w-5" />}
          loading={loading}
        />
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-3 mb-5 space-y-3">
        <div className="flex gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" aria-hidden />
            <input
              className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-slate focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
              placeholder="Search by student, admission no., offence, or AI summary…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search discipline cases"
            />
          </div>

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              showFilters || activeFilters
                ? "border-teal bg-teal/5 text-teal"
                : "border-border text-slate hover:text-foreground hover:border-slate/40"
            }`}
          >
            <Filter className="h-4 w-4" aria-hidden />
            Filters
            {activeFilters && (
              <span className="ml-0.5 h-4 w-4 rounded-full bg-teal text-white text-[9px] font-bold flex items-center justify-center">
                !
              </span>
            )}
          </button>

          {/* Record incident */}
          {canManage && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-dark transition-colors shrink-0"
              onClick={() => setIncidentModal({})}
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Record Incident</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}
        </div>

        {/* Expandable filter row */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
            <select
              className={selectClass}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              aria-label="Filter by class"
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {streams.length > 0 && (
              <select
                className={selectClass}
                value={stream}
                onChange={(e) => setStream(e.target.value)}
                aria-label="Filter by stream"
              >
                <option value="">All streams</option>
                {streams.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}

            <select
              className={selectClass}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              aria-label="Filter by parent visibility"
            >
              <option value="">Any visibility</option>
              <option value="parent">Parent notified</option>
              <option value="staff">Staff only</option>
            </select>

            <input
              type="date"
              className={selectClass}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
            />
            <span className="text-xs text-slate">to</span>
            <input
              type="date"
              className={selectClass}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
            />

            <label className="flex items-center gap-1.5 text-xs text-slate cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasFiles}
                onChange={(e) => setHasFiles(e.target.checked)}
              />
              Has attachments
            </label>

            <label className="flex items-center gap-1.5 text-xs text-slate cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasAi}
                onChange={(e) => setHasAi(e.target.checked)}
              />
              Has AI summary
            </label>

            {activeFilters && (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-xs text-royal hover:underline"
                onClick={clearFilters}
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Result count */}
      {!loading && (
        <p className="text-xs text-slate mb-3 px-0.5">
          {filtered.length === 0
            ? "No cases"
            : `${filtered.length} case${filtered.length !== 1 ? "s" : ""}`}
          {activeFilters || q ? " matching current filters" : ""}
        </p>
      )}

      {/* ── Case list ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyBlock
          text={
            q || activeFilters
              ? "No discipline cases match your search or filters."
              : "No discipline cases recorded yet."
          }
          action={
            canManage && !q && !activeFilters
              ? { label: "Record First Incident", onClick: () => setIncidentModal({}) }
              : undefined
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((r) => (
            <IncidentRow
              key={r.id}
              record={r}
              caseHrefBase={caseHrefBase}
            />
          ))}
        </ul>
      )}

      {/* ── Quick incident modal ─────────────────────────────────────────── */}
      {incidentModal && (
        <QuickIncidentModal
          students={students}
          initialStudentId={incidentModal.studentId}
          onClose={() => setIncidentModal(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
