"use client";

/**
 * ParentDiaryList
 *
 * Parent-facing diary feed. Cards are always fully expanded — no tap needed
 * to see instructions. Parents can mark assignments/homework done directly
 * from the card via the mark-complete button.
 */

import { useState, useCallback, useTransition } from "react";
import {
  CheckCircle2, Circle, Clock, AlertTriangle,
  FileText, BookOpen, RotateCcw, FolderOpen, Megaphone,
  Calendar, User, AlignLeft,
  ClipboardCheck, PartyPopper, NotebookPen, Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecipientStatus = "PENDING" | "COMPLETED";

export interface DiaryEntryWithExtras {
  id:          string;
  title:       string;
  description: string | null;
  entryType:   "ASSIGNMENT" | "HOMEWORK" | "REVISION" | "PROJECT" | "ANNOUNCEMENT";
  dueDate:     string | null;
  createdAt:   string;
  subject:     { name: string } | null;
  teacher:     { fullName: string } | null;
  recipients:  { status: RecipientStatus }[];
}

interface Props {
  entries:   DiaryEntryWithExtras[];
  studentId: string;
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

type FilterKey = "all" | "pending" | "due-soon" | "completed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",       label: "All"       },
  { key: "pending",   label: "Pending"   },
  { key: "due-soon",  label: "Due Soon"  },
  { key: "completed", label: "Completed" },
];

// ---------------------------------------------------------------------------
// Entry type config
// ---------------------------------------------------------------------------

const ENTRY_TYPE_CONFIG: Record<string, {
  label: string;
  Icon:  React.ElementType;
  badge: string;
}> = {
  ASSIGNMENT:   { label: "Assignment",   Icon: FileText,   badge: "bg-info/10 text-info" },
  HOMEWORK:     { label: "Homework",     Icon: BookOpen,   badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400" },
  REVISION:     { label: "Revision",     Icon: RotateCcw,  badge: "bg-warn-bg text-warn" },
  PROJECT:      { label: "Project",      Icon: FolderOpen, badge: "bg-success-bg text-success" },
  ANNOUNCEMENT: { label: "Announcement", Icon: Megaphone,  badge: "bg-slate/10 text-slate dark:bg-dark-border dark:text-dark-muted" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStoredStatus(recipients: { status: RecipientStatus }[]): RecipientStatus {
  return recipients[0]?.status ?? "PENDING";
}

function effectiveStatus(
  stored: RecipientStatus,
  dueDate: string | null,
): "PENDING" | "COMPLETED" | "OVERDUE" {
  if (stored === "COMPLETED") return "COMPLETED";
  if (dueDate && new Date() > new Date(dueDate)) return "OVERDUE";
  return "PENDING";
}

function isDueSoon(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const due   = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7   = new Date(today);
  in7.setDate(in7.getDate() + 7);
  in7.setHours(23, 59, 59, 999);
  return due >= today && due <= in7;
}

function formatDueDate(dueDate: string): string {
  const due      = new Date(dueDate);
  const now      = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);

  if (diffDays === 0)  return "Due today";
  if (diffDays === 1)  return "Due tomorrow";
  if (diffDays === -1) return "Due yesterday";
  if (diffDays < 0)    return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? "s" : ""}`;
  return `Due ${due.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}`;
}

function formatPostedDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)   return "Just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7)   return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ParentDiaryList({ entries, studentId }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  // Local status overrides — keyed by entry id, value is the optimistic status
  const [statusOverrides, setStatusOverrides] = useState<Record<string, RecipientStatus>>({});

  // Track which entries have been read (for unread dot)
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Mark an entry as read (fire-and-forget)
  const markRead = useCallback((id: string) => {
    if (readIds.has(id)) return;
    setReadIds((prev) => new Set(prev).add(id));
    fetch(`/api/parent/diary/${id}/read?studentId=${studentId}`, {
      method: "PATCH",
    }).catch(() => {/* non-fatal */});
  }, [readIds, studentId]);

  // Toggle complete status
  const toggleComplete = useCallback(async (entryId: string, currentStored: RecipientStatus) => {
    const optimistic: RecipientStatus = currentStored === "COMPLETED" ? "PENDING" : "COMPLETED";
    setStatusOverrides((prev) => ({ ...prev, [entryId]: optimistic }));
    markRead(entryId);

    try {
      const res = await fetch(
        `/api/parent/diary/${entryId}/complete?studentId=${studentId}`,
        { method: "PATCH" },
      );
      if (!res.ok) {
        // Revert on failure
        setStatusOverrides((prev) => ({ ...prev, [entryId]: currentStored }));
      } else {
        const data: { status: RecipientStatus } = await res.json();
        setStatusOverrides((prev) => ({ ...prev, [entryId]: data.status }));
      }
    } catch {
      setStatusOverrides((prev) => ({ ...prev, [entryId]: currentStored }));
    }
  }, [studentId, markRead]);

  // Resolve the current status for an entry (optimistic override wins)
  const resolveStored = (entry: DiaryEntryWithExtras): RecipientStatus =>
    statusOverrides[entry.id] ?? getStoredStatus(entry.recipients);

  const filtered = entries.filter((entry) => {
    const stored = resolveStored(entry);
    const eff    = effectiveStatus(stored, entry.dueDate);
    switch (activeFilter) {
      case "pending":   return eff === "PENDING" || eff === "OVERDUE";
      case "due-soon":  return isDueSoon(entry.dueDate);
      case "completed": return stored === "COMPLETED";
      default:          return true;
    }
  });

  const counts: Record<FilterKey, number> = {
    all: entries.length,
    pending: entries.filter((e) => {
      const eff = effectiveStatus(resolveStored(e), e.dueDate);
      return eff === "PENDING" || eff === "OVERDUE";
    }).length,
    "due-soon": entries.filter((e) => isDueSoon(e.dueDate)).length,
    completed:  entries.filter((e) => resolveStored(e) === "COMPLETED").length,
  };

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div
        className="flex gap-0 overflow-x-auto border-b border-line dark:border-dark-border"
        role="tablist"
        aria-label="Diary filters"
      >
        {FILTERS.map(({ key, label }) => {
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveFilter(key)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap
                ${isActive
                  ? "text-teal border-b-2 border-teal -mb-px"
                  : "text-slate hover:text-teal dark:text-dark-muted dark:hover:text-teal"
                }`}
            >
              {label}
              {counts[key] > 0 && (
                <span className={`ml-1.5 text-[11px] font-semibold rounded-full px-1.5 py-0.5 ${
                  isActive
                    ? "bg-teal/10 text-teal"
                    : "bg-line text-slate dark:bg-dark-border dark:text-dark-muted"
                }`}>
                  {counts[key]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Entry list or empty state */}
      {filtered.length === 0 ? (
        <FilterEmptyState filter={activeFilter} />
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => {
            const stored = resolveStored(entry);
            return (
              <EntryCard
                key={entry.id}
                entry={entry}
                storedStatus={stored}
                isRead={readIds.has(entry.id)}
                onMarkComplete={() => toggleComplete(entry.id, stored)}
                onView={() => markRead(entry.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry card — always fully expanded, no dropdown
// ---------------------------------------------------------------------------

function EntryCard({
  entry,
  storedStatus,
  isRead,
  onMarkComplete,
  onView,
}: {
  entry:          DiaryEntryWithExtras;
  storedStatus:   RecipientStatus;
  isRead:         boolean;
  onMarkComplete: () => void;
  onView:         () => void;
}) {
  const [pending, startTransition] = useTransition();
  const eff        = effectiveStatus(storedStatus, entry.dueDate);
  const cfg        = ENTRY_TYPE_CONFIG[entry.entryType] ?? ENTRY_TYPE_CONFIG.ASSIGNMENT;
  const isAnnouncement = entry.entryType === "ANNOUNCEMENT";
  const isDone         = storedStatus === "COMPLETED";
  const isUnread       = !isRead && storedStatus === "PENDING";

  // Mark read when the component mounts / becomes visible (passive, no API spam)
  // We rely on the parent calling onView instead.

  const handleComplete = () => {
    startTransition(() => {
      onMarkComplete();
    });
  };

  return (
    <div
      className={`rounded-xl border transition-all
        ${isDone
          ? "bg-card dark:bg-dark-surface border-line dark:border-dark-border opacity-80"
          : eff === "OVERDUE"
            ? "bg-card dark:bg-dark-surface border-danger/25 dark:border-danger/20 shadow-xs"
            : "bg-card dark:bg-dark-surface border-line dark:border-dark-border shadow-xs hover:shadow-sm"
        }`}
      // Mark as read when the parent scrolls past / sees this card
      onMouseEnter={onView}
      onFocus={onView}
    >
      <div className="p-4">
        {/* ── Top row: badges + status ─────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {/* Unread dot */}
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-info shrink-0 mt-0.5" aria-label="New" />
            )}
            {/* Type badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.badge}`}>
              <cfg.Icon className="h-3 w-3" aria-hidden="true" />
              {cfg.label}
            </span>
            {/* Subject badge */}
            {entry.subject && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal/10 text-teal">
                {entry.subject.name}
              </span>
            )}
          </div>

          {/* Status badge */}
          <StatusBadge status={eff} />
        </div>

        {/* ── Title ────────────────────────────────────────────────────── */}
        <p className={`mt-2.5 text-sm font-semibold leading-snug
          ${isDone ? "line-through text-slate dark:text-dark-muted" : "text-ink dark:text-dark-text"}`}
        >
          {entry.title}
        </p>

        {/* ── Meta row ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
          {entry.teacher && (
            <span className="inline-flex items-center gap-1 text-xs text-slate dark:text-dark-muted">
              <User className="h-3 w-3" aria-hidden="true" />
              {entry.teacher.fullName}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-slate dark:text-dark-muted">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatPostedDate(entry.createdAt)}
          </span>
          {entry.dueDate && (
            <DueDateChip dueDate={entry.dueDate} status={eff} />
          )}
        </div>

        {/* ── Instructions — always visible ────────────────────────────── */}
        {entry.description ? (
          <div className="mt-3 pt-3 border-t border-line dark:border-dark-border">
            <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate uppercase tracking-wide dark:text-dark-muted mb-1.5">
              <AlignLeft className="h-3 w-3" aria-hidden="true" />
              Instructions
            </p>
            <p className="text-sm text-ink dark:text-dark-text whitespace-pre-wrap leading-relaxed">
              {entry.description}
            </p>
          </div>
        ) : null}

        {/* ── Mark complete button — not shown for announcements ───────── */}
        {!isAnnouncement && (
          <div className="mt-3 pt-3 border-t border-line dark:border-dark-border flex items-center justify-between gap-3">
            <p className="text-xs text-slate dark:text-dark-muted">
              {isDone ? "Marked as done by parent" : "Has your child completed this?"}
            </p>
            <button
              onClick={handleComplete}
              disabled={pending}
              aria-pressed={isDone}
              aria-label={isDone ? "Mark as not done" : "Mark as done"}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                          transition-all min-h-[36px] disabled:opacity-60
                          ${isDone
                            ? "bg-success-bg text-success hover:bg-success/20"
                            : "bg-line text-slate hover:bg-teal/10 hover:text-teal dark:bg-dark-border dark:text-dark-muted dark:hover:bg-teal/20 dark:hover:text-teal"
                          }`}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Circle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {isDone ? "Done" : "Mark done"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: "PENDING" | "COMPLETED" | "OVERDUE" }) {
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Done
      </span>
    );
  }
  if (status === "OVERDUE") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger shrink-0">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warn shrink-0">
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      Pending
    </span>
  );
}

// ---------------------------------------------------------------------------
// Due date chip
// ---------------------------------------------------------------------------

function DueDateChip({ dueDate, status }: { dueDate: string; status: "PENDING" | "COMPLETED" | "OVERDUE" }) {
  const due        = new Date(dueDate);
  const now        = new Date();
  const tmrw       = new Date(now);
  tmrw.setDate(tmrw.getDate() + 1);
  const isToday    = due.toDateString() === now.toDateString();
  const isTomorrow = due.toDateString() === tmrw.toDateString();

  const cls =
    status === "OVERDUE" ? "text-danger font-medium" :
    isToday || isTomorrow ? "text-warn font-semibold" :
    "text-slate dark:text-dark-muted";

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cls}`}>
      <Calendar className="h-3 w-3" aria-hidden="true" />
      {formatDueDate(dueDate)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Filter empty states
// ---------------------------------------------------------------------------

const FILTER_EMPTY_CONFIG: Record<FilterKey, {
  Icon:    React.ElementType;
  iconCls: string;
  bgCls:   string;
  title:   string;
  body:    string;
}> = {
  all: {
    Icon: NotebookPen, iconCls: "text-teal", bgCls: "bg-teal/10",
    title: "No diary entries", body: "There are no entries for this child yet.",
  },
  pending: {
    Icon: ClipboardCheck, iconCls: "text-success", bgCls: "bg-success-bg",
    title: "All caught up!", body: "There are no pending assignments or homework.",
  },
  "due-soon": {
    Icon: Calendar, iconCls: "text-info", bgCls: "bg-info/10",
    title: "Nothing due soon", body: "No assignments or homework due in the next 7 days.",
  },
  completed: {
    Icon: PartyPopper, iconCls: "text-success", bgCls: "bg-success-bg",
    title: "No completed items", body: "Nothing has been marked as completed yet.",
  },
};

function FilterEmptyState({ filter }: { filter: FilterKey }) {
  const { Icon, iconCls, bgCls, title, body } = FILTER_EMPTY_CONFIG[filter];
  return (
    <div className="bg-card border border-line rounded-xl p-10 text-center dark:bg-dark-surface dark:border-dark-border">
      <div className={`w-12 h-12 rounded-full ${bgCls} flex items-center justify-center mx-auto mb-3`}>
        <Icon className={`h-6 w-6 ${iconCls}`} aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-ink dark:text-dark-text">{title}</p>
      <p className="text-sm text-slate dark:text-dark-muted mt-1">{body}</p>
    </div>
  );
}
