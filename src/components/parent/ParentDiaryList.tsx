"use client";

/**
 * ParentDiaryList
 *
 * Parent-facing diary feed. Shows diary entries for a single child with
 * filter tabs, expandable cards, and mark-as-read on expand.
 */

import { useState, useCallback } from "react";
import {
  ChevronDown, ChevronUp,
  CheckCircle2, Clock, AlertTriangle,
  FileText, BookOpen, RotateCcw, FolderOpen, Megaphone,
  BookMarked, Calendar, User, AlignLeft, Inbox,
  ClipboardCheck, PartyPopper, NotebookPen,
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
  label:   string;
  Icon:    React.ElementType;
  badge:   string;
}> = {
  ASSIGNMENT:   { label: "Assignment",   Icon: FileText,   badge: "bg-info/10 text-info" },
  HOMEWORK:     { label: "Homework",     Icon: BookOpen,   badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400" },
  REVISION:     { label: "Revision",     Icon: RotateCcw,  badge: "bg-warn-bg text-warn" },
  PROJECT:      { label: "Project",      Icon: FolderOpen, badge: "bg-success-bg text-success" },
  ANNOUNCEMENT: { label: "Announcement", Icon: Megaphone,  badge: "bg-slate/10 text-slate dark:bg-dark-border dark:text-dark-muted" },
};

// ---------------------------------------------------------------------------
// Pure helpers
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
  const diffMs   = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / 86_400_000);

  if (diffDays === 0)  return "Due today";
  if (diffDays === 1)  return "Due tomorrow";
  if (diffDays === -1) return "Due yesterday";
  if (diffDays < 0)    return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? "s" : ""}`;
  return `Due ${due.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}`;
}

function formatPostedDate(dateStr: string): string {
  const d    = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7)   return `${days} days ago`;
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ParentDiaryList({ entries, studentId }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [readIds,      setReadIds]       = useState<Set<string>>(new Set());

  const filtered = entries.filter((entry) => {
    const eff = effectiveStatus(getStoredStatus(entry.recipients), entry.dueDate);
    switch (activeFilter) {
      case "pending":   return eff === "PENDING" || eff === "OVERDUE";
      case "due-soon":  return isDueSoon(entry.dueDate);
      case "completed": return eff === "COMPLETED";
      default:          return true;
    }
  });

  const handleExpand = useCallback((id: string) => {
    const isOpening = expandedId !== id;
    setExpandedId(isOpening ? id : null);

    if (isOpening && !readIds.has(id)) {
      setReadIds((prev) => new Set(prev).add(id));
      fetch(`/api/parent/diary/${id}/read?studentId=${studentId}`, {
        method: "PATCH",
      }).catch(() => {/* non-fatal */});
    }
  }, [expandedId, readIds, studentId]);

  const counts: Record<FilterKey, number> = {
    all: entries.length,
    pending: entries.filter((e) => {
      const eff = effectiveStatus(getStoredStatus(e.recipients), e.dueDate);
      return eff === "PENDING" || eff === "OVERDUE";
    }).length,
    "due-soon": entries.filter((e) => isDueSoon(e.dueDate)).length,
    completed: entries.filter((e) =>
      effectiveStatus(getStoredStatus(e.recipients), e.dueDate) === "COMPLETED"
    ).length,
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
        <div className="space-y-2">
          {filtered.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              isRead={readIds.has(entry.id)}
              onToggle={() => handleExpand(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry card
// ---------------------------------------------------------------------------

function EntryCard({
  entry,
  expanded,
  isRead,
  onToggle,
}: {
  entry:    DiaryEntryWithExtras;
  expanded: boolean;
  isRead:   boolean;
  onToggle: () => void;
}) {
  const stored   = getStoredStatus(entry.recipients);
  const eff      = effectiveStatus(stored, entry.dueDate);
  const cfg      = ENTRY_TYPE_CONFIG[entry.entryType] ?? ENTRY_TYPE_CONFIG.ASSIGNMENT;
  const hasDesc  = !!entry.description;
  const isUnread = !isRead && stored === "PENDING";

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-shadow
        ${expanded
          ? "bg-card dark:bg-dark-surface border-teal/30 shadow-sm dark:border-teal/20"
          : "bg-card dark:bg-dark-surface border-line dark:border-dark-border shadow-xs hover:shadow-sm hover:border-teal/20 dark:hover:border-teal/20"
        }`}
    >
      {/* Clickable header */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3.5 flex items-start gap-3"
        aria-expanded={expanded}
      >
        {/* Status indicator column */}
        <div className="mt-0.5 shrink-0 w-16 flex flex-col items-start gap-1">
          <StatusBadge status={eff} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Top line: type badge + unread dot */}
          <div className="flex items-center gap-1.5 mb-1">
            {isUnread && (
              <span className="w-1.5 h-1.5 rounded-full bg-info shrink-0" aria-label="Unread" />
            )}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.badge}`}>
              <cfg.Icon className="h-3 w-3" aria-hidden="true" />
              {cfg.label}
            </span>
            {entry.subject && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal/10 text-teal">
                {entry.subject.name}
              </span>
            )}
          </div>

          {/* Title */}
          <p className="text-sm font-semibold text-ink dark:text-dark-text leading-snug pr-2">
            {entry.title}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
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
            {hasDesc && !expanded && (
              <span className="inline-flex items-center gap-1 text-xs text-slate dark:text-dark-muted">
                <AlignLeft className="h-3 w-3" aria-hidden="true" />
                Has instructions
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <div className="shrink-0 text-slate dark:text-dark-muted mt-1">
          {expanded
            ? <ChevronUp className="h-4 w-4" />
            : <ChevronDown className="h-4 w-4" />
          }
        </div>
      </button>

      {/* Expanded description */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-line dark:border-dark-border">
          {hasDesc ? (
            <p className="text-sm text-ink dark:text-dark-text whitespace-pre-wrap leading-relaxed mt-3">
              {entry.description}
            </p>
          ) : (
            <p className="text-sm text-slate dark:text-dark-muted italic mt-3">
              No additional instructions provided.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: "PENDING" | "COMPLETED" | "OVERDUE" }) {
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Done
      </span>
    );
  }
  if (status === "OVERDUE") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warn">
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      Pending
    </span>
  );
}

// ---------------------------------------------------------------------------
// Due date chip
// ---------------------------------------------------------------------------

function DueDateChip({
  dueDate,
  status,
}: {
  dueDate: string;
  status:  "PENDING" | "COMPLETED" | "OVERDUE";
}) {
  const due        = new Date(dueDate);
  const now        = new Date();
  const isToday    = due.toDateString() === now.toDateString();
  const tmrw       = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
  const isTomorrow = due.toDateString() === tmrw.toDateString();

  if (status === "OVERDUE") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-danger font-medium">
        <Calendar className="h-3 w-3" aria-hidden="true" />
        {formatDueDate(dueDate)}
      </span>
    );
  }
  if (isToday) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-warn">
        <Calendar className="h-3 w-3" aria-hidden="true" />
        Due today
      </span>
    );
  }
  if (isTomorrow) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-warn">
        <Calendar className="h-3 w-3" aria-hidden="true" />
        Due tomorrow
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate dark:text-dark-muted">
      <Calendar className="h-3 w-3" aria-hidden="true" />
      {formatDueDate(dueDate)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Filter empty states — icons only, no emojis
// ---------------------------------------------------------------------------

const FILTER_EMPTY_CONFIG: Record<FilterKey, {
  Icon:    React.ElementType;
  iconCls: string;
  bgCls:   string;
  title:   string;
  body:    string;
}> = {
  all: {
    Icon:    NotebookPen,
    iconCls: "text-teal",
    bgCls:   "bg-teal/10",
    title:   "No diary entries",
    body:    "There are no entries for this child yet.",
  },
  pending: {
    Icon:    ClipboardCheck,
    iconCls: "text-success",
    bgCls:   "bg-success-bg",
    title:   "All caught up!",
    body:    "There are no pending assignments or homework.",
  },
  "due-soon": {
    Icon:    Calendar,
    iconCls: "text-info",
    bgCls:   "bg-info/10",
    title:   "Nothing due soon",
    body:    "No assignments or homework due in the next 7 days.",
  },
  completed: {
    Icon:    PartyPopper,
    iconCls: "text-success",
    bgCls:   "bg-success-bg",
    title:   "No completed items",
    body:    "Nothing has been marked as completed yet.",
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

// Re-export unused imports to keep file clean
void BookMarked;
void Inbox;
