"use client";

/**
 * src/components/SomaAIConfigPanel.tsx
 *
 * AI Configuration panel — rendered as a tab inside Settings.
 *
 * Sections:
 *   1. API Key — save / update the Gemini key (masked, never shown)
 *   2. Model Selection — choose from available Gemini models
 *   3. Generation Parameters — temperature slider, max output tokens
 *   4. Behaviour — enable/disable AI, cache settings
 *   5. Connection Test — ping Gemini with the current config
 *   6. Usage Stats — request count, last used
 */

import { useEffect, useState, FormEvent } from "react";
import {
  Sparkles, Key, RefreshCw, CheckCircle2, AlertCircle,
  ToggleLeft, ToggleRight, ChevronDown, Zap, Cpu, Activity,
  Info, Save, Eye, EyeOff,
} from "lucide-react";
import { GEMINI_MODELS, DEFAULT_AI_CONFIG, type AiConfig, type AiUsage } from "@/lib/soma-ai/config";

// Shared UI helpers (same as the rest of Settings)
const inputClass =
  "block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground " +
  "placeholder:text-slate/50 focus:border-teal/60 focus:outline-none focus:ring-1 focus:ring-teal/20 " +
  "";
const labelClass = "block text-xs font-semibold text-slate uppercase tracking-wide mb-1.5";

interface ConfigState {
  configured: boolean;
  keyPreview: string | null;
  isActive: boolean;
  config: AiConfig;
  usage: AiUsage;
}

interface TestResult {
  ok: boolean;
  model?: string;
  latencyMs?: number;
  error?: string;
}

export default function SomaAIConfigPanel() {
  const [state, setState] = useState<ConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Key form
  const [keyValue, setKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keySection, setKeySection] = useState(false);

  // Test
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Config fields (controlled)
  const [model, setModel] = useState(DEFAULT_AI_CONFIG.model);
  const [temperature, setTemperature] = useState(DEFAULT_AI_CONFIG.temperature);
  const [maxOutputTokens, setMaxOutputTokens] = useState(DEFAULT_AI_CONFIG.maxOutputTokens);
  const [enabled, setEnabled] = useState(DEFAULT_AI_CONFIG.enabled);
  const [cacheEnabled, setCacheEnabled] = useState(DEFAULT_AI_CONFIG.cacheEnabled);
  const [cacheTtlMinutes, setCacheTtlMinutes] = useState(DEFAULT_AI_CONFIG.cacheTtlMinutes);

  // Load current config
  useEffect(() => {
    fetch("/api/soma-ai/config")
      .then((r) => r.json())
      .then((data: ConfigState) => {
        setState(data);
        setModel(data.config.model);
        setTemperature(data.config.temperature);
        setMaxOutputTokens(data.config.maxOutputTokens);
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

  // Save config (key optional)
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null); setSaved(false); setSaving(true);

    const body: Record<string, unknown> = {
      model, temperature, maxOutputTokens, enabled, cacheEnabled, cacheTtlMinutes,
    };
    if (keyValue.trim()) body.apiKey = keyValue.trim();

    const res = await fetch("/api/soma-ai/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to save configuration.");
      return;
    }

    setState((prev) => prev
      ? {
          ...prev,
          configured: true,
          keyPreview: data.keyPreview ?? prev.keyPreview,
          isActive: data.isActive ?? prev.isActive,
          config: data.config ?? prev.config,
          usage: data.usage ?? prev.usage,
        }
      : null
    );
    setKeyValue("");
    setKeySection(false);
    setSaved(true);
    setTestResult(null);
    setTimeout(() => setSaved(false), 3000);
  }

  // Test connection
  async function handleTest() {
    setTesting(true); setTestResult(null);
    const res = await fetch("/api/soma-ai/config/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const data: TestResult = await res.json();
    setTesting(false);
    setTestResult(data);
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-line" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-3xl">

      {/* ── Status banner ──────────────────────────────────────────────── */}
      <div className={`flex items-start gap-3 rounded-xl p-4 border ${
        state?.configured
          ? "bg-success-bg border-success/20 text-success"
          : "bg-warn-bg border-warn/20 text-warn"
      }`}>
        {state?.configured
          ? <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          : <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />}
        <div>
          <p className="text-sm font-semibold">
            {state?.configured
              ? `Gemini configured · ···${state.keyPreview}`
              : "Gemini API key not set"}
          </p>
          <p className="text-xs opacity-80 mt-0.5">
            {state?.configured
              ? `AI is ${state.config.enabled ? "enabled" : "disabled"} · Using ${state.config.model}`
              : "Add your Google Gemini API key below to enable Soma AI."}
          </p>
        </div>
        {state?.configured && (
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className={`inline-block w-2 h-2 rounded-full ${state.config.enabled ? "bg-success" : "bg-warn"}`} />
            <span className="text-xs font-medium">{state.config.enabled ? "Active" : "Paused"}</span>
          </div>
        )}
      </div>

      {/* ── API Key section ────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setKeySection((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-background/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
              <Key className="h-4.5 w-4.5 text-teal" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">
                {state?.configured ? "Update API Key" : "Add API Key"}
              </p>
              <p className="text-xs text-slate mt-0.5">
                {state?.configured
                  ? `Current key: ···${state.keyPreview} — click to update`
                  : "Your Gemini API key is encrypted at rest"}
              </p>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-slate transition-transform ${keySection ? "rotate-180" : ""}`} />
        </button>

        {keySection && (
          <div className="px-5 pb-5 border-t border-border">
            <div className="mt-4">
              <label className={labelClass}>Gemini API Key</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={keyValue}
                  onChange={(e) => setKeyValue(e.target.value)}
                  placeholder={state?.configured ? "Enter new key to replace current key" : "AIza..."}
                  className={`${inputClass} pr-10`}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate hover:text-foreground transition-colors"
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate flex items-center gap-1">
                <Info className="h-3 w-3 shrink-0" />
                Keys are AES-256 encrypted before storage. The raw key is never returned to the browser.
              </p>
              <p className="mt-1 text-xs text-slate">
                Get your key from{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal hover:underline"
                >
                  Google AI Studio →
                </a>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Model Selection ────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
            <Cpu className="h-4.5 w-4.5 text-teal" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">AI Model</p>
            <p className="text-xs text-slate">Choose which Gemini model powers Soma AI</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {GEMINI_MODELS.map((m) => (
            <label
              key={m.id}
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                model === m.id
                  ? "border-teal bg-teal-50 dark:border-teal/40"
                  : "border-border bg-background hover:border-teal/30"
              }`}
            >
              <input
                type="radio"
                name="model"
                value={m.id}
                checked={model === m.id}
                onChange={() => setModel(m.id)}
                className="mt-0.5 accent-teal shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium text-foreground">
                    {m.label}
                  </span>
                  {m.recommended && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal text-white font-semibold">
                      Recommended
                    </span>
                  )}
                  {m.premium && !m.recommended && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-info/10 text-info border border-info/20 font-medium">
                      Premium
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate mt-0.5 leading-snug">
                  {m.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ── Generation Parameters ──────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
            <Zap className="h-4.5 w-4.5 text-teal" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Generation Parameters</p>
            <p className="text-xs text-slate">Fine-tune how the AI generates responses</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelClass + " mb-0"}>
                Temperature
              </label>
              <span className="text-sm font-semibold text-teal tabular-nums">
                {temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0" max="1" step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-2 rounded-full accent-teal cursor-pointer"
            />
            <div className="flex justify-between mt-1 text-[11px] text-slate">
              <span>0 — Precise & consistent</span>
              <span>1 — Creative & varied</span>
            </div>
          </div>

          {/* Max output tokens */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelClass + " mb-0"}>
                Max Response Length
              </label>
              <span className="text-sm font-semibold text-teal tabular-nums">
                {maxOutputTokens.toLocaleString()} tokens
              </span>
            </div>
            <input
              type="range"
              min="256" max="8192" step="256"
              value={maxOutputTokens}
              onChange={(e) => setMaxOutputTokens(parseInt(e.target.value, 10))}
              className="w-full h-2 rounded-full accent-teal cursor-pointer"
            />
            <div className="flex justify-between mt-1 text-[11px] text-slate">
              <span>256 — Short answers</span>
              <span>8,192 — Long reports</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Behaviour ─────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border p-5 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
            <Sparkles className="h-4.5 w-4.5 text-teal" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Behaviour</p>
            <p className="text-xs text-slate">Control availability and performance</p>
          </div>
        </div>

        {/* Enable/disable AI */}
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
              : <ToggleLeft className="h-8 w-8 text-slate" />}
          </button>
        </div>

        {/* Response cache */}
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
              : <ToggleLeft className="h-8 w-8 text-slate" />}
          </button>
        </div>

        {/* Cache TTL */}
        {cacheEnabled && (
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelClass + " mb-0"}>Cache Duration</label>
              <span className="text-sm font-semibold text-teal tabular-nums">
                {cacheTtlMinutes} min
              </span>
            </div>
            <input
              type="range"
              min="1" max="60" step="1"
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

      {/* ── Connection Test ────────────────────────────────────────────── */}
      {state?.configured && (
        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
                <Activity className="h-4.5 w-4.5 text-teal" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Connection Test</p>
                <p className="text-xs text-slate">Verify the key works with the selected model</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-border text-sm font-medium text-slate hover:text-foreground hover:border-teal/30 hover:bg-teal-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`} />
              {testing ? "Testing…" : "Test connection"}
            </button>
          </div>

          {testResult && (
            <div className={`mt-4 flex items-start gap-2.5 rounded-lg p-3 border text-sm ${
              testResult.ok
                ? "bg-success-bg border-success/20 text-success"
                : "bg-danger-bg border-danger/20 text-danger"
            }`}>
              {testResult.ok
                ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              <div>
                {testResult.ok ? (
                  <>
                    <p className="font-medium">Connection successful</p>
                    <p className="text-xs opacity-80 mt-0.5">
                      Model: {testResult.model} · Response time: {testResult.latencyMs}ms
                    </p>
                  </>
                ) : (
                  <p>{testResult.error}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Usage Stats ───────────────────────────────────────────────── */}
      {state?.configured && (
        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
              <Activity className="h-4.5 w-4.5 text-teal" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Usage</p>
              <p className="text-xs text-slate">Gemini API requests from Soma AI</p>
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
            Direct database answers (student counts, attendance lists, etc.) don&apos;t consume API requests.
          </p>
        </div>
      )}

      {/* ── Error / Success ────────────────────────────────────────────── */}
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

      {/* ── Save button ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-teal text-white text-sm font-semibold hover:bg-teal-dark disabled:opacity-50 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save configuration"}
        </button>
        {state?.configured && (
          <p className="text-xs text-slate">
            Changes take effect immediately for all users.
          </p>
        )}
      </div>
    </form>
  );
}
