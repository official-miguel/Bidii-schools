"use client";

import { useEffect, useState } from "react";
import {
  Settings, Eye, EyeOff, Copy, CheckCircle2, Save, Loader2,
} from "lucide-react";
import {
  PageHeader, FormField, inputClass, primaryButtonClass,
  ErrorBanner, SuccessBanner,
} from "@/components/ui";

interface FinanceSettings {
  balanceThreshold: string;
  daysOverdueThreshold: number;
  receiptPrefix: string;
  invoicePrefix: string;
  mpesaPaybillNumber: string | null;
  mpesaWebhookUrl: string | null;
}

export default function FinanceSettingsPage() {
  const [settings,    setSettings]    = useState<FinanceSettings | null>(null);
  const [form, setForm] = useState({
    balanceThreshold:     "0",
    daysOverdueThreshold: "30",
    receiptPrefix:        "REC-",
    invoicePrefix:        "INV-",
    mpesaPaybillNumber:   "",
    mpesaWebhookSecret:   "",
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
            balanceThreshold:     s.balanceThreshold ?? "0",
            daysOverdueThreshold: String(s.daysOverdueThreshold ?? 30),
            receiptPrefix:        s.receiptPrefix ?? "REC-",
            invoicePrefix:        s.invoicePrefix ?? "INV-",
            mpesaPaybillNumber:   s.mpesaPaybillNumber ?? "",
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
      balanceThreshold:     parseFloat(form.balanceThreshold) || 0,
      daysOverdueThreshold: parseInt(form.daysOverdueThreshold, 10) || 30,
      receiptPrefix:        form.receiptPrefix.trim() || "REC-",
      invoicePrefix:        form.invoicePrefix.trim() || "INV-",
      mpesaPaybillNumber:   form.mpesaPaybillNumber.trim() || null,
    };
    if (form.mpesaWebhookSecret.trim()) {
      body.mpesaWebhookSecret = form.mpesaWebhookSecret.trim();
    }

    const res = await fetch("/api/finance/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
      setSuccess("Settings saved successfully.");
      setForm(f => ({ ...f, mpesaWebhookSecret: "" })); // clear secret field
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
        <PageHeader title="Finance Settings" description="Configure thresholds, prefixes, and M-Pesa integration." />
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
        description="Configure thresholds, receipt prefixes, and M-Pesa integration."
      />

      <form onSubmit={save} className="space-y-6">
        {error   && <ErrorBanner   message={error}   onDismiss={() => setError(null)}   />}
        {success && <SuccessBanner message={success} onDismiss={() => setSuccess(null)} />}

        {/* General settings */}
        <div className="bg-white border border-line rounded-xl p-5 space-y-4 dark:bg-dark-surface dark:border-dark-border">
          <h2 className="text-sm font-semibold text-ink dark:text-dark-text flex items-center gap-2">
            <Settings className="h-4 w-4 text-teal" aria-hidden="true" />
            General
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Balance threshold (KES)"
              helper="Students are flagged as debtors when their balance falls below this amount."
            >
              <input
                type="number" min="0" step="0.01"
                value={form.balanceThreshold}
                onChange={e => setForm(f => ({ ...f, balanceThreshold: e.target.value }))}
                className={inputClass}
                placeholder="e.g. 500"
              />
            </FormField>

            <FormField
              label="Days overdue threshold"
              helper="Number of days before a flagged debtor is escalated."
            >
              <input
                type="number" min="1"
                value={form.daysOverdueThreshold}
                onChange={e => setForm(f => ({ ...f, daysOverdueThreshold: e.target.value }))}
                className={inputClass}
                placeholder="e.g. 30"
              />
            </FormField>

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
  );
}
