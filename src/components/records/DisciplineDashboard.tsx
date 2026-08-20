"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldAlert, Plus, Filter, X, CheckCircle2, AlertCircle, Search } from "lucide-react";
import QuickIncidentModal from "./QuickIncidentModal";
import { fetchAllStudents } from "@/lib/utils/fetchAllStudents";
import {
  Avatar,
  DisciplineRecord,
  StudentLite,
  STATUS_BADGE,
  STATUS_LABELS,
  Skeleton,
  StatCard,
  formatCreator,
  fmtDate,
  offenceIcon,
} from "./shared";

type ClassLite = { id: string; name: string; form: number; stream?: string | null };

const selectClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

const STATUS_ORDER: Record<string, number> = {
  OPEN: 0, UNDER_REVIEW: 1, ESCALATED: 2, RESOLVED: 3,
};

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
    <div className="rounded-xl border border-dashed border-line bg-card px-4 py-16 text-center">
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

/* ── Close Case Modal ───────────────────────────────────────────────────── */
function CloseCaseModal({
  record,
  onClose,
  onClosed,
}: {
  record: DisciplineRecord;
  onClose: () => void;
  onClosed: (updated: DisciplineRecord) => void;
}) {
  const [actionTaken, setActionTaken] = useState(record.actionTaken ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionTaken.trim()) {
      setError("Please describe the action taken before closing.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/discipline/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED", actionTaken: actionTaken.trim() }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Could not close case.");
        return;
      }
      const updated = await res.json() as DisciplineRecord;
      onClosed({ ...record, ...updated });
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card rounded-2xl shadow-2xl border border-line overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-line">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-success-bg flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 text-success" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Close Case</p>
              <p className="text-xs text-slate truncate max-w-[260px]">
                {record.offence} — {record.student.fullName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded-lg text-slate hover:text-ink hover:bg-line transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate mb-1.5">
              Action taken <span className="text-danger">*</span>
            </label>
            <textarea
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              rows={4}
              placeholder="Describe what action was taken to resolve this case…"
              className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-slate/60 focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 resize-none dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
              autoFocus
            />
          </div>
          {error && (
            <p className="text-xs text-danger bg-danger-bg/50 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-success text-white text-sm font-semibold px-4 py-2.5 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {saving ? "Closing…" : "Close Case"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg border border-line text-sm font-medium px-4 py-2.5 text-ink hover:bg-paper transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Status badge pill ──────────────────────────────────────────────────── */
function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        STATUS_BADGE[status] ?? "bg-line text-slate"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ── Incident row ────────────────────────────────────────────────────────── */
const IncidentRow = memo(function IncidentRow({
  record,
  caseHrefBase,
  canManage,
  onCloseCase,
}: {
  record: DisciplineRecord;
  caseHrefBase?: string;
  canManage: boolean;
  onCloseCase: (r: DisciplineRecord) => void;
}) {
  const icon = offenceIcon(record.offence + " " + (record.aiSummary || ""));
  const isOpen = record.status === "OPEN" || record.status === "UNDER_REVIEW";
  const createdByName = formatCreator(record.recordedBy);
  const caseHref = caseHrefBase ? `${caseHrefBase}/${record.id}` : null;

  return (
    <li>
      <div className="relative bg-card border border-line rounded-xl px-4 py-3.5 hover:border-teal/30 hover:shadow-sm transition-all flex items-start gap-3 group">

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
            <span className="text-sm font-semibold text-ink">{record.offence}</span>
            <StatusPill status={record.status} />
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
              <span className="text-xs font-medium text-ink">{record.student.fullName}</span>
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
          {canManage && isOpen && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCloseCase(record); }}
              className="text-xs font-medium text-success bg-success-bg hover:bg-success/20 border border-success/20 rounded-md px-2.5 py-1 transition-colors"
            >
              Close case
            </button>
          )}
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
  const [status, setStatus]     = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [hasFiles, setHasFiles] = useState(false);
  const [hasAi, setHasAi]       = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [incidentModal, setIncidentModal]       = useState<{ studentId?: string } | null>(null);
  const [closingRecord, setClosingRecord]       = useState<DisciplineRecord | null>(null);
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
    const open     = records?.filter((r) => r.status === "OPEN").length ?? 0;
    const resolved = records?.filter((r) => r.status === "RESOLVED").length ?? 0;
    return { total: records?.length ?? 0, open, resolved };
  }, [records]);

  const filtered = useMemo(() => {
    if (!records) return [];
    return records
      .filter((r) => {
        if (!matchesStudent(r.student)) return false;
        if (status && r.status !== status) return false;
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
      .sort((a, b) => {
        const so = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (so !== 0) return so;
        return b.dateOfOffence.localeCompare(a.dateOfOffence);
      });
  }, [records, q, status, matchesStudent, inDateRange, hasFiles, hasAi]);

  const activeFilters = !!(classId || stream || status || dateFrom || dateTo || hasFiles || hasAi);

  function clearFilters() {
    setClassId(""); setStream(""); setStatus("");
    setDateFrom(""); setDateTo("");
    setHasFiles(false); setHasAi(false);
  }

  function saved() {
    setIncidentModal(null);
    setRefreshKey((k) => k + 1);
  }

  function handleCaseClosed(updated: DisciplineRecord) {
    setRecords((prev) =>
      prev
        ? prev.map((r) =>
            r.id === updated.id
              ? {
                  ...r,
                  status: updated.status,
                  actionTaken:
                    (updated as unknown as { actionTaken?: string }).actionTaken ??
                    r.actionTaken,
                }
              : r
          )
        : prev
    );
    setClosingRecord(null);
  }

  const handleCloseCase = useCallback((r: DisciplineRecord) => setClosingRecord(r), []);

  return (
    <div>
      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard
          label="Total cases"
          value={stats.total}
          icon={<ShieldAlert className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          label="Open"
          value={stats.open}
          icon={<AlertCircle className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          label="Resolved"
          value={stats.resolved}
          icon={<CheckCircle2 className="h-5 w-5" />}
          loading={loading}
        />
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="bg-card border border-line rounded-xl p-3 mb-5 space-y-3">
        <div className="flex gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" aria-hidden />
            <input
              className="w-full rounded-lg border border-line bg-white pl-9 pr-3 py-2 text-sm text-ink placeholder:text-slate focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
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
                : "border-line text-slate hover:text-ink hover:border-slate/40"
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
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/60">
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
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">Any status</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
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
              canManage={canManage}
              onCloseCase={handleCloseCase}
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

      {/* ── Close case modal ─────────────────────────────────────────────── */}
      {closingRecord && (
        <CloseCaseModal
          record={closingRecord}
          onClose={() => setClosingRecord(null)}
          onClosed={handleCaseClosed}
        />
      )}
    </div>
  );
}
