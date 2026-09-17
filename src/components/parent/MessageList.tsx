"use client";

/**
 * MessageList
 *
 * Renders a list of school-to-parent messages. Each card shows:
 *   - Sender name (or "School" fallback) + channel badge (SMS / EMAIL)
 *   - Message body truncated to 3 lines
 *   - recipientSummary as a small muted label (who the message was sent to)
 *   - Relative date
 *
 * Requirements: 11.3, 11.4
 */

import Link from "next/link";
import { MessageSquare, ShieldAlert } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MessageItem {
  id:               string;
  body:             string;
  recipientSummary: string;
  channel:          string;
  status:           string;
  createdAt:        string; // ISO string
  sender:           { name: string | null; email?: string | null };
  /** "DISCIPLINE" tiles are discipline/behaviour records surfaced in the
   *  Messages tab instead of the notification bell (per-tile badge). */
  kind?:            "MESSAGE" | "DISCIPLINE";
  /** For DISCIPLINE tiles: OPEN/RESOLVED etc, and the linked child's name. */
  disciplineStatus?: string;
  studentName?:      string;
}

interface Props {
  messages: MessageItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)  return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

const CHANNEL_BADGE: Record<string, string> = {
  SMS:   "bg-success-bg text-success",
  EMAIL: "bg-info/10 text-info",
};

function channelBadgeClass(channel: string) {
  return CHANNEL_BADGE[channel] ?? "bg-slate/10 text-slate";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MessageList({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center gap-3 text-center">
        <MessageSquare className="h-10 w-10 text-slate" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            💬 No messages yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => {
        const isDiscipline = msg.kind === "DISCIPLINE";
        const card = (
          <div
            className={`rounded-xl border p-4 shadow-xs ${
              isDiscipline ? "border-warn/30 bg-warn-bg/40" : "border-border bg-card"
            }`}
          >
            {/* Header row */}
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">
                  {isDiscipline ? (msg.studentName ?? "Discipline") : (msg.sender.name ?? "School")}
                </p>
                {isDiscipline ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5
                                    rounded-full bg-warn text-white">
                    <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                    Discipline
                  </span>
                ) : (
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${channelBadgeClass(msg.channel)}`}
                  >
                    {msg.channel}
                  </span>
                )}
                {isDiscipline && msg.disciplineStatus && (
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      msg.disciplineStatus === "RESOLVED"
                        ? "bg-success-bg text-success"
                        : "bg-warn-bg text-warn"
                    }`}
                  >
                    {msg.disciplineStatus}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate shrink-0">
                {relativeTime(msg.createdAt)}
              </p>
            </div>

            {/* Body */}
            <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap">
              {msg.body}
            </p>

            {/* Recipient summary */}
            {msg.recipientSummary && !isDiscipline && (
              <p className="text-[11px] text-slate mt-2">
                To: {msg.recipientSummary}
              </p>
            )}
          </div>
        );

        return isDiscipline ? (
          <Link key={msg.id} href="/parent/behaviour" className="block">
            {card}
          </Link>
        ) : (
          <div key={msg.id}>{card}</div>
        );
      })}
    </div>
  );
}
