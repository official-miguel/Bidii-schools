"use client";

import { useState, useEffect } from "react";
import { groupToken } from "@/lib/messaging/placeholders";
import { useFormDraft } from "@/lib/hooks/useFormDraft";

interface Template { id: string; name: string; category: string | null; body: string }
interface Group    { id: string; name: string }

interface Props {
  initial?: Template;
  groups?:  Group[];
  onSaved:  () => void;
  onCancel: () => void;
}

const CATEGORIES = ["Fee Reminder","Meeting Notice","Exam Reminder","Holiday","Emergency","Attendance","Results","Other"];

const PLACEHOLDERS: { token: string; label: string }[] = [
  { token: "/name",      label: "/name" },
  { token: "/class",     label: "/class" },
  { token: "/stream",    label: "/stream" },
  { token: "/Admission", label: "/Admission" },
  { token: "/staffname", label: "/staffname" },
  { token: "/staffno",   label: "/staffno" },
  { token: "/results",   label: "/results" },
];

const TOKEN_COLOURS: Record<string, string> = {
  "/name":      "bg-royal/10 text-royal",
  "/class":     "bg-emerald-100 text-emerald-700",
  "/stream":    "bg-purple-100 text-purple-700",
  "/Admission": "bg-amber-100 text-amber-700",
  "/staffname": "bg-pink-100 text-pink-700",
  "/staffno":   "bg-orange-100 text-orange-700",
  "/results":   "bg-slate/10 text-slate",
};

export default function TemplateEditor({ initial, groups = [], onSaved, onCancel }: Props) {
  // Draft key is scoped to the record id so edit drafts don't bleed across templates.
  // New templates use the key "new".
  const draftKey = `bidii_draft_template_${initial?.id ?? "new"}`;
  const [draft, setDraft, clearDraft] = useFormDraft(draftKey, {
    name:     initial?.name     ?? "",
    category: initial?.category ?? "",
    body:     initial?.body     ?? "",
  });

  const [name, setName]         = useState(draft.name);
  const [category, setCategory] = useState(draft.category);
  const [body, setBody]         = useState(draft.body);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  // Persist on every change
  useEffect(() => { setDraft({ name, category, body }); }, [name, category, body, setDraft]);


  function insertToken(token: string) {
    // Insert at cursor if textarea is focused, otherwise append
    const ta = document.querySelector<HTMLTextAreaElement>("[data-template-body]");
    if (ta) {
      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      const next  = body.slice(0, start) + token + body.slice(end);
      setBody(next);
      // Restore cursor after state update
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      setBody((b) => b + token);
    }
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    if (!body.trim()) { setError("Body is required."); return; }
    setSaving(true); setError("");

    const url    = initial ? `/api/messaging/templates/${initial.id}` : "/api/messaging/templates";
    const method = initial ? "PUT" : "POST";

    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: name.trim(), category: category || null, body: body.trim() }),
    });

    if (r.ok) { clearDraft(); onSaved(); }
    else {
      const d = await r.json() as { error?: string };
      setError(d.error ?? "Could not save template.");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate mb-1">Template name *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fee Reminder"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-royal focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate mb-1">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-royal focus:outline-none">
            <option value="">— None —</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-slate">Message body *</label>
        </div>

        {/* ── Placeholder chips — static tokens ── */}
        <div className="mb-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-semibold text-slate uppercase tracking-wide mr-1 shrink-0">Student</span>
            {PLACEHOLDERS.filter(p => ["/name","/class","/stream","/Admission","/results"].includes(p.token)).map((p) => (
              <button key={p.token} type="button" onClick={() => insertToken(p.token)}
                className={`rounded-full px-2 py-0.5 text-xs font-medium border ${TOKEN_COLOURS[p.token] ?? "bg-slate/10 text-slate"} border-transparent hover:opacity-80 transition-opacity`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-semibold text-slate uppercase tracking-wide mr-1 shrink-0">Staff</span>
            {PLACEHOLDERS.filter(p => ["/staffname","/staffno"].includes(p.token)).map((p) => (
              <button key={p.token} type="button" onClick={() => insertToken(p.token)}
                className={`rounded-full px-2 py-0.5 text-xs font-medium border ${TOKEN_COLOURS[p.token] ?? "bg-slate/10 text-slate"} border-transparent hover:opacity-80 transition-opacity`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* ── Per-group tokens — one row per group ── */}
          {groups.length > 0 && groups.map((g) => {
            const token = groupToken(g.name);
            return (
              <div key={g.id} className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] font-semibold text-slate uppercase tracking-wide mr-1 shrink-0 max-w-[80px] truncate" title={g.name}>
                  {g.name}
                </span>
                <button type="button" onClick={() => insertToken(token)}
                  className="rounded-full px-2 py-0.5 text-xs font-medium border bg-violet-100 text-violet-700 border-transparent hover:opacity-80 transition-opacity">
                  {token}
                </button>
              </div>
            );
          })}
        </div>
        <textarea
          data-template-body
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Type your template… Click a placeholder button above to insert it at the cursor."
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-royal focus:outline-none resize-none"
        />
        <p className="text-xs text-slate mt-1">{body.length} characters</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="rounded-md bg-royal text-white text-sm font-medium px-4 py-2 hover:bg-royal-light transition-colors disabled:opacity-60">
          {saving ? "Saving…" : initial ? "Update template" : "Create template"}
        </button>
        <button onClick={onCancel}
          className="rounded-md border border-border text-sm font-medium px-4 py-2 text-foreground hover:bg-background transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
