"use client";

import { Clock, CheckCircle2, AlertCircle } from "lucide-react";

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

const TYPE_LABELS: Record<string, string> = {
  ASSIGNMENT: "Assignment", HOMEWORK: "Homework", REVISION: "Revision",
  PROJECT: "Project", ANNOUNCEMENT: "Announcement",
};

function formatDue(d: string): string {
  const date = new Date(d);
  const diff = date.getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0)   return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7)  return `Due in ${days} days`;
  return `Due ${date.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}`;
}

function EntryCard({ entry }: { entry: RecipientEntry }) {
  const statusConfig = {
    PENDING:   { Icon: Clock,         color: "text-warn",    label: "Pending" },
    COMPLETED: { Icon: CheckCircle2,  color: "text-success", label: "Completed" },
    OVERDUE:   { Icon: AlertCircle,   color: "text-danger",  label: "Overdue" },
  }[entry.resolvedStatus];

  const hasDue = entry.diaryEntry.dueDate && entry.diaryEntry.entryType !== "ANNOUNCEMENT";

  return (
    <div className="bg-card border border-line rounded-xl p-4 shadow-xs dark:bg-dark-surface dark:border-dark-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate dark:text-dark-muted">
            {entry.diaryEntry.subject.name} · {TYPE_LABELS[entry.diaryEntry.entryType] ?? entry.diaryEntry.entryType}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-ink dark:text-dark-text leading-snug">
            {entry.diaryEntry.title}
          </p>
          {hasDue && (
            <p className={`mt-1 text-xs font-medium ${
              entry.resolvedStatus === "OVERDUE" ? "text-danger" :
              entry.resolvedStatus === "PENDING" && entry.diaryEntry.dueDate &&
              new Date(entry.diaryEntry.dueDate).getTime() - Date.now() < 86400000 * 2
                ? "text-warn" : "text-slate dark:text-dark-muted"
            }`}>
              {formatDue(entry.diaryEntry.dueDate!)}
            </p>
          )}
        </div>
        <div className={`flex items-center gap-1.5 shrink-0 ${statusConfig.color}`}>
          <statusConfig.Icon className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-medium">{statusConfig.label}</span>
        </div>
      </div>
    </div>
  );
}

export default function StudentDiaryView({ entries }: StudentDiaryViewProps) {
  const now = Date.now();

  const sections = {
    new: entries.filter(
      (e) =>
        e.resolvedStatus === "PENDING" &&
        (!e.diaryEntry.dueDate ||
          new Date(e.diaryEntry.dueDate).getTime() - now > 2 * 86400000)
    ),
    dueSoon: entries.filter(
      (e) =>
        e.resolvedStatus === "PENDING" &&
        e.diaryEntry.dueDate &&
        new Date(e.diaryEntry.dueDate).getTime() - now <= 2 * 86400000
    ),
    overdue:   entries.filter((e) => e.resolvedStatus === "OVERDUE"),
    completed: entries.filter((e) => e.resolvedStatus === "COMPLETED"),
  };

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-success-bg flex items-center justify-center mb-3">
          <CheckCircle2 className="h-7 w-7 text-success" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-ink dark:text-dark-text">You&apos;re all caught up!</p>
        <p className="text-xs text-slate dark:text-dark-muted mt-1">New assignments and updates will appear here.</p>
      </div>
    );
  }

  const renderSection = (title: string, items: RecipientEntry[], emptyMsg: string) => (
    <section key={title}>
      <h2 className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted mb-2">
        {title} {items.length > 0 && <span className="ml-1 text-ink dark:text-dark-text">({items.length})</span>}
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-slate dark:text-dark-muted py-2">{emptyMsg}</p>
      ) : (
        <div className="space-y-2">
          {items.map((e) => <EntryCard key={e.id} entry={e} />)}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      {sections.overdue.length > 0 && renderSection("Overdue", sections.overdue, "")}
      {renderSection("Due Soon", sections.dueSoon, "Nothing due in the next 2 days.")}
      {renderSection("New", sections.new, "No new entries.")}
      {sections.completed.length > 0 && renderSection("Completed", sections.completed, "")}
    </div>
  );
}
