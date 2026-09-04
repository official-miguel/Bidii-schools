"use client";

import {
  Clock, CheckCircle2, AlertCircle,
  FileText, BookOpen, RotateCcw, FolderOpen, Megaphone,
  Calendar,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecipientEntry = {
  id:             string;
  resolvedStatus: "PENDING" | "COMPLETED" | "OVERDUE";
  diaryEntry: {
    id:        string;
    title:     string;
    entryType: string;
    dueDate?:  string | null;
    subject:   { name: string };
  };
};

interface StudentDiaryViewProps {
  entries: RecipientEntry[];
}

// ---------------------------------------------------------------------------
// Config maps
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<string, {
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

function formatDue(d: string): string {
  const date = new Date(d);
  const diff = date.getTime() - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  if (days < 0)   return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7)  return `Due in ${days} days`;
  return `Due ${date.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}`;
}

// ---------------------------------------------------------------------------
// Entry card
// ---------------------------------------------------------------------------

function EntryCard({ entry }: { entry: RecipientEntry }) {
  const status = entry.resolvedStatus;
  const cfg    = TYPE_CONFIG[entry.diaryEntry.entryType] ?? TYPE_CONFIG.ASSIGNMENT;
  const hasDue = !!entry.diaryEntry.dueDate && entry.diaryEntry.entryType !== "ANNOUNCEMENT";

  const statusIcon = {
    PENDING:   { Icon: Clock,        color: "text-warn"    },
    COMPLETED: { Icon: CheckCircle2, color: "text-success" },
    OVERDUE:   { Icon: AlertCircle,  color: "text-danger"  },
  }[status];

  const dueDateColor =
    status === "OVERDUE" ? "text-danger" :
    status === "PENDING" && entry.diaryEntry.dueDate &&
      new Date(entry.diaryEntry.dueDate).getTime() - Date.now() < 86_400_000 * 2
      ? "text-warn"
      : "text-slate dark:text-dark-muted";

  return (
    <div className="bg-card border border-line rounded-xl p-4 shadow-xs dark:bg-dark-surface dark:border-dark-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Type badge + subject */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.badge}`}>
              <cfg.Icon className="h-3 w-3" aria-hidden="true" />
              {cfg.label}
            </span>
            <span className="text-[11px] font-semibold text-slate dark:text-dark-muted">
              {entry.diaryEntry.subject.name}
            </span>
          </div>

          {/* Title */}
          <p className="text-sm font-semibold text-ink dark:text-dark-text leading-snug">
            {entry.diaryEntry.title}
          </p>

          {/* Due date */}
          {hasDue && (
            <p className={`mt-1 text-xs font-medium inline-flex items-center gap-1 ${dueDateColor}`}>
              <Calendar className="h-3 w-3" aria-hidden="true" />
              {formatDue(entry.diaryEntry.dueDate!)}
            </p>
          )}
        </div>

        {/* Status */}
        <div className={`flex items-center gap-1 shrink-0 ${statusIcon.color}`}>
          <statusIcon.Icon className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-semibold sr-only sm:not-sr-only">{
            status === "PENDING"   ? "Pending"   :
            status === "COMPLETED" ? "Done"      :
                                     "Overdue"
          }</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="text-xs font-semibold text-slate uppercase tracking-widest dark:text-dark-muted mb-2 flex items-center gap-2">
      {title}
      <span className="text-ink dark:text-dark-text font-bold tracking-normal">
        {count}
      </span>
    </h2>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StudentDiaryView({ entries }: StudentDiaryViewProps) {
  const now = Date.now();

  const overdue   = entries.filter((e) => e.resolvedStatus === "OVERDUE");
  const dueSoon   = entries.filter(
    (e) =>
      e.resolvedStatus === "PENDING" &&
      e.diaryEntry.dueDate &&
      new Date(e.diaryEntry.dueDate).getTime() - now <= 2 * 86_400_000
  );
  const pending   = entries.filter(
    (e) =>
      e.resolvedStatus === "PENDING" &&
      (!e.diaryEntry.dueDate ||
        new Date(e.diaryEntry.dueDate).getTime() - now > 2 * 86_400_000)
  );
  const completed = entries.filter((e) => e.resolvedStatus === "COMPLETED");

  // Empty state
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-success-bg flex items-center justify-center mb-3">
          <CheckCircle2 className="h-7 w-7 text-success" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-ink dark:text-dark-text">
          You&apos;re all caught up!
        </p>
        <p className="text-xs text-slate dark:text-dark-muted mt-1">
          New assignments and updates will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overdue — only when there are items */}
      {overdue.length > 0 && (
        <section>
          <SectionHeading title="Overdue" count={overdue.length} />
          <div className="space-y-2">
            {overdue.map((e) => <EntryCard key={e.id} entry={e} />)}
          </div>
        </section>
      )}

      {/* Due Soon — only when there are items */}
      {dueSoon.length > 0 && (
        <section>
          <SectionHeading title="Due Soon" count={dueSoon.length} />
          <div className="space-y-2">
            {dueSoon.map((e) => <EntryCard key={e.id} entry={e} />)}
          </div>
        </section>
      )}

      {/* Pending / New — only when there are items */}
      {pending.length > 0 && (
        <section>
          <SectionHeading title="New" count={pending.length} />
          <div className="space-y-2">
            {pending.map((e) => <EntryCard key={e.id} entry={e} />)}
          </div>
        </section>
      )}

      {/* Completed — only when there are items */}
      {completed.length > 0 && (
        <section>
          <SectionHeading title="Completed" count={completed.length} />
          <div className="space-y-2">
            {completed.map((e) => <EntryCard key={e.id} entry={e} />)}
          </div>
        </section>
      )}
    </div>
  );
}
