"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import {
  ErrorBanner,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { Avatar, StudentLite, STATUS_LABELS, fmtSize } from "./shared";
import { X, Loader2, Sparkles, Paperclip } from "lucide-react";
import { useFormDraft } from "@/lib/hooks/useFormDraft";

type Suggestion = {
  title: string;
  category: string;
  severity: "MINOR" | "MODERATE" | "SEVERE";
  keywords: string[];
  suggestedAction: string;
  summary: string;
};

type PendingFile = {
  id: string;
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

const SEVERITY_CONFIG: Record<
  string,
  { label: string; chipClass: string; dotClass: string; borderClass: string }
> = {
  MINOR: {
    label: "Minor",
    chipClass: "bg-success-bg text-success border-success/20",
    dotClass: "bg-success",
    borderClass: "border-success/25 bg-success-bg/30",
  },
  MODERATE: {
    label: "Moderate",
    chipClass: "bg-warn-bg text-warn border-warn/20",
    dotClass: "bg-warn",
    borderClass: "border-warn/25 bg-warn-bg/30",
  },
  SEVERE: {
    label: "Severe",
    chipClass: "bg-danger-bg text-danger border-danger/20",
    dotClass: "bg-danger",
    borderClass: "border-danger/30 bg-danger-bg/30",
  },
};

let uid = 0;

export default function QuickIncidentModal({
  students,
  initialStudentId,
  onClose,
  onSaved,
}: {
  students: StudentLite[];
  initialStudentId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Draft is scoped to "new" — incidents are always new records (no edit mode)
  const [draft, setDraft, clearDraft] = useFormDraft("bidii_draft_incident", {
    text:        "",
    studentId:   initialStudentId ?? "",
    title:       "",
    aiSummary:   "",
    severity:    "",
    date:        new Date().toISOString().slice(0, 10),
    time:        "",
    location:    "",
    witnesses:   "",
    actionTaken: "",
    status:      "OPEN",
  });

  const [text, setText]             = useState(draft.text);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentId, setStudentId]   = useState(initialStudentId || draft.studentId);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [title, setTitle]           = useState(draft.title);
  const [aiSummary, setAiSummary]   = useState(draft.aiSummary);
  const [severity, setSeverity]     = useState<string>(draft.severity);
  const [showMore, setShowMore]     = useState(false);
  const [date, setDate]             = useState(draft.date);
  const [time, setTime]             = useState(draft.time);
  const [location, setLocation]     = useState(draft.location);
  const [witnesses, setWitnesses]   = useState(draft.witnesses);
  const [actionTaken, setActionTaken] = useState(draft.actionTaken);
  const [status, setStatus]         = useState(draft.status);
  const [files, setFiles]           = useState<PendingFile[]>([]);
  const [dragOver, setDragOver]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Persist draft on change (skip file objects — not serialisable)
  useEffect(() => {
    setDraft({ text, studentId, title, aiSummary, severity, date, time, location, witnesses, actionTaken, status });
  }, [text, studentId, title, aiSummary, severity, date, time, location, witnesses, actionTaken, status, setDraft]);

  useEffect(() => textRef.current?.focus(), []);

  const selected = useMemo(
    () => students.find((s) => s.id === studentId) || null,
    [students, studentId]
  );

  const matches = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(
        (s) =>
          s.fullName.toLowerCase().includes(q) ||
          s.admissionNumber.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [students, studentQuery]);

  // Debounced AI analysis
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (text.trim().length < 12) return;
    debounceRef.current = setTimeout(async () => {
      setSuggesting(true);
      try {
        const res = await fetch("/api/discipline/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const { suggestion: s } = await res.json();
          if (s) {
            setSuggestion(s);
            setTitle((t) => t || s.title);
            setAiSummary((v) => v || s.summary);
            setSeverity((v) => v || s.severity);
          }
        }
      } finally {
        setSuggesting(false);
      }
    }, 900);
    return () => clearTimeout(debounceRef.current);
  }, [text]);

  const addFiles = useCallback((list: FileList | File[]) => {
    const next = Array.from(list).map((file) => ({
      id: `f${++uid}`,
      file,
      status: "queued" as const,
    }));
    setFiles((prev) => [...prev, ...next]);
  }, []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const imgs = Array.from(e.clipboardData.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (imgs.length) addFiles(imgs);
    },
    [addFiles]
  );

  async function uploadTo(recordId: string, pf: PendingFile): Promise<boolean> {
    setFiles((prev) =>
      prev.map((f) => (f.id === pf.id ? { ...f, status: "uploading" } : f))
    );
    const fd = new FormData();
    fd.append("file", pf.file);
    const res = await fetch(`/api/discipline/${recordId}/files`, {
      method: "POST",
      body: fd,
    });
    const ok = res.ok || res.status === 409;
    setFiles((prev) =>
      prev.map((f) =>
        f.id === pf.id
          ? { ...f, status: ok ? "done" : "error", error: ok ? undefined : "Upload failed" }
          : f
      )
    );
    return ok;
  }

  async function save() {
    if (!studentId) return setError("Select a student first.");
    if (text.trim().length < 4) return setError("Describe what happened (at least a few words).");
    setSaving(true);
    setError(null);
    const offence = title.trim() || text.trim().slice(0, 60);
    const descParts = [text.trim()];
    if (time) descParts.push(`Time: ${time}`);
    if (location.trim()) descParts.push(`Location: ${location.trim()}`);
    if (witnesses.trim()) descParts.push(`Witnesses: ${witnesses.trim()}`);
    const res = await fetch("/api/discipline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        offence,
        description: descParts.join("\n"),
        actionTaken: actionTaken.trim() || suggestion?.suggestedAction || "",
        dateOfOffence: date,
        status,
        aiSummary: aiSummary.trim(),
      }),
    });
    if (!res.ok) {
      setSaving(false);
      setError((await res.json()).error || "Couldn't save the incident.");
      return;
    }
    const record = await res.json();
    for (const pf of files.filter((f) => f.status !== "done")) {
      await uploadTo(record.id, pf);
    }
    setSaving(false);
    clearDraft();
    onSaved();
  }

  const severityConfig = SEVERITY_CONFIG[severity] ?? null;

  return (
    <Modal
      title="Record Incident"
      description="Document a discipline incident. AI will analyse your description and suggest the category and severity."
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate">
            Evidence files will be attached automatically after saving.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={saving}
              onClick={save}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save incident"
              )}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4" onPaste={onPaste}>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* ── Student picker ── */}
        <div className="form-section">
          <div className="form-section-title">Student Involved</div>
          {selected ? (
            <div className="flex items-center gap-3 rounded-lg bg-teal-50/50 border border-teal/20 px-4 py-3">
              <Avatar name={selected.fullName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{selected.fullName}</p>
                <p className="text-xs text-slate font-mono">
                  {selected.admissionNumber}
                  {selected.schoolClass ? ` · ${selected.schoolClass.name}` : ""}
                </p>
              </div>
              {!initialStudentId && (
                <button
                  type="button"
                  className="text-xs font-medium text-teal hover:text-teal-dark transition-colors"
                  onClick={() => setStudentId("")}
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <div className="relative">
              <input
                className={inputClass}
                placeholder="Search by name or admission number…"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                autoComplete="off"
              />
              {matches.length > 0 && (
                <ul
                  className="absolute z-20 mt-1 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden divide-y divide-border/60"
                  role="listbox"
                >
                  {matches.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-teal-50/50 focus:bg-teal-50/50 outline-none transition-colors"
                        onClick={() => {
                          setStudentId(s.id);
                          setStudentQuery("");
                        }}
                      >
                        <Avatar name={s.fullName} size="sm" />
                        <span className="text-sm font-medium text-foreground">{s.fullName}</span>
                        <span className="text-xs text-slate font-mono ml-auto">
                          {s.admissionNumber}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ── Description ── */}
        <div className="form-section">
          <div className="form-section-title">What Happened</div>
          <div>
            <textarea
              ref={textRef}
              rows={4}
              className={inputClass}
              style={{ resize: "vertical" }}
              placeholder='Describe the incident in plain language. e.g. "Student was found vaping behind the laboratory during afternoon prep."'
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {suggesting && (
              <p
                className="text-xs text-teal mt-2 flex items-center gap-1.5"
                aria-live="polite"
              >
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                AI is analysing your description…
              </p>
            )}
          </div>
        </div>

        {/* ── AI Suggestions ── */}
        {suggestion && (
          <div
            className={`rounded-xl border p-4 space-y-4 ${
              severityConfig?.borderClass ?? "border-border"
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal shrink-0" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">AI suggestions</p>
              <p className="text-xs text-slate ml-1">— confirm or edit before saving</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Offence title</label>
                <input
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Severity</label>
                <div className="flex gap-2">
                  {(["MINOR", "MODERATE", "SEVERE"] as const).map((s) => {
                    const cfg = SEVERITY_CONFIG[s];
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSeverity(s)}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition-all duration-100 ${
                          severity === s
                            ? cfg.chipClass + " shadow-xs"
                            : "border-border text-slate hover:border-slate-light"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${severity === s ? cfg.dotClass : "bg-slate/40"}`}
                        />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>AI summary</label>
              <input
                className={inputClass}
                value={aiSummary}
                onChange={(e) => setAiSummary(e.target.value)}
              />
            </div>

            {/* Tags row */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-slate font-medium">Tags:</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-line text-slate border border-border">
                {suggestion.category}
              </span>
              {suggestion.keywords.map((k) => (
                <span
                  key={k}
                  className="text-xs px-2 py-0.5 rounded-full bg-background border border-border text-slate"
                >
                  #{k}
                </span>
              ))}
            </div>

            {suggestion.suggestedAction && (
              <div className="rounded-lg bg-background border border-border px-3 py-2.5">
                <p className="text-xs text-slate font-medium mb-0.5">Suggested action</p>
                <p className="text-sm text-foreground">{suggestion.suggestedAction}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Evidence attachments ── */}
        <div className="form-section">
          <div className="form-section-title">Evidence</div>
          <div
            className={`rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors cursor-pointer ${
              dragOver
                ? "border-teal bg-teal-50/40"
                : "border-border hover:border-teal/40 hover:bg-background/60"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <Paperclip className="h-5 w-5 text-slate/50 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-slate">
              Drag files here, paste a screenshot, or{" "}
              <label className="text-teal font-medium hover:text-teal-dark cursor-pointer underline underline-offset-2">
                browse
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => e.target.files && addFiles(e.target.files)}
                />
              </label>
            </p>
            <p className="text-xs text-slate/60 mt-1">Images, PDF, Word · up to 8 MB each</p>
          </div>

          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((pf) => (
                <li
                  key={pf.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                >
                  <span aria-hidden className="shrink-0 text-base">
                    {pf.file.type.startsWith("image/") ? "🖼" : "📄"}
                  </span>
                  <span className="text-foreground truncate flex-1">{pf.file.name}</span>
                  <span className="text-xs text-slate shrink-0">{fmtSize(pf.file.size)}</span>
                  {pf.status === "uploading" && (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin text-teal shrink-0"
                      aria-label="Uploading"
                    />
                  )}
                  {pf.status === "done" && (
                    <span className="text-success text-xs font-medium shrink-0">Saved</span>
                  )}
                  {pf.status === "error" && (
                    <span className="text-danger text-xs shrink-0">{pf.error}</span>
                  )}
                  {pf.status !== "uploading" && (
                    <button
                      type="button"
                      aria-label={`Remove ${pf.file.name}`}
                      className="text-slate/50 hover:text-danger shrink-0 transition-colors"
                      onClick={() =>
                        setFiles((prev) => prev.filter((f) => f.id !== pf.id))
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Additional details (collapsible) ── */}
        <div>
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-slate hover:text-foreground transition-colors"
            aria-expanded={showMore}
            onClick={() => setShowMore((v) => !v)}
          >
            <svg
              className={`h-4 w-4 transition-transform duration-150 ${showMore ? "rotate-90" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
            {showMore ? "Hide additional details" : "Add date, time, location, witnesses…"}
          </button>

          {showMore && (
            <div className="mt-4 form-section animate-slide-down">
              <div className="form-section-title">Additional Details</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Incident date</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Time (approximate)</label>
                  <input
                    type="time"
                    className={inputClass}
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Location</label>
                  <input
                    className={inputClass}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Behind the laboratory"
                  />
                </div>
                <div>
                  <label className={labelClass}>Witnesses</label>
                  <input
                    className={inputClass}
                    value={witnesses}
                    onChange={(e) => setWitnesses(e.target.value)}
                    placeholder="Names of any witnesses"
                  />
                </div>
                <div>
                  <label className={labelClass}>Action taken</label>
                  <input
                    className={inputClass}
                    value={actionTaken}
                    onChange={(e) => setActionTaken(e.target.value)}
                    placeholder={suggestion?.suggestedAction || "Describe the action taken"}
                  />
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    className={inputClass}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
