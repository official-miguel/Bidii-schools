"use client";

import { useEffect, useState } from "react";

interface TimelineEvent {
  id: string;
  dateOfOffence: string;
  offence: string;
  actionTaken: string | null;
  resolution: string | null;
  status: string;
  aiSummary: string | null;
  classAtTime: {
    id: string;
    name: string;
    form: number;
  } | null;
  events: Array<{
    id: string;
    type: string;
    detail: string;
    createdAt: string;
    createdBy: { email: string } | null;
  }>;
}

interface TimelineItem {
  date: string;
  title: string;
  description: string;
  className: string;
  status: string;
  aiSummary: string | null;
  type: "offence" | "event";
  icon: string;
  color: string;
}

export default function DisciplineTimeline({ studentId }: { studentId: string }) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/discipline/timeline?studentId=${studentId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError("Failed to load discipline timeline");
          setLoading(false);
          return;
        }
        const data: TimelineEvent[] = await res.json();

        const items: TimelineItem[] = [];

        data.forEach((record) => {
          // Add the offence/event
          items.push({
            date: new Date(record.dateOfOffence).toLocaleDateString(),
            title: record.offence,
            description: record.actionTaken || "No action recorded",
            className: record.classAtTime ? `${record.classAtTime.name} (Form ${record.classAtTime.form})` : "Unknown class",
            status: record.status,
            aiSummary: record.aiSummary,
            type: "offence",
            icon: "📝",
            color: getStatusColor(record.status),
          });

          // Add timeline events
          record.events.forEach((event) => {
            items.push({
              date: new Date(event.createdAt).toLocaleDateString(),
              title: formatEventType(event.type),
              description: event.detail,
              className: "", // Events don't have class info
              status: "info",
              aiSummary: null,
              type: "event",
              icon: getEventIcon(event.type),
              color: getEventColor(event.type),
            });
          });
        });

        // Sort by date (most recent first)
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (!cancelled) {
          setTimeline(items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load discipline timeline");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (loading) return <p className="text-sm text-slate">Loading timeline...</p>;

  if (timeline.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate">No discipline records found for this student.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {timeline.map((item, index) => (
        <div key={index} className="border-l-2 border-border pl-4 mb-4">
          <div className="flex items-start gap-3">
            <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium ${item.color}`}>
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              {item.className && (
                <p className="text-xs text-slate">{item.className}</p>
              )}
              <p className="text-sm text-slate">{item.description}</p>
              {item.aiSummary && (
                <p className="text-xs text-royal mt-1">AI: {item.aiSummary}</p>
              )}
              <p className="text-xs text-slate">{item.date}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    OPEN: "bg-warn-bg text-warn",
    UNDER_REVIEW: "bg-royal-50 text-royal",
    RESOLVED: "bg-emerald-50 text-emerald-700",
    ESCALATED: "bg-danger-bg text-danger",
  };
  return colors[status] || "bg-slate-200 text-slate-800";
}

function formatEventType(type: string): string {
  const types: Record<string, string> = {
    CREATED: "Case opened",
    UPDATED: "Case updated",
    FILE: "File attached",
    NOTE: "Note added",
    AI_SUMMARY: "AI summary generated",
  };
  return types[type] || type.replace(/_/g, " ").toLowerCase();
}

function getEventIcon(type: string): string {
  const icons: Record<string, string> = {
    CREATED: "📋",
    UPDATED: "✏️",
    FILE: "📎",
    NOTE: "📝",
    AI_SUMMARY: "🤖",
  };
  return icons[type] || "•";
}

function getEventColor(type: string): string {
  const colors: Record<string, string> = {
    CREATED: "bg-emerald-50 text-emerald-700",
    UPDATED: "bg-royal-50 text-royal",
    FILE: "bg-warn-bg text-warn",
    NOTE: "bg-slate-50 text-slate-800",
    AI_SUMMARY: "bg-royal-50 text-royal",
  };
  return colors[type] || "bg-slate-200 text-slate-800";
}