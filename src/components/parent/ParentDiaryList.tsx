"use client";

/**
 * src/components/parent/ParentDiaryList.tsx
 *
 * Renders the parent's view of diary entries for a child.
 *
 * Features:
 * - Filter tabs: All | Pending | Due Soon | Completed
 * - Per-entry: subject badge, type badge, title, teacher, due date with urgency label,
 *   DiaryRecipient status indicator (orange dot = PENDING, green tick = COMPLETED/OVERDUE)
 * - Click to expand description; on expand fires PATCH to mark DiaryNotification read
 * - Empty state per filter tab
 *
 * Requirements: 4.3, 4.4
 */

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, CheckCircle, Clock, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecipientStatus = "PENDING" | "COMPLETED";

export interface DiaryEntryWithExtras {
  id:          string;
  title:       string;
  description: string | null;
  entryType:   "ASSIGNMENT" | "HOMEWORK" | "REVISION" | "PROJECT" | "ANNOUNCEMENT";
  dueDate:     string | null; // ISO string (serialised from Date)
  subject:     { name: string } | null;
  teacher:     { fullName: string } | null;
  recipients:  { status: RecipientStatus }[];
}

interface Props {
  entries:   DiaryEntryWithExtras[];
  studentId: string;
}

// ---------------------------------------------------------------------------
// Filter definition
// ---------------------------------------------------------------------------

type FilterKey = "all" | "pending" | "due-soon" | "completed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",      label: "All"       },
  { key: "pending",  label: "Pending"   },
  { key: "due-soon", label: "Due Soon"  },
  { key: "completed",label: "Completed" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRecipientStatus(recipients: { status: RecipientStatus }[]): RecipientStatus {
  return recipients[0]?.status ?? "PENDING";
}

/** Returns the effective display status, computing OVERDUE dynamically. */
function effectiveStatus(
  storedStatus: RecipientStatus,
  dueDate: string | null,
): "PENDING" | "COMPLETED" | "OVERDUE" {
  if (storedStatus === "COMPLETED") return "COMPLETED";
  if (dueDate && new Date() > new Date(dueDate)) return "OVERDUE";
  return "PENDING";
}

function formatDueDate(dueDate: string): string {
  const due  = new Date(dueDate);
  const now  = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays === -1) return "Due yesterday";
  if (diffDays < 0)   return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? "s" : ""}`;

  return `Due ${due.toLocaleDateString("en-KE", {
    weekday: "short",
    day:     "numeric",
    month:   "short",
  })}`;
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

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const ENTRY_TYPE_STYLES: Record<string, string> = {
  ASSIGNMENT:   "bg-info/10 text-info",
  HOMEWORK:     "bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400",
  REVISION:     "bg-warn-bg text-warn",
  PROJECT:      "bg-success-bg text-success",
  ANNOUNCEMENT: "bg-slate/10 text-slate dark:text-dark-muted",
  // fallback for unknown types
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
  ASSIGNMENT:   "Assignment",
  HOMEWORK:     "Homework",
  REVISION:     "Revision",
  PROJECT:      "Project",
  ANNOUNCEMENT: "Announcement",
};

// Subject pills always use teal per spec (bg-teal/10 text-teal)
function subjectColour(_name: string): string {
  return "bg-teal/10 text-teal";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ParentDiaryList({ entries, studentId }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [readIds,      setReadIds]       = useState<Set<string>>(new Set());

  const filtered = entries.filter((entry) => {
    const status = getRecipientStatus(entry.recipients);
    const eff    = effectiveStatus(status, entry.dueDate);

    switch (activeFilter) {
      case "pending":   return eff === "PENDING" || eff === "OVERDUE";
      case "due-soon":  return isDueSoon(entry.dueDate);
      case "completed": return eff === "COMPLETED";
      default:          return true;
    }
  });

  const handleExpand = useCallback(
    (id: string) => {
      const isOpening = expandedId !== id;
      setExpandedId(isOpening ? id : null);

      // Fire-and-forget mark-as-read when expanding an entry for the first time
      if (isOpening && !readIds.has(id)) {
        setReadIds((prev) => new Set(prev).add(id));
        fetch(`/api/parent/diary/${id}/read?studentId=${studentId}`, {
          method: "PATCH",
        }).catch(() => {/* non-fatal */});
      }
    },
    [expandedId, readIds, studentId],
  );

  // Badge counts for tabs
  const counts: Record<FilterKey, number> = {
    all:       entries.length,
    pending:   entries.filter((e) => {
      const eff = effectiveStatus(getRecipientStatus(e.recipients), e.dueDate);
      return eff === "PENDING" || eff === "OVERDUE";
    }).length,
    "due-soon": entries.filter((e) => isDueSoon(e.dueDate)).length,
    completed:  entries.filter((e) => effectiveStatus(getRecipientStatus(e.recipients), e.dueDate) === "COMPLETED").length,
  };

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-0 overflow-x-auto border-b border-line dark:border-dark-border" role="tablist" aria-label="Diary filters">
        {FILTERS.map(({ key, label }) => {
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveFilter(key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap
                ${isActive
                  ? "text-teal border-b-2 border-teal -mb-px"
                  : "text-slate hover:text-teal dark:text-dark-muted dark:hover:text-teal"
                }`}
            >
              {label}
              {counts[key] > 0 && (
                <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 ${
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

      {/* Entry list */}
      {filtered.length === 0 ? (
        <FilterEmptyState filter={activeFilter} />
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <DiaryEntryCard
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
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

function DiaryEntryCard({
  entry,
  expanded,
  onToggle,
}: {
  entry:    DiaryEntryWithExtras;
  expanded: boolean;
  onToggle: () => void;
}) {
  const storedStatus = getRecipientStatus(entry.recipients);
  const eff          = effectiveStatus(storedStatus, entry.dueDate);

  return (
    <div className="bg-card border border-line rounded-xl shadow-xs overflow-hidden dark:bg-dark-surface dark:border-dark-border">
      {/* Header row — always visible */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-paper dark:hover:bg-dark-surface/80 transition-colors"
        aria-expanded={expanded}
      >
        {/* Status indicator */}
        <div className="mt-0.5 shrink-0">
          <StatusDot status={eff} />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          {/* Top line: subject pill + type badge */}
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {entry.subject && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${subjectColour(entry.subject.name)}`}>
                {entry.subject.name}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${ENTRY_TYPE_STYLES[entry.entryType] ?? ""}`}>
              {ENTRY_TYPE_LABELS[entry.entryType] ?? entry.entryType}
            </span>
          </div>

          {/* Title */}
          <p className="text-sm font-semibold text-ink dark:text-dark-text truncate pr-2">
            {entry.title}
          </p>

          {/* Meta row: teacher + due date */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
            {entry.teacher && (
              <span className="text-xs text-slate dark:text-dark-muted">
                {entry.teacher.fullName}
              </span>
            )}
            {entry.dueDate && (
              <DueDateChip dueDate={entry.dueDate} status={eff} />
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <div className="shrink-0 text-slate dark:text-dark-muted mt-0.5">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded description */}
      {expanded && entry.description && (
        <div className="px-4 pb-4 pt-0 border-t border-line dark:border-dark-border">
          <p className="text-sm text-ink dark:text-dark-text whitespace-pre-wrap leading-relaxed mt-3">
            {entry.description}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: "PENDING" | "COMPLETED" | "OVERDUE" }) {
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 text-success text-xs font-medium">
        <CheckCircle className="h-4 w-4" aria-hidden="true" />
        Completed
      </span>
    );
  }
  if (status === "OVERDUE") {
    return <AlertTriangle className="h-4 w-4 text-danger" aria-label="Overdue" />;
  }
  // PENDING — orange dot
  return (
    <span className="inline-flex items-center gap-1 text-warn text-xs font-medium">
      <Clock className="h-4 w-4" aria-hidden="true" />
      Pending
    </span>
  );
}

// ---------------------------------------------------------------------------
// Due date chip with urgency label
// ---------------------------------------------------------------------------

function DueDateChip({
  dueDate,
  status,
}: {
  dueDate: string;
  status:  "PENDING" | "COMPLETED" | "OVERDUE";
}) {
  const due  = new Date(dueDate);
  const now  = new Date();

  const isOverdue = status === "OVERDUE";
  const isToday = due.toDateString() === now.toDateString();
  const isTomorrow = (() => {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return due.toDateString() === t.toDateString();
  })();

  // Overdue → danger badge
  if (isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <span className="text-slate dark:text-dark-muted">{formatDueDate(dueDate)}</span>
        <span className="px-1.5 py-0.5 rounded-full bg-danger-bg text-danger text-[10px] font-semibold">
          Overdue
        </span>
      </span>
    );
  }

  // Due today → warn badge
  if (isToday) {
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <span className="px-1.5 py-0.5 rounded-full bg-warn-bg text-warn text-[10px] font-semibold">
          Due today
        </span>
      </span>
    );
  }

  // Due tomorrow → warn badge
  if (isTomorrow) {
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <span className="px-1.5 py-0.5 rounded-full bg-warn-bg text-warn text-[10px] font-semibold">
          Due tomorrow
        </span>
      </span>
    );
  }

  // Plain formatted date
  return (
    <span className="text-xs text-slate dark:text-dark-muted">
      {formatDueDate(dueDate)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Per-filter empty state
// ---------------------------------------------------------------------------

const FILTER_EMPTY: Record<FilterKey, { emoji: string; title: string; body: string }> = {
  all:       { emoji: "📔", title: "No diary entries",    body: "There are no entries for this child yet."        },
  pending:   { emoji: "✅", title: "All caught up!",      body: "There are no pending assignments or homework."   },
  "due-soon":{ emoji: "🗓️", title: "Nothing due soon",   body: "No assignments or homework due in the next 7 days." },
  completed: { emoji: "🎉", title: "No completed items",  body: "Nothing has been marked as completed yet."       },
};

function FilterEmptyState({ filter }: { filter: FilterKey }) {
  const { emoji, title, body } = FILTER_EMPTY[filter];
  return (
    <div className="bg-card border border-line rounded-xl p-8 text-center dark:bg-dark-surface dark:border-dark-border">
      <p className="text-3xl mb-3">{emoji}</p>
      <p className="text-sm font-medium text-ink dark:text-dark-text">{title}</p>
      <p className="text-sm text-slate dark:text-dark-muted mt-1">{body}</p>
    </div>
  );
}
