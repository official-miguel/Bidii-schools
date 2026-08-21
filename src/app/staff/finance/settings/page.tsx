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
  receiptPrefix:      string;
  invoicePrefix:      string;
  mpesaPaybillNumber: string | null;
  mpesaWebhookUrl:    string | null;
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

// ── Main Settings Page ─────────────────────────────────────────────────────

export default function FinanceSettingsPage() {
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [form, setForm] = useState({
    receiptPrefix:      "REC-",
    invoicePrefix:      "INV-",
    mpesaPaybillNumber: "",
    mpesaWebhookSecret: "",
  });
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [copied,     setCopied]     = useState(false);

  useEffect(() => {
    fetch("/api/finance/settings")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.settings) {
          const s: FinanceSettings = data.settings;
          setSettings(s);
          setForm(f => ({
            ...f,
            receiptPrefix:      s.receiptPrefix ?? "REC-",
            invoicePrefix:      s.invoicePrefix ?? "INV-",
            mpesaPaybillNumber: s.mpesaPaybillNumber ?? "",
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
      receiptPrefix:      form.receiptPrefix.trim() || "REC-",
      invoicePrefix:      form.invoicePrefix.trim() || "INV-",
      mpesaPaybillNumber: form.mpesaPaybillNumber.trim() || null,
    };
    if (form.mpesaWebhookSecret.trim()) {
      body.mpesaWebhookSecret = form.mpesaWebhookSecret.trim();
    }

    const res = await fetch("/api/finance/settings", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
      setSuccess("Settings saved successfully.");
      setForm(f => ({ ...f, mpesaWebhookSecret: "" }));
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to save settings.");
    }
    setSaving(false);
  }

  async function copyWebhookUrl() {
    if (!settings?.mpesaWebhookUrl) return;
    const url = `${window.location.origin}/api/finance/mpesa/webhook/${settings.mpesaWebhookUrl}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
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

          {/* M-Pesa */}
          <div className="bg-white border border-line rounded-xl p-5 space-y-4 dark:bg-dark-surface dark:border-dark-border">
            <h2 className="text-sm font-semibold text-ink dark:text-dark-text">M-Pesa C2B Integration</h2>

            <FormField label="Paybill / Till number">
              <input
                type="text"
                value={form.mpesaPaybillNumber}
                onChange={e => setForm(f => ({ ...f, mpesaPaybillNumber: e.target.value }))}
                className={inputClass}
                placeholder="e.g. 522533"
              />
            </FormField>

            <FormField
              label="Webhook secret"
              helper="Leave blank to keep the existing secret. This is the secret you configure in your Safaricom Daraja account."
            >
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  value={form.mpesaWebhookSecret}
                  onChange={e => setForm(f => ({ ...f, mpesaWebhookSecret: e.target.value }))}
                  className={inputClass + " pr-11"}
                  placeholder="Enter new secret to update"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(s => !s)}
                  aria-label={showSecret ? "Hide secret" : "Show secret"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink transition-colors"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FormField>

            {settings?.mpesaWebhookUrl && (
              <FormField
                label="C2B Webhook URL"
                helper="Copy this URL into your Safaricom Daraja C2B Configuration URL field."
              >
                <div className="flex gap-2">
                  <code className="flex-1 text-xs font-mono bg-paper border border-line rounded-lg px-3 py-2.5 text-ink truncate dark:bg-dark-border/30 dark:border-dark-border dark:text-dark-text">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/api/finance/mpesa/webhook/${settings.mpesaWebhookUrl}`
                      : `/api/finance/mpesa/webhook/${settings.mpesaWebhookUrl}`}
                  </code>
                  <button
                    type="button"
                    onClick={copyWebhookUrl}
                    aria-label="Copy webhook URL"
                    className="inline-flex items-center gap-1.5 shrink-0 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-slate hover:text-ink hover:border-teal/40 transition-all dark:bg-dark-surface dark:border-dark-border"
                  >
                    {copied
                      ? <CheckCircle2 className="h-4 w-4 text-success" />
                      : <Copy className="h-4 w-4" />}
                    <span className="text-xs">{copied ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
              </FormField>
            )}
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
