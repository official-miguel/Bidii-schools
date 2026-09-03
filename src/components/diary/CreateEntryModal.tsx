"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, BookOpen, RotateCcw, FolderOpen, Megaphone,
  X, Plus, ChevronDown, Loader2, Users, User,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type TeacherContext = {
  subjects:          { id: string; name: string; code: string }[];
  classIdsBySubject: Record<string, string[]>;
  classes:           { id: string; name: string; form: number; stream: string | null }[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: "ASSIGNMENT",   label: "Assignment",   Icon: FileText,   desc: "Questions, exercises, or tasks" },
  { value: "HOMEWORK",     label: "Homework",     Icon: BookOpen,   desc: "Work to complete at home" },
  { value: "REVISION",     label: "Revision",     Icon: RotateCcw,  desc: "Review previous material" },
  { value: "PROJECT",      label: "Project",      Icon: FolderOpen, desc: "Multi-day group or solo project" },
  { value: "ANNOUNCEMENT", label: "Announcement", Icon: Megaphone,  desc: "Subject update or notice" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  ASSIGNMENT:   "Assignment",
  HOMEWORK:     "Homework",
  REVISION:     "Revision",
  PROJECT:      "Project",
  ANNOUNCEMENT: "Announcement",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface CreateEntryModalProps {
  trigger?: "button" | "inline";
}

export default function CreateEntryModal({ trigger = "button" }: CreateEntryModalProps) {
  const router = useRouter();

  // ── Modal state
  const [open, setOpen] = useState(false);

  // ── Form state
  const [entryType,   setEntryType]   = useState("");
  const [subjectId,   setSubjectId]   = useState("");
  const [classIds,    setClassIds]    = useState<string[]>([]);
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [dueDate,     setDueDate]     = useState("");
  const [recipientMode, setRecipientMode] = useState<"everyone" | "specific">("everyone");
  const [specificStudents, setSpecificStudents] = useState<string[]>([]);

  // ── Context + async state
  const [context,     setContext]     = useState<TeacherContext | null>(null);
  const [ctxLoading,  setCtxLoading]  = useState(false);
  const [students,    setStudents]    = useState<{ id: string; fullName: string }[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  // ── Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  // ── Load teacher context when modal opens
  useEffect(() => {
    if (open && !context) {
      setCtxLoading(true);
      fetch("/api/diary/teacher-context")
        .then((r) => r.json())
        .then((data: TeacherContext) => {
          setContext(data);
          // Auto-select subject if only one
          if (data.subjects.length === 1) {
            setSubjectId(data.subjects[0].id);
          }
        })
        .catch(() => setError("Couldn't load your teaching assignments. Please refresh."))
        .finally(() => setCtxLoading(false));
    }
  }, [open, context]);

  // ── Load students when class selection changes (for specific mode)
  useEffect(() => {
    if (recipientMode !== "specific" || classIds.length === 0) {
      setStudents([]);
      return;
    }
    setStudentsLoading(true);

    // Fetch students for each selected class in parallel using existing /api/students endpoint
    Promise.all(
      classIds.map((classId) =>
        fetch(`/api/students?classId=${classId}&limit=200`)
          .then((r) => r.ok ? r.json() : { students: [] })
          .then((data) => (Array.isArray(data) ? data : (data.students ?? [])) as { id: string; fullName: string }[])
          .catch(() => [] as { id: string; fullName: string }[])
      )
    )
      .then((results) => {
        // Merge and deduplicate by id
        const seen  = new Set<string>();
        const merged: { id: string; fullName: string }[] = [];
        for (const arr of results) {
          for (const s of arr) {
            if (!seen.has(s.id)) {
              seen.add(s.id);
              merged.push(s);
            }
          }
        }
        merged.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setStudents(merged);
      })
      .finally(() => setStudentsLoading(false));
  }, [recipientMode, classIds]);

  // ── Derived
  const availableClasses = context && subjectId
    ? (context.classIdsBySubject[subjectId] ?? [])
        .map((id) => context.classes.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => !!c)
    : [];

  const showSubjectSelector = context && context.subjects.length > 1;
  const showDueDate         = entryType !== "" && entryType !== "ANNOUNCEMENT";
  const postLabel           = entryType ? `Post ${TYPE_LABELS[entryType]}` : "Post";
  const selectedSubject     = context?.subjects.find((s) => s.id === subjectId);

  const filteredStudents = students.filter((s) =>
    s.fullName.toLowerCase().includes(studentSearch.toLowerCase())
  );

  // ── Handlers
  const toggleClass = (classId: string) => {
    setClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const toggleStudent = (studentId: string) => {
    setSpecificStudents((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const resetForm = useCallback(() => {
    setEntryType("");
    setSubjectId(context?.subjects.length === 1 ? (context.subjects[0].id ?? "") : "");
    setClassIds([]);
    setTitle("");
    setDescription("");
    setDueDate("");
    setRecipientMode("everyone");
    setSpecificStudents([]);
    setStudentSearch("");
    setError(null);
    setTitleError(null);
  }, [context]);

  const handleClose = () => {
    setOpen(false);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTitleError(null);
    setError(null);

    if (!title.trim()) {
      setTitleError("Add a title before posting.");
      return;
    }
    if (!entryType) {
      setError("Choose a type for this entry.");
      return;
    }
    if (!subjectId) {
      setError("Select a subject.");
      return;
    }
    if (classIds.length === 0) {
      setError("Select at least one class.");
      return;
    }

    setSubmitting(true);

    const body: Record<string, unknown> = {
      subjectId,
      classIds,
      title:       title.trim(),
      description: description.trim() || undefined,
      entryType,
      dueDate:     dueDate || null,
    };

    if (recipientMode === "specific" && specificStudents.length > 0) {
      body.studentIds = specificStudents;
    }

    try {
      const res = await fetch("/api/diary", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      handleClose();
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  // ── Trigger button
  const triggerButton = trigger === "inline" ? (
    <button
      onClick={() => setOpen(true)}
      className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-teal text-white rounded-lg text-sm font-medium hover:bg-teal-dark transition-colors min-h-[44px]"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      New Entry
    </button>
  ) : (
    <button
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal text-white rounded-lg text-sm font-semibold hover:bg-teal-dark transition-colors shadow-sm min-h-[44px]"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      New Entry
    </button>
  );

  return (
    <>
      {triggerButton}

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="New Diary Entry"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-ink/40 dark:bg-black/60"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative z-10 w-full sm:max-w-xl bg-card dark:bg-dark-surface rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92dvh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-line dark:border-dark-border shrink-0">
              <h2 className="text-base font-semibold text-ink dark:text-dark-text">New Diary Entry</h2>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg text-slate hover:bg-line dark:text-dark-muted dark:hover:bg-dark-border min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {ctxLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 text-teal animate-spin" />
                  <span className="ml-2 text-sm text-slate dark:text-dark-muted">Loading your classes…</span>
                </div>
              ) : (
                <form id="create-diary-form" onSubmit={handleSubmit} noValidate>
                  {/* ── Step 1: Entry type ────────────────────────────────── */}
                  <fieldset>
                    <legend className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted mb-2">
                      What are you posting?
                    </legend>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {TYPE_OPTIONS.map(({ value, label, Icon, desc }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setEntryType(value)}
                          className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all min-h-[72px]
                            ${entryType === value
                              ? "border-teal bg-teal/5 dark:bg-teal/10"
                              : "border-line bg-card hover:border-teal/40 hover:bg-teal/5 dark:border-dark-border dark:bg-dark-surface dark:hover:border-teal/30"
                            }`}
                          aria-pressed={entryType === value}
                        >
                          <Icon className={`h-4 w-4 mb-1.5 ${entryType === value ? "text-teal" : "text-slate dark:text-dark-muted"}`} aria-hidden="true" />
                          <span className={`text-sm font-medium leading-none ${entryType === value ? "text-teal" : "text-ink dark:text-dark-text"}`}>
                            {label}
                          </span>
                          <span className="text-[11px] text-slate dark:text-dark-muted mt-1 leading-tight line-clamp-2">
                            {desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {/* ── Step 2: Subject (hidden if only 1) ──────────────── */}
                  {showSubjectSelector && (
                    <div>
                      <label className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted block mb-1.5">
                        Subject
                      </label>
                      <div className="relative">
                        <select
                          value={subjectId}
                          onChange={(e) => { setSubjectId(e.target.value); setClassIds([]); }}
                          className="w-full appearance-none bg-card border border-line dark:border-dark-border dark:bg-dark-surface rounded-lg px-3 py-2.5 pr-8 text-sm text-ink dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-teal/30 min-h-[44px]"
                        >
                          <option value="">Choose subject…</option>
                          {context!.subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none dark:text-dark-muted" aria-hidden="true" />
                      </div>
                    </div>
                  )}

                  {/* Auto-selected subject hint */}
                  {!showSubjectSelector && selectedSubject && (
                    <p className="text-xs text-slate dark:text-dark-muted -mt-1">
                      Subject: <span className="font-medium text-ink dark:text-dark-text">{selectedSubject.name}</span>
                    </p>
                  )}

                  {/* ── Step 3: Class selection ──────────────────────────── */}
                  {subjectId && availableClasses.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted block mb-1.5">
                        Who is this for?
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {availableClasses.map((cls) => (
                          <button
                            key={cls.id}
                            type="button"
                            onClick={() => toggleClass(cls.id)}
                            className={`px-3.5 py-2 rounded-lg border text-sm font-medium transition-all min-h-[44px]
                              ${classIds.includes(cls.id)
                                ? "border-teal bg-teal/5 text-teal dark:bg-teal/10"
                                : "border-line text-slate hover:border-teal/40 hover:bg-teal/5 dark:border-dark-border dark:text-dark-muted dark:hover:border-teal/30"
                              }`}
                            aria-pressed={classIds.includes(cls.id)}
                          >
                            {cls.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Step 4: Recipient toggle ─────────────────────────── */}
                  {classIds.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted block mb-1.5">
                        Who should receive this?
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRecipientMode("everyone")}
                          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-sm font-medium transition-all min-h-[44px]
                            ${recipientMode === "everyone"
                              ? "border-teal bg-teal/5 text-teal dark:bg-teal/10"
                              : "border-line text-slate hover:border-teal/40 dark:border-dark-border dark:text-dark-muted"
                            }`}
                          aria-pressed={recipientMode === "everyone"}
                        >
                          <Users className="h-4 w-4" aria-hidden="true" />
                          Everyone
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecipientMode("specific")}
                          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-sm font-medium transition-all min-h-[44px]
                            ${recipientMode === "specific"
                              ? "border-teal bg-teal/5 text-teal dark:bg-teal/10"
                              : "border-line text-slate hover:border-teal/40 dark:border-dark-border dark:text-dark-muted"
                            }`}
                          aria-pressed={recipientMode === "specific"}
                        >
                          <User className="h-4 w-4" aria-hidden="true" />
                          Specific students
                        </button>
                      </div>

                      {/* Specific student selector */}
                      {recipientMode === "specific" && (
                        <div className="mt-2 border border-line dark:border-dark-border rounded-xl overflow-hidden">
                          <div className="p-2 border-b border-line dark:border-dark-border">
                            <input
                              type="text"
                              placeholder="Search students…"
                              value={studentSearch}
                              onChange={(e) => setStudentSearch(e.target.value)}
                              className="w-full bg-transparent text-sm text-ink dark:text-dark-text placeholder:text-slate outline-none py-1 px-2"
                            />
                          </div>
                          {studentsLoading ? (
                            <div className="p-4 text-center text-sm text-slate dark:text-dark-muted">
                              Loading students…
                            </div>
                          ) : (
                            <div className="max-h-48 overflow-y-auto">
                              <button
                                type="button"
                                onClick={() => setSpecificStudents(
                                  specificStudents.length === filteredStudents.length
                                    ? []
                                    : filteredStudents.map((s) => s.id)
                                )}
                                className="w-full text-left px-3 py-2 text-xs font-medium text-teal hover:bg-teal/5 border-b border-line dark:border-dark-border min-h-[36px]"
                              >
                                {specificStudents.length === filteredStudents.length ? "Deselect all" : "Select all"}
                              </button>
                              {filteredStudents.map((student) => (
                                <label
                                  key={student.id}
                                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-teal/5 transition-colors min-h-[44px]"
                                >
                                  <input
                                    type="checkbox"
                                    checked={specificStudents.includes(student.id)}
                                    onChange={() => toggleStudent(student.id)}
                                    className="h-4 w-4 rounded border-slate text-teal focus:ring-teal/30"
                                  />
                                  <span className="text-sm text-ink dark:text-dark-text">{student.fullName}</span>
                                </label>
                              ))}
                              {filteredStudents.length === 0 && (
                                <p className="p-4 text-sm text-slate dark:text-dark-muted text-center">
                                  No students found.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Step 5: Title ────────────────────────────────────── */}
                  <div>
                    <label htmlFor="diary-title" className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted block mb-1.5">
                      Title <span className="text-danger" aria-label="required">*</span>
                    </label>
                    <input
                      id="diary-title"
                      type="text"
                      value={title}
                      onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(null); }}
                      placeholder="e.g. Algebra Practice — Chapter 4"
                      maxLength={255}
                      className={`w-full bg-card border dark:bg-dark-surface rounded-lg px-3 py-2.5 text-sm text-ink dark:text-dark-text placeholder:text-slate focus:outline-none focus:ring-2 focus:ring-teal/30 min-h-[44px]
                        ${titleError ? "border-danger" : "border-line dark:border-dark-border"}`}
                      aria-describedby={titleError ? "title-error" : undefined}
                      aria-invalid={!!titleError}
                    />
                    {titleError && (
                      <p id="title-error" className="mt-1 text-xs text-danger">{titleError}</p>
                    )}
                  </div>

                  {/* ── Step 6: Instructions ─────────────────────────────── */}
                  <div>
                    <label htmlFor="diary-description" className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted block mb-1.5">
                      Instructions
                    </label>
                    <textarea
                      id="diary-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Complete questions 1–10 from Chapter 4. Show all your working."
                      rows={4}
                      className="w-full bg-card border border-line dark:border-dark-border dark:bg-dark-surface rounded-lg px-3 py-2.5 text-sm text-ink dark:text-dark-text placeholder:text-slate focus:outline-none focus:ring-2 focus:ring-teal/30 resize-y"
                    />
                  </div>

                  {/* ── Step 7: Due date (hidden for ANNOUNCEMENT) ───────── */}
                  {showDueDate && (
                    <div>
                      <label htmlFor="diary-duedate" className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted block mb-1.5">
                        Due Date
                      </label>
                      <input
                        id="diary-duedate"
                        type="date"
                        value={dueDate ? dueDate.split("T")[0] : ""}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={(e) => setDueDate(e.target.value ? `${e.target.value}T23:59:00+03:00` : "")}
                        className="w-full bg-card border border-line dark:border-dark-border dark:bg-dark-surface rounded-lg px-3 py-2.5 text-sm text-ink dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-teal/30 min-h-[44px]"
                      />
                    </div>
                  )}

                  {/* ── Error ────────────────────────────────────────────── */}
                  {error && (
                    <div className="rounded-lg bg-danger-bg border border-danger/20 px-3.5 py-2.5 text-sm text-danger" role="alert">
                      {error}
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Footer with post button */}
            {!ctxLoading && (
              <div className="px-5 pb-5 pt-3 border-t border-line dark:border-dark-border shrink-0">
                <button
                  type="submit"
                  form="create-diary-form"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-teal text-white rounded-xl py-3 text-sm font-semibold hover:bg-teal-dark disabled:opacity-60 disabled:cursor-not-allowed transition-colors min-h-[52px]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Posting…
                    </>
                  ) : (
                    postLabel
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
