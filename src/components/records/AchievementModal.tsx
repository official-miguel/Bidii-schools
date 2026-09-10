"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { ErrorBanner, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { Avatar, Achievement, StudentLite, CATEGORY_META } from "./shared";
import { useFormDraft } from "@/lib/hooks/useFormDraft";

type Suggestion = {
  title: string;
  category: string;
  summary: string;
  keywords: string[];
  awardLevel: string;
};

export default function AchievementModal({
  students,
  editing,
  initialStudentIds,
  onClose,
  onSaved,
}: {
  students: StudentLite[];
  editing: Achievement | null;
  initialStudentIds?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Scope key to the record being edited; "new" for creates
  const draftKey = `bidii_draft_achievement_${editing?.id ?? "new"}`;
  const [draft, setDraft, clearDraft] = useFormDraft(draftKey, {
    text:        editing?.description          ?? "",
    title:       editing?.title                ?? "",
    category:    editing?.category             ?? "OTHER",
    awardLevel:  editing?.awardLevel           ?? "",
    date:        editing?.achievementDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    selectedIds: (editing ? editing.students.map((s) => s.student.id) : initialStudentIds) ?? [] as string[],
  });

  const [text, setText]           = useState(draft.text);
  const [title, setTitle]         = useState(draft.title);
  const [category, setCategory]   = useState(draft.category);
  const [awardLevel, setAwardLevel] = useState(draft.awardLevel);
  const [date, setDate]           = useState(draft.date);
  const [selectedIds, setSelectedIds] = useState<string[]>(draft.selectedIds);
  const [studentQuery, setStudentQuery] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Persist on change
  useEffect(() => {
    setDraft({ text, title, category, awardLevel, date, selectedIds });
  }, [text, title, category, awardLevel, date, selectedIds, setDraft]);

  const selected = useMemo(
    () => selectedIds.map((id) => students.find((s) => s.id === id)).filter(Boolean) as StudentLite[],
    [selectedIds, students]
  );

  const matches = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(
        (s) =>
          !selectedIds.includes(s.id) &&
          (s.fullName.toLowerCase().includes(q) || s.admissionNumber.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [students, studentQuery, selectedIds]);

  // Debounced AI simplification of the natural description.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (text.trim().length < 12 || (editing && text === editing.description)) return;
    debounceRef.current = setTimeout(async () => {
      setSuggesting(true);
      try {
        const res = await fetch("/api/achievements/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const { suggestion: s } = await res.json();
          if (s) {
            setSuggestion(s);
            setTitle((t) => t || s.title);
            setCategory((c) => (c === "OTHER" ? s.category : c));
            setAwardLevel((a) => a || s.awardLevel);
          }
        }
      } finally {
        setSuggesting(false);
      }
    }, 900);
    return () => clearTimeout(debounceRef.current);
  }, [text, editing]);

  async function save() {
    if (selectedIds.length === 0) return setError("Add at least one student.");
    if (!title.trim() && text.trim().length < 4) return setError("Describe the achievement.");
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim() || text.trim().slice(0, 60),
      category,
      description: text.trim(),
      achievementDate: date,
      awardLevel: awardLevel.trim(),
      studentIds: selectedIds,
    };
    const res = await fetch(editing ? `/api/achievements/${editing.id}` : "/api/achievements", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error || "Couldn't save the achievement.");
      return;
    }
    clearDraft();
    onSaved();
  }

  return (
    <Modal title={editing ? "Edit Achievement" : "Add Achievement"} onClose={onClose}>
      {error && <ErrorBanner message={error} />}
      <div className="space-y-4">
        <div>
          <label className={labelClass}>What did they achieve?</label>
          <textarea
            rows={2}
            className={inputClass}
            autoFocus
            placeholder='e.g. "Represented the school in county football and won."'
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {suggesting && (
            <p className="text-xs text-royal mt-1 flex items-center gap-1.5" aria-live="polite">
              <span className="inline-block w-3 h-3 border-2 border-royal border-t-transparent rounded-full animate-spin" />
              AI is simplifying…
            </p>
          )}
        </div>

        {suggestion && (
          <div className="rounded-lg border border-royal/20 bg-royal-50/60 p-3 space-y-1.5">
            <p className="text-xs font-medium text-royal">✨ AI simplified — confirm or edit below</p>
            <p className="text-sm text-foreground">{suggestion.summary}</p>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {suggestion.keywords.map((k) => (
                <span key={k} className="px-2 py-0.5 rounded-full bg-card border border-border text-slate">#{k}</span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Title</label>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(CATEGORY_META).map(([v, m]) => (
                <option key={v} value={v}>
                  {m.emoji} {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Date</label>
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Award level</label>
            <input className={inputClass} value={awardLevel} onChange={(e) => setAwardLevel(e.target.value)} placeholder="e.g. County, National" />
          </div>
        </div>

        {/* Shared achievement — searchable avatar chips */}
        <div>
          <label className={labelClass}>
            Students{" "}
            <span className="text-danger font-semibold" aria-hidden title="Required">
              *
            </span>{" "}
            <span className="text-slate font-normal">
              {selected.length > 0
                ? `(${selected.length} linked)`
                : "— required"}
            </span>
          </label>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selected.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 bg-background border border-border rounded-full pl-1 pr-2 py-0.5 text-sm text-foreground">
                  <Avatar name={s.fullName} size="sm" />
                  {s.fullName.split(" ")[0]}
                  <button
                    type="button"
                    aria-label={`Remove ${s.fullName}`}
                    className="text-slate hover:text-danger"
                    onClick={() => setSelectedIds((prev) => prev.filter((id) => id !== s.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button type="button" className="text-xs text-slate hover:text-danger self-center" onClick={() => setSelectedIds([])}>
                Clear all
              </button>
            </div>
          )}
          <div className="relative">
            <input
              className={inputClass}
              placeholder="Search a student to add…"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              autoComplete="off"
            />
            {matches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden" role="listbox">
                {matches.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-background focus:bg-background outline-none"
                      onClick={() => {
                        setSelectedIds((prev) => (prev.includes(s.id) ? prev : [...prev, s.id]));
                        setStudentQuery("");
                      }}
                    >
                      <Avatar name={s.fullName} size="sm" />
                      <span className="text-foreground">{s.fullName}</span>
                      <span className="text-xs text-slate font-mono ml-auto">{s.admissionNumber}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selected.length === 0 && (
            <p className="text-xs text-danger mt-1.5 flex items-center gap-1">
              <span aria-hidden>⚠️</span>
              At least one student must be linked before saving.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={saving || selectedIds.length === 0}
            title={selectedIds.length === 0 ? "Add at least one student to save" : undefined}
            onClick={save}
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Save achievement"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
