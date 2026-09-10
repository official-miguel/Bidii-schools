"use client";

import { useEffect, useRef, useState } from "react";

interface Progress { total: number; sent: number; failed: number; done: boolean; skipped: { name: string; reason: string }[] }

interface Props { batchId: string; onDone?: () => void }

export default function ExamResultsProgress({ batchId, onDone }: Props) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      try {
        const r = await fetch(`/api/messaging/exam-results/progress/${batchId}`);
        if (!r.ok) return;
        const data: Progress = await r.json();
        setProgress(data);
        if (data.done) {
          if (timer.current) clearInterval(timer.current);
          onDone?.();
        }
      } catch { /* non-fatal */ }
    }
    poll();
    timer.current = setInterval(poll, 2000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [batchId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!progress) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate">
        <div className="h-4 w-4 rounded-full border-2 border-royal border-t-transparent animate-spin" />
        Starting bulk send…
      </div>
    );
  }

  const pct = progress.total > 0 ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-slate mb-1">
          <span>{progress.sent + progress.failed} of {progress.total} processed</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-line overflow-hidden">
          <div
            className="h-2 rounded-full bg-royal transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Sent",   value: progress.sent,   colour: "text-emerald-700" },
          { label: "Failed", value: progress.failed, colour: "text-danger" },
          { label: "Skipped (no contact)", value: progress.skipped.length, colour: "text-warn" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-3 text-center">
            <p className={`text-xl font-semibold ${s.colour}`}>{s.value}</p>
            <p className="text-xs text-slate mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {progress.done && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          ✓ Bulk send complete.
          {progress.failed > 0 && (
            <span className="text-warn ml-1">{progress.failed} message{progress.failed !== 1 ? "s" : ""} failed — check message history to retry.</span>
          )}
        </div>
      )}

      {/* Skipped list */}
      {progress.skipped.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate uppercase tracking-wide mb-2">Students skipped (no contact)</p>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-border">
                {progress.skipped.map((s, i) => (
                  <tr key={i} className="hover:bg-royal-50/20">
                    <td className="px-3 py-2 text-foreground">{s.name}</td>
                    <td className="px-3 py-2 text-slate">{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
