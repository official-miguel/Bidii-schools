"use client";

/**
 * src/components/SomaAIConfigPanel.tsx
 *
 * AI status and behaviour panel — rendered inside Principal Settings.
 *
 * The Gemini API key AND model are set by the super-admin per school.
 * Principals can only configure behaviour (enable/disable, caching) and
 * view usage stats. Model selection has been removed from this panel.
 *
 * Sections:
 *   1. Key Status   — read-only: shows whether a key has been assigned
 *   2. Behaviour    — enable/disable AI, response caching
 *   3. Usage Stats  — request count, last used
 */

import { useEffect, useState, FormEvent } from "react";
import {
  Sparkles, CheckCircle2, AlertCircle,
  ToggleLeft, ToggleRight, Activity,
  Info, Save, ShieldCheck,
} from "lucide-react";
import { DEFAULT_AI_CONFIG, type AiConfig, type AiUsage } from "@/lib/soma-ai/config";

const labelClass = "block text-xs font-semibold text-slate uppercase tracking-wide mb-1.5";

interface ConfigState {
  configured: boolean;
  keyPreview: string | null;
  isActive: boolean;
  config: AiConfig;
  usage: AiUsage;
}

export default function SomaAIConfigPanel() {
  const [state,   setState]   = useState<ConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);
  const [saving,  setSaving]  = useState(false);

  // Behaviour fields (controlled)
  const [enabled,         setEnabled]         = useState(DEFAULT_AI_CONFIG.enabled);
  const [cacheEnabled,    setCacheEnabled]    = useState(DEFAULT_AI_CONFIG.cacheEnabled);
  const [cacheTtlMinutes, setCacheTtlMinutes] = useState(DEFAULT_AI_CONFIG.cacheTtlMinutes);

  useEffect(() => {
    fetch("/api/soma-ai/config")
      .then((r) => r.json())
      .then((data: ConfigState) => {
        setState(data);
        setEnabled(data.config.enabled);
        setCacheEnabled(data.config.cacheEnabled);
        setCacheTtlMinutes(data.config.cacheTtlMinutes);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load AI configuration.");
        setLoading(false);
      });
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null); setSaved(false); setSaving(true);

    const res = await fetch("/api/soma-ai/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, cacheEnabled, cacheTtlMinutes }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) { setError(data.error ?? "Failed to save configuration."); return; }

    setState((prev) => prev ? {
      ...prev,
      config:   data.config  ?? prev.config,
      usage:    data.usage   ?? prev.usage,
      isActive: data.isActive ?? prev.isActive,
    } : null);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl animate-pulse">
        {[1, 2].map((i) => <div key={i} className="h-28 rounded-xl bg-line" />)}
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-3xl">

      {/* ── Key status — read-only ─────────────────────────────────────── */}
      <div className={`flex items-start gap-3 rounded-xl p-4 border ${
        state?.configured
          ? "bg-success-bg border-success/20"
          : "bg-warn-bg border-warn/20"
      }`}>
        {state?.configured
          ? <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-success" />
          : <AlertCircle  className="h-5 w-5 shrink-0 mt-0.5 text-warn" />}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${state?.configured ? "text-success" : "text-warn"}`}>
            {state?.configured
              ? `Soma AI key active · ···${state.keyPreview}`
              : "No Soma AI key assigned"}
          </p>
          <p className="text-xs opacity-80 mt-0.5 text-foreground">
            {state?.configured
              ? `AI is ${state.config.enabled ? "enabled" : "disabled"}`
              : "Contact your system administrator to assign a Soma AI key for this school."}
          </p>
        </div>
        {state?.configured && (
          <div className="flex items-center gap-1.5 shrink-0">
            <ShieldCheck className="h-4 w-4 text-success" />
            <span className="text-xs font-medium text-success">Set by admin</span>
          </div>
        )}
      </div>

      {/* ── Behaviour ─────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border p-5 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-teal/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-teal" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Behaviour</p>
            <p className="text-xs text-slate">Control availability and performance</p>
          </div>
        </div>

        {/* Enable/disable */}
        <div className="flex items-center justify-between py-3 border-t border-border">
          <div>
            <p className="text-sm font-medium text-foreground">Enable Soma AI</p>
            <p className="text-xs text-slate mt-0.5">
              When disabled, the assistant shows a maintenance notice to all users
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            aria-pressed={enabled}
            className="shrink-0 ml-4"
          >
            {enabled
              ? <ToggleRight className="h-8 w-8 text-teal" />
              : <ToggleLeft  className="h-8 w-8 text-slate" />}
          </button>
        </div>

        {/* Cache */}
        <div className="flex items-center justify-between py-3 border-t border-border">
          <div>
            <p className="text-sm font-medium text-foreground">Response caching</p>
            <p className="text-xs text-slate mt-0.5">
              Cache identical prompts to reduce API spend and improve speed
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCacheEnabled((v) => !v)}
            aria-pressed={cacheEnabled}
            className="shrink-0 ml-4"
          >
            {cacheEnabled
              ? <ToggleRight className="h-8 w-8 text-teal" />
              : <ToggleLeft  className="h-8 w-8 text-slate" />}
          </button>
        </div>

        {/* Cache TTL */}
        {cacheEnabled && (
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelClass + " mb-0"}>Cache Duration</label>
              <span className="text-sm font-semibold text-teal tabular-nums">{cacheTtlMinutes} min</span>
            </div>
            <input
              type="range" min="1" max="60" step="1"
              value={cacheTtlMinutes}
              onChange={(e) => setCacheTtlMinutes(parseInt(e.target.value, 10))}
              className="w-full h-2 rounded-full accent-teal cursor-pointer"
            />
            <div className="flex justify-between mt-1 text-[11px] text-slate">
              <span>1 min</span>
              <span>60 min</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Usage Stats ───────────────────────────────────────────────── */}
      {state?.configured && (
        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-teal/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-teal" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Usage</p>
              <p className="text-xs text-slate">Soma AI requests this school has made</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-background border border-border p-4">
              <p className="text-2xl font-bold text-foreground tabular-nums">
                {(state.usage.totalRequests ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-slate mt-1">Total AI requests</p>
            </div>
            <div className="rounded-lg bg-background border border-border p-4">
              <p className="text-sm font-semibold text-foreground">
                {state.usage.lastUsedAt
                  ? new Date(state.usage.lastUsedAt).toLocaleDateString("en-KE", {
                      day: "numeric", month: "short", year: "numeric",
                    })
                  : "Never"}
              </p>
              <p className="text-xs text-slate mt-1">Last used</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            Direct database answers don&apos;t consume API requests.
          </p>
        </div>
      )}

      {/* ── Feedback ──────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 text-sm text-success bg-success-bg border border-success/20 rounded-lg px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          AI configuration saved successfully.
        </div>
      )}

      {/* ── Save ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-teal text-white
                     text-sm font-semibold hover:bg-teal-dark disabled:opacity-50 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save configuration"}
        </button>
        {state?.configured && (
          <p className="text-xs text-slate">Changes take effect immediately for all users.</p>
        )}
      </div>
    </form>
  );
}
