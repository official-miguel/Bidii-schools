"use client";

import { useEffect, useState } from "react";
import {
  Settings, Eye, EyeOff, Copy, CheckCircle2, Save, Loader2,
  CalendarDays, Plus, Pencil, Trash2, X, Check,
} from "lucide-react";
import {
  PageHeader, FormField, inputClass, primaryButtonClass,
  ErrorBanner, SuccessBanner,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface FinanceSettings {
  receiptPrefix: string;
  invoicePrefix: string;
}

interface FinancialTermName {
  id:        string;
  name:      string;
  createdAt: string;
}

// ── Financial Academic Term Names Section ──────────────────────────────────

const rowInputCls =
  "flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

function TermNamesSection() {
  const [termNames,    setTermNames]    = useState<FinancialTermName[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [newName,      setNewName]      = useState("");
  const [adding,       setAdding]       = useState(false);
  const [addError,     setAddError]     = useState<string | null>(null);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editName,     setEditName]     = useState("");
  const [saving,       setSaving]       = useState(false);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/finance/academic-term-names")
      .then(r => r.ok ? r.json() : { termNames: [] })
      .then(d => { setTermNames(d.termNames ?? []); setLoading(false); });
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!newName.trim()) { setAddError("Enter a term name."); return; }
    setAdding(true);

    const res  = await fetch("/api/finance/academic-term-names", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setAddError(data.error ?? "Failed to add."); setAdding(false); return; }

    setTermNames(prev => [...prev, data.termName]);
    setNewName("");
    setAdding(false);
  }

  function startEdit(tn: FinancialTermName) {
    setEditingId(tn.id);
    setEditName(tn.name);
    setSectionError(null);
  }

  async function handleEdit(id: string) {
    setSectionError(null);
    if (!editName.trim()) return;
    setSaving(true);

    const res  = await fetch(`/api/finance/academic-term-names/${id}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: editName.trim() }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setSectionError(data.error ?? "Failed to update."); return; }

    setTermNames(prev => prev.map(t => t.id === id ? data.termName : t));
    setEditingId(null);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone if it's not in use.`)) return;
    setDeletingId(id);
    setSectionError(null);

    const res  = await fetch(`/api/finance/academic-term-names/${id}`, { method: "DELETE" });
    const data = await res.json();
    setDeletingId(null);
    if (!res.ok) { setSectionError(data.error ?? "Failed to delete."); return; }

    setTermNames(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div className="bg-white border border-line rounded-xl p-5 space-y-4 dark:bg-dark-surface dark:border-dark-border">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink dark:text-dark-text flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-teal" aria-hidden="true" />
          Financial Academic Terms
        </h2>
        <p className="text-xs text-slate dark:text-dark-muted hidden sm:block">
          Define the term labels used across the finance module, e.g. &quot;Term 1&quot;, &quot;Term 2&quot;.
        </p>
      </div>

      {sectionError && (
        <p className="text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2">
          {sectionError}
        </p>
      )}

      {/* Existing term names */}
      {loading ? (
        <div className="text-sm text-slate dark:text-dark-muted">Loading…</div>
      ) : termNames.length === 0 ? (
        <p className="text-sm text-slate dark:text-dark-muted">
          No term names yet. Add your first one below.
        </p>
      ) : (
        <ul className="divide-y divide-line dark:divide-dark-border">
          {termNames.map(tn => (
            <li key={tn.id} className="py-2.5 flex items-center gap-2">
              {editingId === tn.id ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className={rowInputCls}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); handleEdit(tn.id); }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleEdit(tn.id)}
                    disabled={saving}
                    className="shrink-0 text-teal hover:text-teal/80 disabled:opacity-50"
                    aria-label="Save"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="shrink-0 text-slate hover:text-ink dark:text-dark-muted"
                    aria-label="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-ink dark:text-dark-text">{tn.name}</span>
                  <button
                    type="button"
                    onClick={() => startEdit(tn)}
                    className="shrink-0 text-slate hover:text-teal transition-colors"
                    aria-label={`Rename ${tn.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(tn.id, tn.name)}
                    disabled={deletingId === tn.id}
                    className="shrink-0 text-slate hover:text-danger transition-colors disabled:opacity-40"
                    aria-label={`Delete ${tn.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add new */}
      <form onSubmit={handleAdd} className="flex gap-2 pt-1">
        <input
          type="text"
          value={newName}
          onChange={e => { setNewName(e.target.value); setAddError(null); }}
          placeholder="e.g. Term 1"
          className={rowInputCls}
        />
        <button
          type="submit"
          disabled={adding}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-2 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-60 transition-colors"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </form>
      {addError && <p className="text-xs text-danger">{addError}</p>}
    </div>
  );
}

// ── M-Pesa Paybills Section ────────────────────────────────────────────────

interface Paybill {
  id:            string;
  label:         string;
  paybillNumber: string;
  webhookUrl:    string;
  isActive:      boolean;
}

function PaybillsSection() {
  const [paybills,   setPaybills]   = useState<Paybill[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [adding,     setAdding]     = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm,   setShowForm]   = useState(false);
  const [formErr,    setFormErr]    = useState<string | null>(null);
  const [sectionErr, setSectionErr] = useState<string | null>(null);
  const [copied,     setCopied]     = useState<string | null>(null);

  const [newLabel,         setNewLabel]         = useState("");
  const [newPaybillNumber, setNewPaybillNumber] = useState("");
  const [newSecret,        setNewSecret]        = useState("");
  const [showNewSecret,    setShowNewSecret]     = useState(false);

  // Edit state
  const [editLabel,         setEditLabel]         = useState("");
  const [editPaybillNumber, setEditPaybillNumber] = useState("");
  const [editSecret,        setEditSecret]        = useState("");

  useEffect(() => {
    fetch("/api/finance/mpesa/paybills")
      .then(r => r.ok ? r.json() : { paybills: [] })
      .then(d => { setPaybills(d.paybills ?? []); setLoading(false); });
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    if (!newLabel.trim() || !newPaybillNumber.trim()) { setFormErr("Label and paybill number are required."); return; }
    setAdding(true);
    const res  = await fetch("/api/finance/mpesa/paybills", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ label: newLabel.trim(), paybillNumber: newPaybillNumber.trim(), webhookSecret: newSecret.trim() || null }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) { setFormErr(data.error ?? "Failed to add."); return; }
    setPaybills(prev => [...prev, data.paybill]);
    setNewLabel(""); setNewPaybillNumber(""); setNewSecret(""); setShowForm(false);
  }

  function startEdit(p: Paybill) {
    setEditingId(p.id);
    setEditLabel(p.label);
    setEditPaybillNumber(p.paybillNumber);
    setEditSecret("");
    setSectionErr(null);
  }

  async function handleEdit(id: string) {
    setSectionErr(null);
    const body: Record<string, unknown> = { label: editLabel.trim(), paybillNumber: editPaybillNumber.trim() };
    if (editSecret.trim()) body.webhookSecret = editSecret.trim();
    const res  = await fetch(`/api/finance/mpesa/paybills/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { setSectionErr(data.error ?? "Failed to update."); return; }
    setPaybills(prev => prev.map(p => p.id === id ? data.paybill : p));
    setEditingId(null);
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete paybill "${label}"? This will stop processing payments from this paybill.`)) return;
    setDeletingId(id);
    setSectionErr(null);
    const res  = await fetch(`/api/finance/mpesa/paybills/${id}`, { method: "DELETE" });
    const data = await res.json();
    setDeletingId(null);
    if (!res.ok) { setSectionErr(data.error ?? "Failed to delete."); return; }
    setPaybills(prev => prev.filter(p => p.id !== id));
  }

  async function copyUrl(webhookUrl: string) {
    const url = `${window.location.origin}/api/finance/mpesa/webhook/${webhookUrl}`;
    await navigator.clipboard.writeText(url);
    setCopied(webhookUrl);
    setTimeout(() => setCopied(null), 2500);
  }

  return (
    <div className="bg-white border border-line rounded-xl p-5 space-y-4 dark:bg-dark-surface dark:border-dark-border">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink dark:text-dark-text">M-Pesa Paybills</h2>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-teal hover:text-teal/80 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add paybill
        </button>
      </div>

      {sectionErr && <p className="text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2">{sectionErr}</p>}

      {loading ? (
        <p className="text-sm text-slate dark:text-dark-muted">Loading…</p>
      ) : paybills.length === 0 && !showForm ? (
        <p className="text-sm text-slate dark:text-dark-muted">No paybills configured yet. Add your first one above.</p>
      ) : (
        <ul className="divide-y divide-line dark:divide-dark-border">
          {paybills.map(p => (
            <li key={p.id} className="py-3 space-y-2">
              {editingId === p.id ? (
                <div className="space-y-2">
                  <input type="text" value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Label e.g. Main Fees" className={rowInputCls} />
                  <input type="text" value={editPaybillNumber} onChange={e => setEditPaybillNumber(e.target.value)} placeholder="Paybill / Till number" className={rowInputCls} />
                  <input type="password" value={editSecret} onChange={e => setEditSecret(e.target.value)} placeholder="New webhook secret (leave blank to keep)" className={rowInputCls} autoComplete="new-password" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleEdit(p.id)} className="text-xs text-teal font-medium hover:underline">Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-slate hover:text-ink">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink dark:text-dark-text">{p.label}</p>
                      <p className="text-xs font-mono text-slate dark:text-dark-muted">{p.paybillNumber}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => startEdit(p)} className="text-slate hover:text-teal transition-colors" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => handleDelete(p.id, p.label)} disabled={deletingId === p.id} className="text-slate hover:text-danger transition-colors disabled:opacity-40" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <code className="flex-1 text-[10px] font-mono bg-paper border border-line rounded px-2 py-1 text-ink truncate dark:bg-dark-border/30 dark:border-dark-border dark:text-dark-text">
                      {typeof window !== "undefined" ? `${window.location.origin}/api/finance/mpesa/webhook/${p.webhookUrl}` : `/api/finance/mpesa/webhook/${p.webhookUrl}`}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyUrl(p.webhookUrl)}
                      className="shrink-0 inline-flex items-center gap-1 rounded border border-line bg-white px-2 py-1 text-xs text-slate hover:text-ink dark:bg-dark-surface dark:border-dark-border"
                    >
                      {copied === p.webhookUrl ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === p.webhookUrl ? "Copied" : "Copy"}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="border-t border-line dark:border-dark-border pt-4 space-y-2">
          {formErr && <p className="text-xs text-danger">{formErr}</p>}
          <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label e.g. Main Fees Paybill" className={rowInputCls} required />
          <input type="text" value={newPaybillNumber} onChange={e => setNewPaybillNumber(e.target.value)} placeholder="Paybill / Till number e.g. 522533" className={rowInputCls} required />
          <div className="relative">
            <input
              type={showNewSecret ? "text" : "password"}
              value={newSecret}
              onChange={e => setNewSecret(e.target.value)}
              placeholder="Daraja webhook secret (optional)"
              className={rowInputCls + " pr-10"}
              autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowNewSecret(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink">
              {showNewSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={adding}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3 py-2 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-60 transition-colors">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {adding ? "Adding…" : "Add paybill"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 text-sm text-slate hover:text-ink">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Main Settings Page ─────────────────────────────────────────────────────

export default function FinanceSettingsPage() {
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [form, setForm] = useState({
    receiptPrefix: "REC-",
    invoicePrefix: "INV-",
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/finance/settings")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.settings) {
          const s: FinanceSettings = data.settings;
          setSettings(s);
          setForm(f => ({
            ...f,
            receiptPrefix: s.receiptPrefix ?? "REC-",
            invoicePrefix: s.invoicePrefix ?? "INV-",
          }));
        }
        setLoading(false);
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const body: Record<string, unknown> = {
      receiptPrefix: form.receiptPrefix.trim() || "REC-",
      invoicePrefix: form.invoicePrefix.trim() || "INV-",
    };

    const res = await fetch("/api/finance/settings", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
      setSuccess("Settings saved successfully.");
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to save settings.");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Finance Settings" description="Configure thresholds, prefixes, term names, and M-Pesa integration." />
        <div className="space-y-3 max-w-2xl">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl border border-line bg-paper animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Finance Settings"
        description="Configure thresholds, receipt prefixes, financial term names, and M-Pesa integration."
      />

      <div className="space-y-6">
        {error   && <ErrorBanner   message={error}   onDismiss={() => setError(null)}   />}
        {success && <SuccessBanner message={success} onDismiss={() => setSuccess(null)} />}

        {/* ── Financial Academic Terms (term name definitions) ── */}
        <TermNamesSection />

        {/* ── M-Pesa Paybills ── */}
        <PaybillsSection />

        {/* ── General finance settings form ── */}
        <form onSubmit={save} className="space-y-6">
          <div className="bg-white border border-line rounded-xl p-5 space-y-4 dark:bg-dark-surface dark:border-dark-border">
            <h2 className="text-sm font-semibold text-ink dark:text-dark-text flex items-center gap-2">
              <Settings className="h-4 w-4 text-teal" aria-hidden="true" />
              General
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Receipt prefix">
                <input
                  type="text"
                  value={form.receiptPrefix}
                  onChange={e => setForm(f => ({ ...f, receiptPrefix: e.target.value }))}
                  className={inputClass}
                  placeholder="REC-"
                />
              </FormField>

              <FormField label="Invoice prefix">
                <input
                  type="text"
                  value={form.invoicePrefix}
                  onChange={e => setForm(f => ({ ...f, invoicePrefix: e.target.value }))}
                  className={inputClass}
                  placeholder="INV-"
                />
              </FormField>
            </div>
          </div>

          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save settings"}
          </button>
        </form>
      </div>
    </div>
  );
}
