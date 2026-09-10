"use client";

import { useEffect, useState } from "react";
import { royalCardClass } from "@/components/ui";
import ExamResultsProgress from "./ExamResultsProgress";

interface Period { id: string; name: string; academicYear: string; term: number | null }
interface Summary { totalStudents: number; withContact: number; withoutContact: number; period: Period }

interface Props { canManage: boolean }

export default function ExamResultsPanel({ canManage }: Props) {
  const [periods, setPeriods]               = useState<Period[]>([]);
  const [periodId, setPeriodId]             = useState("");
  const [summary, setSummary]               = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [channel, setChannel]               = useState<"SMS" | "WHATSAPP">("SMS");
  const [closingLine, setClosingLine]       = useState("");
  const [previewSearch, setPreviewSearch]   = useState("");
  const [previewStudents, setPreviewStudents] = useState<{ id: string; fullName: string }[]>([]);
  const [preview, setPreview]               = useState<{ body: string; recipientLabel: string; phone: string | null } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending]               = useState(false);
  const [batchId, setBatchId]               = useState<string | null>(null);
  const [error, setError]                   = useState("");

  useEffect(() => {
    fetch("/api/assessments/periods")
      .then((r) => r.ok ? r.json() : [])
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : (data as { periods?: Period[] }).periods ?? [];
        setPeriods(arr);
      })
      .catch(() => {});

    fetch("/api/messaging/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((s: { resultsClosing?: string } | null) => { if (s?.resultsClosing) setClosingLine(s.resultsClosing); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!periodId) { setSummary(null); return; }
    setSummaryLoading(true);
    fetch(`/api/messaging/exam-results?periodId=${periodId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: Summary | null) => setSummary(d))
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, [periodId]);

  useEffect(() => {
    if (!previewSearch.trim()) { setPreviewStudents([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/messaging/recipients/search?q=${encodeURIComponent(previewSearch)}&limit=8`);
      if (!r.ok) return;
      const d = await r.json() as { students: { id: string; fullName: string }[] };
      setPreviewStudents(d.students ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [previewSearch]);

  async function loadPreview(studentId: string) {
    if (!periodId) return;
    setPreviewLoading(true);
    setPreview(null);
    const r = await fetch(`/api/messaging/exam-results/preview/${studentId}?periodId=${periodId}`);
    if (r.ok) setPreview(await r.json());
    setPreviewLoading(false);
  }

  async function handleSendAll() {
    if (!periodId || !summary) return;
    setSending(true); setError(""); setBatchId(null);
    const r = await fetch("/api/messaging/exam-results", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ periodId, channel, closingLine: closingLine || undefined }),
    });
    if (r.ok) {
      const d = await r.json() as { batchId: string };
      setBatchId(d.batchId);
    } else {
      const d = await r.json() as { error?: string };
      setError(d.error ?? "Failed to start bulk send.");
    }
    setSending(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground mb-1">Exam Results Messaging</h1>
        <p className="text-sm text-slate">Send each student&apos;s results directly to their parent&apos;s phone.</p>
      </div>

      {/* Period selector */}
      <div className={`${royalCardClass} p-5 space-y-4`}>
        <div>
          <label className="block text-xs font-medium text-slate uppercase tracking-wide mb-1">Assessment period</label>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
            className="w-full md:w-80 rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-royal focus:outline-none">
            <option value="">— Select a period —</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.academicYear}{p.term ? ` Term ${p.term}` : ""}
              </option>
            ))}
          </select>
        </div>

        {summaryLoading && <div className="h-4 w-48 bg-line/40 rounded animate-pulse" />}

        {summary && !summaryLoading && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Students with results", value: summary.totalStudents, colour: "text-foreground" },
              { label: "With parent contact",   value: summary.withContact,   colour: "text-emerald-700" },
              { label: "No contact (skipped)",  value: summary.withoutContact, colour: summary.withoutContact > 0 ? "text-warn" : "text-slate" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-background p-3">
                <p className={`text-2xl font-semibold ${s.colour}`}>{s.value}</p>
                <p className="text-xs text-slate mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview */}
      {periodId && (
        <div className={`${royalCardClass} p-5 space-y-3`}>
          <p className="text-sm font-medium text-foreground">Preview a student&apos;s message</p>
          <div className="relative">
            <input
              type="text"
              value={previewSearch}
              onChange={(e) => setPreviewSearch(e.target.value)}
              placeholder="Search student name…"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-royal focus:outline-none"
            />
            {previewStudents.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card shadow-lg max-h-36 overflow-y-auto">
                {previewStudents.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => { loadPreview(s.id); setPreviewSearch(s.fullName); setPreviewStudents([]); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-royal-50"
                    >
                      {s.fullName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {previewLoading && <div className="h-4 w-32 bg-line/40 rounded animate-pulse" />}
          {preview && (
            <div className="space-y-2">
              <p className="text-xs text-slate">
                To: {preview.recipientLabel} · {preview.phone ?? "no contact"}
              </p>
              <pre className="whitespace-pre-wrap text-sm text-foreground bg-background rounded-lg p-3 border border-border font-sans max-h-64 overflow-y-auto">
                {preview.body}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Send controls */}
      {summary && canManage && !batchId && (
        <div className={`${royalCardClass} p-5 space-y-4`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate uppercase tracking-wide mb-1">Channel</label>
              <div className="flex gap-2">
                {(["SMS", "WHATSAPP"] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChannel(ch)}
                    className={`flex-1 rounded-md border py-2 text-sm font-medium transition-colors ${
                      channel === ch ? "border-royal bg-royal text-white" : "border-border text-slate hover:border-royal"
                    }`}
                  >
                    {ch === "WHATSAPP" ? "WhatsApp" : "SMS"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate uppercase tracking-wide mb-1">Closing line</label>
              <input
                type="text"
                value={closingLine}
                onChange={(e) => setClosingLine(e.target.value)}
                placeholder="Thank you for your continued support."
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-royal focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            onClick={handleSendAll}
            disabled={sending || !summary.withContact}
            className="rounded-md bg-royal text-white text-sm font-medium px-5 py-2.5 hover:bg-royal-light transition-colors disabled:opacity-60 shadow-sm"
          >
            {sending ? "Starting…" : `Send results to ${summary.withContact} parent${summary.withContact !== 1 ? "s" : ""}`}
          </button>
          {!summary.withContact && (
            <p className="text-xs text-slate">No students have parent contacts on file for this period.</p>
          )}
        </div>
      )}

      {/* Progress */}
      {batchId && (
        <div className={`${royalCardClass} p-5`}>
          <p className="text-sm font-semibold text-foreground mb-4">Sending in progress…</p>
          <ExamResultsProgress batchId={batchId} onDone={() => {}} />
        </div>
      )}
    </div>
  );
}
