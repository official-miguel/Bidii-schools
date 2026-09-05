"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, Clock, AlertCircle, Search, ChevronDown,
  Edit2, Trash2, X, Loader2, Users,
} from "lucide-react";

type DiaryEntry = {
  id:          string;
  title:        string;
  entryType:    string;
  description?: string | null;
  dueDate?:     string | null;
  createdAt:    string;
  updatedAt:    string;
  subject:      { name: string; code: string };
  targets:      { schoolClass: { id: string; name: string } }[];
};

type Recipient = {
  id:                string;
  studentId:         string;
  parentStatus:      string;
  parentCompletedAt?: string | null;
  resolvedStatus:    "PENDING" | "COMPLETED" | "OVERDUE";
  student: { id: string; fullName: string; admissionNumber: string };
};

type Stats = { COMPLETED: number; PENDING: number; OVERDUE: number; total: number };

const STATUS_CONFIG = {
  COMPLETED: { label: "Parent checked",  color: "text-success", dot: "bg-success" },
  PENDING:   { label: "Pending",          color: "text-warn",    dot: "bg-warn"    },
  OVERDUE:   { label: "Overdue",          color: "text-danger",  dot: "bg-danger"  },
} as const;

const TYPE_LABELS: Record<string, string> = {
  ASSIGNMENT: "Assignment", HOMEWORK: "Homework", REVISION: "Revision",
  PROJECT: "Project", ANNOUNCEMENT: "Announcement",
};

function wasEdited(entry: DiaryEntry): boolean {
  return new Date(entry.updatedAt).getTime() - new Date(entry.createdAt).getTime() > 60_000;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface EntryDetailClientProps {
  entry: DiaryEntry;
}

export default function EntryDetailClient({ entry }: EntryDetailClientProps) {
  const router = useRouter();

  const [recipients,   setRecipients]   = useState<Recipient[]>([]);
  const [stats,        setStats]        = useState<Stats>({ COMPLETED: 0, PENDING: 0, OVERDUE: 0, total: 0 });
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [nextCursor,   setNextCursor]   = useState<string | null>(null);
  const [loadingMore,  setLoadingMore]  = useState(false);

  // Edit state
  const [editOpen,    setEditOpen]    = useState(false);
  const [editTitle,   setEditTitle]   = useState(entry.title);
  const [editDesc,    setEditDesc]    = useState(entry.description ?? "");
  const [editDueDate, setEditDueDate] = useState(entry.dueDate ? entry.dueDate.split("T")[0] : "");
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState<string | null>(null);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting,      setDeleting]      = useState(false);

  const fetchRecipients = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams();
    if (search)       params.set("q",      search);
    if (statusFilter) params.set("status", statusFilter);
    if (cursor)       params.set("cursor", cursor);

    const res = await fetch(`/api/diary/${entry.id}/recipients?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    setStats(data.stats);
    if (cursor) {
      setRecipients((prev) => [...prev, ...data.recipients]);
    } else {
      setRecipients(data.recipients);
    }
    setNextCursor(res.headers.get("X-Next-Cursor"));
  }, [entry.id, search, statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchRecipients().finally(() => setLoading(false));
  }, [fetchRecipients]);

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setEditSaving(true);
    const res = await fetch(`/api/diary/${entry.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        title:       editTitle.trim(),
        description: editDesc.trim() || null,
        dueDate:     editDueDate ? `${editDueDate}T23:59:00+03:00` : null,
      }),
    });
    setEditSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setEditError(d.error ?? "Failed to save changes.");
      return;
    }
    setEditOpen(false);
    router.refresh();
  };

  const handleDelete = async () => {
    setDeleting(true);
    await fetch(`/api/diary/${entry.id}`, { method: "DELETE" });
    router.push("/teacher/diary");
  };

  const classNames = entry.targets.map((t) => t.schoolClass.name).join(", ");
  const edited     = wasEdited(entry);

  return (
    <div className="space-y-6">
      {/* Entry header card */}
      <div className="bg-card border border-line rounded-2xl p-6 shadow-xs dark:bg-dark-surface dark:border-dark-border">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted">
              {TYPE_LABELS[entry.entryType] ?? entry.entryType}
            </p>
            <h1 className="mt-1 text-xl font-bold text-ink dark:text-dark-text leading-snug">
              {entry.title}
            </h1>
            <p className="mt-1 text-sm text-slate dark:text-dark-muted">
              {entry.subject.name}
              {classNames ? ` · ${classNames}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEditOpen(true)}
              className="p-2 rounded-lg text-slate hover:bg-line dark:text-dark-muted dark:hover:bg-dark-border min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Edit entry"
            >
              <Edit2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="p-2 rounded-lg text-slate hover:bg-danger-bg hover:text-danger dark:text-dark-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Delete entry"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate dark:text-dark-muted">
          <span>Posted {relativeTime(entry.createdAt)}</span>
          {entry.dueDate && entry.entryType !== "ANNOUNCEMENT" && (
            <span>Due {new Date(entry.dueDate).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}</span>
          )}
          {edited && <span className="text-info">Edited {relativeTime(entry.updatedAt)}</span>}
        </div>

        {entry.description && (
          <p className="mt-4 text-sm text-ink dark:text-dark-text whitespace-pre-wrap leading-relaxed">
            {entry.description}
          </p>
        )}
      </div>

      {/* Completion stats — based on parent check */}
      <div className="grid grid-cols-3 gap-3">
        {(["COMPLETED", "PENDING", "OVERDUE"] as const).map((s) => {
          const cfg   = STATUS_CONFIG[s];
          const count = stats[s] ?? 0;
          return (
            <div key={s} className="bg-card border border-line rounded-xl p-4 shadow-xs dark:bg-dark-surface dark:border-dark-border text-center">
              <p className={`text-2xl font-bold ${cfg.color}`}>{count}</p>
              <p className="text-xs text-slate dark:text-dark-muted mt-0.5">
                {s === "COMPLETED" ? "Parent checked" : cfg.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* Student list — read-only, shows parent confirmation */}
      <div className="bg-card border border-line rounded-2xl shadow-xs dark:bg-dark-surface dark:border-dark-border">
        <div className="p-4 border-b border-line dark:border-dark-border">
          {/* Header label */}
          <p className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted mb-3">
            Parent confirmations
          </p>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search student…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-paper border border-line dark:bg-dark-bg dark:border-dark-border rounded-lg text-sm text-ink dark:text-dark-text placeholder:text-slate focus:outline-none focus:ring-2 focus:ring-teal/30 min-h-[40px]"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none pl-3 pr-7 py-2 bg-paper border border-line dark:bg-dark-bg dark:border-dark-border rounded-lg text-sm text-ink dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-teal/30 min-h-[40px]"
                aria-label="Filter by status"
              >
                <option value="">All</option>
                <option value="COMPLETED">Parent checked</option>
                <option value="PENDING">Pending</option>
                <option value="OVERDUE">Overdue</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate pointer-events-none dark:text-dark-muted" aria-hidden="true" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 bg-line dark:bg-dark-border rounded-lg animate-shimmer" />
              ))}
            </div>
          </div>
        ) : recipients.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="h-8 w-8 text-slate dark:text-dark-muted mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-slate dark:text-dark-muted">
              {search || statusFilter ? "No students match this filter." : "No recipients yet."}
            </p>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-line dark:divide-dark-border">
            {recipients.map((r) => {
              const cfg       = STATUS_CONFIG[r.resolvedStatus] ?? STATUS_CONFIG.PENDING;
              const isChecked = r.resolvedStatus === "COMPLETED";
              return (
                <li key={r.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  {/* Student info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{r.student.fullName}</p>
                      <p className="text-xs text-slate dark:text-dark-muted">{r.student.admissionNumber}</p>
                    </div>
                  </div>

                  {/* Read-only parent-check indicator */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium ${cfg.color}`}>
                      {isChecked ? "Parent checked" : cfg.label}
                    </span>
                    {/* Static circle — no onClick, purely visual */}
                    <span
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center
                        ${isChecked
                          ? "border-success bg-success text-white"
                          : "border-line dark:border-dark-border"
                        }`}
                      aria-label={isChecked ? `${r.student.fullName} — confirmed by parent` : `${r.student.fullName} — not yet confirmed`}
                      role="img"
                    >
                      {isChecked && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {nextCursor && (
          <div className="p-4 text-center border-t border-line dark:border-dark-border">
            <button
              onClick={async () => {
                setLoadingMore(true);
                await fetchRecipients(nextCursor);
                setLoadingMore(false);
              }}
              disabled={loadingMore}
              className="text-sm text-teal hover:underline disabled:opacity-60 min-h-[44px]"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Edit Entry">
          <div className="absolute inset-0 bg-ink/40 dark:bg-black/60" onClick={() => setEditOpen(false)} aria-hidden="true" />
          <div className="relative z-10 w-full max-w-lg bg-card dark:bg-dark-surface rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-ink dark:text-dark-text">Edit Entry</h2>
              <button onClick={() => setEditOpen(false)} className="p-2 rounded-lg text-slate hover:bg-line min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label htmlFor="edit-title" className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted block mb-1">Title</label>
                <input id="edit-title" type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={255}
                  className="w-full bg-card border border-line dark:border-dark-border dark:bg-dark-surface rounded-lg px-3 py-2.5 text-sm text-ink dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-teal/30 min-h-[44px]" />
              </div>
              <div>
                <label htmlFor="edit-desc" className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted block mb-1">Instructions</label>
                <textarea id="edit-desc" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4}
                  className="w-full bg-card border border-line dark:border-dark-border dark:bg-dark-surface rounded-lg px-3 py-2.5 text-sm text-ink dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-teal/30 resize-y" />
              </div>
              {entry.entryType !== "ANNOUNCEMENT" && (
                <div>
                  <label htmlFor="edit-due" className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted block mb-1">Due Date</label>
                  <input id="edit-due" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full bg-card border border-line dark:border-dark-border dark:bg-dark-surface rounded-lg px-3 py-2.5 text-sm text-ink dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-teal/30 min-h-[44px]" />
                </div>
              )}
              {editError && <p className="text-xs text-danger">{editError}</p>}
              <button type="submit" disabled={editSaving}
                className="w-full bg-teal text-white rounded-xl py-3 text-sm font-semibold hover:bg-teal-dark disabled:opacity-60 transition-colors min-h-[52px] flex items-center justify-center gap-2">
                {editSaving ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…</> : "Save Changes"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Confirm Delete">
          <div className="absolute inset-0 bg-ink/40 dark:bg-black/60" onClick={() => setDeleteConfirm(false)} aria-hidden="true" />
          <div className="relative z-10 w-full max-w-sm bg-card dark:bg-dark-surface rounded-2xl shadow-xl p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-danger-bg flex items-center justify-center mx-auto mb-3">
              <Trash2 className="h-5 w-5 text-danger" aria-hidden="true" />
            </div>
            <h2 className="font-semibold text-ink dark:text-dark-text">Delete this entry?</h2>
            <p className="text-sm text-slate dark:text-dark-muted mt-1">Students and parents will no longer see it.</p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDeleteConfirm(false)}
                className="flex-1 border border-line dark:border-dark-border rounded-xl py-2.5 text-sm font-medium text-slate hover:bg-line dark:text-dark-muted dark:hover:bg-dark-border min-h-[44px]">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-danger text-white rounded-xl py-2.5 text-sm font-medium hover:bg-danger/90 disabled:opacity-60 min-h-[44px] flex items-center justify-center gap-1.5">
                {deleting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Deleting…</> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
