"use client";

/**
 * /super-admin/settings/sms
 *
 * Platform-level SMS provider configuration.
 * The API key stored here is used for ALL outbound SMS:
 *   • Communication Centre bulk sends (school wallet-deducted)
 *   • Forgot-password OTP (platform-funded, never wallet-deducted)
 *
 * Gated by the super-admin layout (SUPER_ADMIN role only).
 */

import { useEffect, useState, FormEvent } from "react";
import { ShieldCheck, KeyRound, Save, CheckCircle2, AlertTriangle } from "lucide-react";
import { Spinner, ErrorBanner, inputClass, labelClass } from "@/components/ui";

interface SmsConfigStatus {
  configured:  boolean;
  provider:    string | null;
  keyPreview:  string | null;
  metadata:    { username?: string; from?: string } | null;
  isActive:    boolean;
  updatedAt:   string | null;
}

export default function PlatformSmsConfigPage() {
  const [config,   setConfig]   = useState<SmsConfigStatus | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Form fields
  const [apiKey,   setApiKey]   = useState("");
  const [username, setUsername] = useState("");
  const [from,     setFrom]     = useState("");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  async function load() {
    setLoading(true);
    setApiError(null);
    try {
      const res = await fetch("/api/super-admin/sms-config");
      if (!res.ok) throw new Error("Failed to load SMS config");
      const d = await res.json() as { config: SmsConfigStatus };
      setConfig(d.config);
      // Pre-fill metadata fields (never the API key itself)
      if (d.config.metadata?.username) setUsername(d.config.metadata.username);
      if (d.config.metadata?.from)     setFrom(d.config.metadata.from);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    setApiError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/super-admin/sms-config", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          apiKey: apiKey.trim(),
          ...(username.trim() ? { username: username.trim() } : {}),
          ...(from.trim()     ? { from: from.trim()         } : {}),
        }),
      });
      const d = await res.json() as { config?: SmsConfigStatus; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Save failed");
      setConfig(d.config ?? null);
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Platform SMS Provider</h1>
        <p className="text-sm text-slate mt-1">
          These credentials are used for every outbound SMS across all schools —
          both Communication Centre bulk sends and forgot-password OTP codes.
        </p>
      </div>

      {apiError && <ErrorBanner message={apiError} />}

      {/* Current status card */}
      {config && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-teal-50">
              <ShieldCheck className="h-4.5 w-4.5 text-teal" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {config.configured ? "Africa's Talking" : "Not configured"}
              </p>
              <p className="text-xs text-slate">
                {config.configured && config.updatedAt
                  ? `Last updated ${new Date(config.updatedAt).toLocaleDateString()}`
                  : "No API key saved yet"}
              </p>
            </div>
            <div className="ml-auto">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                config.configured && config.isActive
                  ? "bg-success-bg text-success border-success/20"
                  : "bg-line text-slate border-border"
              }`}>
                {config.configured && config.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>

          {config.configured && config.keyPreview && (
            <div className="rounded-lg bg-background border border-border px-3.5 py-2.5 flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5 text-slate shrink-0" aria-hidden />
              <span className="text-xs text-slate font-mono">
                API key ending in <strong className="text-foreground">…{config.keyPreview}</strong>
              </span>
            </div>
          )}

          {config.metadata && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {config.metadata.username && (
                <div>
                  <span className="block text-slate">Username</span>
                  <span className="font-medium text-foreground">{config.metadata.username}</span>
                </div>
              )}
              {config.metadata.from && (
                <div>
                  <span className="block text-slate">Sender ID</span>
                  <span className="font-medium text-foreground">{config.metadata.from}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Update form */}
      <form onSubmit={handleSave} className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">
          {config?.configured ? "Update credentials" : "Set credentials"}
        </h2>

        <div>
          <label htmlFor="sms-apikey" className={labelClass}>
            API key / Auth token <span className="text-danger" aria-hidden>*</span>
          </label>
          <input
            id="sms-apikey"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.configured ? "Enter new key to replace current" : "Paste your Africa's Talking API key"}
            className={inputClass}
            required
          />
          <p className="mt-1.5 text-xs text-slate">
            Never stored in plaintext — encrypted with AES-256-GCM before saving.
          </p>
        </div>

        <div>
          <label htmlFor="sms-username" className={labelClass}>
            Username <span className="text-slate font-normal">(optional)</span>
          </label>
          <input
            id="sms-username"
            type="text"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="sandbox"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="sms-from" className={labelClass}>
            Sender ID <span className="text-slate font-normal">(optional)</span>
          </label>
          <input
            id="sms-from"
            type="text"
            autoComplete="off"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="BIDII"
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-slate">
            Alphanumeric sender name shown on the recipient's phone, e.g. "BIDII".
            Leave blank to use the Africa's Talking default.
          </p>
        </div>

        {saved && (
          <div className="flex items-center gap-2 rounded-lg bg-success-bg border border-success/20 text-success text-sm px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Platform SMS config saved successfully.
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !apiKey.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-teal text-white text-sm font-semibold
                     px-5 py-2.5 hover:bg-teal-dark active:scale-[0.98] transition-all duration-100
                     disabled:opacity-50 shadow-xs"
        >
          {saving ? (
            <><Spinner size="sm" /> Saving…</>
          ) : (
            <><Save className="h-4 w-4" aria-hidden /> Save credentials</>
          )}
        </button>
      </form>

      {/* Security note */}
      <div className="flex items-start gap-3 rounded-xl border border-warn/20 bg-warn-bg px-4 py-3.5 text-sm">
        <AlertTriangle className="h-4 w-4 text-warn mt-0.5 shrink-0" aria-hidden />
        <div className="text-warn-dark">
          <p className="font-semibold">Keep this key secret</p>
          <p className="text-xs mt-0.5 text-warn">
            Rotating or deleting this key will immediately break SMS delivery for every
            school until a new key is saved. Back up your Africa's Talking credentials
            before changing them here.
          </p>
        </div>
      </div>
    </div>
  );
}
