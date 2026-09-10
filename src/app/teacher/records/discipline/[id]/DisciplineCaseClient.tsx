"use client";

import { useState, FormEvent } from "react";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { CheckCircle2, Clock, FileText, MessageSquare, X } from "lucide-react";
import { formatCreator } from "@/components/records/shared";

// ── Types ─────────────────────────────────────────────────────────────────────

type DisciplineCaseClientRecord = {
  id: string;
  offence: string;
  status: string;
  description: string | null;
  actionTaken: string | null;
  resolution: string | null;
  dateOfOffence: string;
  createdAt: string;
  recordedBy: { email: string; role: string; name: string | null } | null;
  student: {
    id: string;
    fullName: string;
    admissionNumber: string;
    schoolClass: { name: string; form: number };
  };
};

type DisciplineCaseNote = {
  id: string;
  body: string;
  createdAt: string;
  createdBy: { email: string; role: string; name: string | null } | null;
};

type DisciplineCaseFile = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

type Props = {
  record: DisciplineCaseClientRecord;
  initialNotes: DisciplineCaseNote[];
  initialFiles: DisciplineCaseFile[];
  canManage: boolean; // Whether teacher can close cases/add notes
};

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  OPEN:         "bg-warn-bg text-warn",
  UNDER_REVIEW: "bg-royal-50 text-royal",
  RESOLVED:     "bg-success-bg text-success",
  ESCALATED:    "bg-danger-bg text-danger",
};
const STATUS_LABELS: Record<string, string> = {
  OPEN:         "Open",
  UNDER_REVIEW: "Under review",
  RESOLVED:     "Resolved",
  ESCALATED:    "Escalated",
};

// ── Close case inline panel ───────────────────────────────────────────────────

function CloseCasePanel({
  recordId,
  studentId,
  currentActionTaken,
  onClosed,
  onCancel,
}: {
  recordId: string;
  studentId: string;
  currentActionTaken: string | null;
  onClosed: (actionTaken: string) => void;
  onCancel: () => void;
}) {
  const [actionTaken, setActionTaken] = useState(currentActionTaken ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  void studentId;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!actionTaken.trim()) {
      setError("Please describe the action taken before closing.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/discipline/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED", actionTaken: actionTaken.trim() }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Could not close the case.");
        return;
      }
      onClosed(actionTaken.trim());
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-success/30 bg-success-bg/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success" />
          Close this case
        </p>
        <button type="button" onClick={onCancel}
          className="h-6 w-6 flex items-center justify-center rounded text-slate hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate mb-1">
            Action taken <span className="text-danger">*</span>
          </label>
          <textarea
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
            rows={3}
            placeholder="Describe what action was taken to resolve this case…"
            className={`${inputClass} resize-none`}
            autoFocus
          />
        </div>
        {error && (
          <p className="text-xs text-danger bg-danger-bg/50 rounded px-3 py-2">{error}</p>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-success text-white text-sm font-semibold px-4 py-2 hover:opacity-90 disabled:opacity-50 transition-opacity">
            <CheckCircle2 className="h-4 w-4" />
            {saving ? "Closing…" : "Close Case"}
          </button>
          <button type="button" onClick={onCancel} className={secondaryButtonClass}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DisciplineCaseClient({
  record: initialRecord,
  initialNotes,
  initialFiles,
  canManage,
}: Props) {
  const [record, setRecord] = useState(initialRecord);
  const [notes, setNotes]   = useState(initialNotes);
  const [files]             = useState(initialFiles);

  const [showNoteForm,   setShowNoteForm]   = useState(false);
  const [showClosePanel, setShowClosePanel] = useState(false);
  const [newNote,  setNewNote]  = useState("");
  const [saving, setSaving]     = useState(false);

  const isOpen        = record.status === "OPEN" || record.status === "UNDER_REVIEW";
  const createdByName = formatCreator(record.recordedBy);

  function handleCaseClosed(actionTaken: string) {
    setRecord((r) => ({ ...r, status: "RESOLVED", actionTaken }));
    setShowClosePanel(false);
  }

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSaving(true);
    const res = await fetch(
      `/api/discipline/${record.id}/notes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newNote.trim() }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
      setShowNoteForm(false);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-5">

      {/* ── Case details card ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Card header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-background/60">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
              STATUS_BADGE[record.status] ?? "bg-line text-slate"
            }`}
          >
            {STATUS_LABELS[record.status] ?? record.status}
          </span>
          {canManage && isOpen && !showClosePanel && (
            <button
              type="button"
              onClick={() => setShowClosePanel(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-success/30 bg-success-bg text-success text-xs font-semibold px-3 py-1.5 hover:bg-success/20 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Close Case
            </button>
          )}
        </div>

        {/* Close case panel */}
        {canManage && showClosePanel && (
          <div className="px-5 py-4 border-b border-border">
            <CloseCasePanel
              recordId={record.id}
              studentId={record.student.id}
              currentActionTaken={record.actionTaken}
              onClosed={handleCaseClosed}
              onCancel={() => setShowClosePanel(false)}
            />
          </div>
        )}

        {/* Detail grid */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y divide-border sm:divide-y-0 sm:divide-x">
          {[
            { label: "Offence",         value: record.offence },
            { label: "Date of offence", value: new Date(record.dateOfOffence).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }) },
            { label: "Created by",      value: createdByName },
            { label: "Action taken",    value: record.actionTaken || "—" },
            { label: "Resolution",      value: record.resolution  || "—" },
          ].map(({ label, value }) => (
            <div key={label} className="px-5 py-4">
              <dt className="text-xs font-medium text-slate mb-1">{label}</dt>
              <dd className="text-sm text-foreground leading-relaxed">{value}</dd>
            </div>
          ))}
          {record.description && (
            <div className="px-5 py-4 sm:col-span-2 lg:col-span-3 border-t border-border">
              <dt className="text-xs font-medium text-slate mb-1">Description</dt>
              <dd className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{record.description}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* ── Timeline ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border bg-background/60">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate" />
            Timeline
          </h3>
        </div>
        <div className="px-5 py-4">
          <ol className="relative border-l border-border ml-2 space-y-4 py-1">
            <li className="ml-5">
              <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-teal" />
              <p className="text-xs font-semibold text-foreground">Case opened</p>
              <p className="text-xs text-slate mt-0.5">
                {new Date(record.createdAt).toLocaleDateString("en-KE", {
                  day: "numeric", month: "long", year: "numeric",
                })}
              </p>
            </li>
            <li className="ml-5">
              <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-teal/40" />
              <p className="text-xs font-semibold text-foreground">Class / Form</p>
              <p className="text-xs text-slate mt-0.5">
                {record.student.schoolClass.name}
                <span className="ml-1.5 text-slate/60">(Form {record.student.schoolClass.form})</span>
              </p>
            </li>
          </ol>
        </div>
      </div>

      {/* ── Case Notes ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-background/60">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-slate" />
            Case Notes
            {notes.length > 0 && (
              <span className="text-xs font-medium text-slate bg-line rounded-full px-2 py-0.5">
                {notes.length}
              </span>
            )}
          </h3>
          {canManage && (
            <button
              type="button"
              className="text-xs text-royal hover:underline font-medium"
              onClick={() => setShowNoteForm((v) => !v)}
            >
              {showNoteForm ? "Cancel" : "+ Add note"}
            </button>
          )}
        </div>

        <div className="px-5 py-4 space-y-3">
          {canManage && showNoteForm && (
            <form onSubmit={handleAddNote} className="space-y-2 pb-3 border-b border-border">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder="Add a note…"
                autoFocus
                required
              />
              <div className="flex gap-2">
                <button type="submit" className={primaryButtonClass} disabled={saving}>
                  {saving ? "Saving…" : "Save note"}
                </button>
                <button type="button" className={secondaryButtonClass}
                  onClick={() => setShowNoteForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {notes.length === 0 ? (
            <p className="text-sm text-slate py-2">No notes yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {notes.map((n) => (
                <li key={n.id}
                  className="rounded-lg border border-border bg-card px-4 py-3">
                  <p className="text-sm text-foreground leading-relaxed">{n.body}</p>
                  <p className="text-xs text-slate mt-1.5">
                    {new Date(n.createdAt).toLocaleString()} · {formatCreator(n.createdBy)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Attached Files ─────────────────────────────────────────────────── */}
      {files.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-background/60">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate" />
              Attached Files
              <span className="text-xs font-medium text-slate bg-line rounded-full px-2 py-0.5">
                {files.length}
              </span>
            </h3>
          </div>
          <div className="px-5 py-4 flex flex-wrap gap-3">
            {files.map((f) => (
              <div key={f.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 max-w-xs">
                {f.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/student-files/${f.id}`}
                    alt={f.fileName}
                    className="w-14 h-14 object-cover rounded-lg border border-border shrink-0"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.src = "/placeholder.svg"; }}
                  />
                ) : (
                  <div className="w-14 h-14 flex items-center justify-center rounded-lg border border-border bg-background shrink-0">
                    <FileText className="h-6 w-6 text-slate" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{f.fileName}</p>
                  <p className="text-xs text-slate">{(f.size / 1024).toFixed(1)} KB</p>
                  <a
                    href={`/api/student-files/${f.id}`}
                    download={f.fileName}
                    className="text-xs text-royal hover:underline"
                  >
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}