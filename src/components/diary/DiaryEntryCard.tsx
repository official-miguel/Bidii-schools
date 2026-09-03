"use client";

import Link from "next/link";
import { FileText, BookOpen, RotateCcw, FolderOpen, Megaphone } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type DiaryEntry = {
  id:           string;
  title:        string;
  entryType:    string;
  dueDate?:     string | Date | null;
  createdAt:    string | Date;
  completedCount?: number;
  subject:      { name: string };
  targets:      { schoolClass: { id: string; name: string } }[];
  _count?:      { recipients: number };
};

interface DiaryEntryCardProps {
  entry:   DiaryEntry;
  variant: "full" | "compact";
}

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, {
  label:  string;
  Icon:   React.ElementType;
  color:  string;
  badge:  string;
}> = {
  ASSIGNMENT:   { label: "Assignment",   Icon: FileText,   color: "text-teal",    badge: "bg-teal/10 text-teal" },
  HOMEWORK:     { label: "Homework",     Icon: BookOpen,   color: "text-info",    badge: "bg-info/10 text-info" },
  REVISION:     { label: "Revision",     Icon: RotateCcw,  color: "text-warn",    badge: "bg-warn-bg text-warn" },
  PROJECT:      { label: "Project",      Icon: FolderOpen, color: "text-success", badge: "bg-success-bg text-success" },
  ANNOUNCEMENT: { label: "Announcement", Icon: Megaphone,  color: "text-slate",   badge: "bg-line text-slate" },
};

function formatDueDate(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0)        return "Overdue";
  if (days === 0)      return "Due today";
  if (days === 1)      return "Due tomorrow";
  if (days <= 7)       return `Due in ${days} days`;
  return `Due ${d.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}`;
}

function formatPostedDate(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1)  return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7)   return `${days} days ago`;
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DiaryEntryCard({ entry, variant }: DiaryEntryCardProps) {
  const cfg        = TYPE_CONFIG[entry.entryType] ?? TYPE_CONFIG.ASSIGNMENT;
  const { Icon }   = cfg;
  const classNames = entry.targets.map((t) => t.schoolClass.name).join(", ");
  const total      = entry._count?.recipients ?? 0;
  const completed  = entry.completedCount ?? 0;
  const progress   = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isDue      = entry.dueDate && entry.entryType !== "ANNOUNCEMENT";

  return (
    <Link
      href={`/teacher/diary/${entry.id}`}
      className="block bg-card border border-line rounded-xl shadow-xs hover:shadow-sm hover:border-teal/30 
                 transition-all group dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/30"
    >
      <div className="p-4">
        {/* Top row: badge + date */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${cfg.badge}`}>
              <Icon className="h-3 w-3" aria-hidden="true" />
              {cfg.label}
            </span>
          </div>
          <span className="text-[11px] text-slate dark:text-dark-muted shrink-0">
            {formatPostedDate(entry.createdAt)}
          </span>
        </div>

        {/* Title */}
        <p className="mt-2 font-semibold text-ink dark:text-dark-text text-sm leading-snug group-hover:text-teal transition-colors truncate">
          {entry.title}
        </p>

        {/* Subject + Class */}
        <p className="mt-0.5 text-xs text-slate dark:text-dark-muted truncate">
          {entry.subject.name}
          {classNames ? ` · ${classNames}` : ""}
        </p>

        {/* Due date */}
        {isDue && (
          <p className={`mt-1.5 text-xs font-medium ${
            new Date(entry.dueDate!) < new Date()
              ? "text-danger"
              : new Date(entry.dueDate!).getTime() - Date.now() < 86400000 * 2
              ? "text-warn"
              : "text-slate dark:text-dark-muted"
          }`}>
            {formatDueDate(entry.dueDate!)}
          </p>
        )}

        {/* Progress bar (full variant only) */}
        {variant === "full" && total > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-slate dark:text-dark-muted">
                {completed} of {total} completed
              </span>
              <span className="text-[11px] font-medium text-slate dark:text-dark-muted">
                {progress}%
              </span>
            </div>
            <div className="h-1.5 bg-line dark:bg-dark-border rounded-full overflow-hidden">
              <div
                className="h-full bg-teal rounded-full transition-all"
                style={{ width: `${progress}%` }}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
