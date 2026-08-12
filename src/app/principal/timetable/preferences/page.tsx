"use client";

/**
 * /principal/timetable/preferences — Session Preferences
 *
 * Admins define which subjects prefer which session (morning/afternoon/evening).
 * Natural language instructions can be typed and translated automatically.
 *
 * The engine reads these as soft or hard constraints when placing lessons.
 * AI's only role here is parsing the natural language into a structured rule.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Save, Trash2, Plus, Sparkles, Sun, Sunset, Moon,
  CheckCircle2, AlertTriangle, RefreshCw, Info,
} from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";
import {
  PageHeader, ErrorBanner,
  inputClass, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";
import { TIMETABLE_NAV } from "@/lib/timetable/navItems";




const SESSION_META = {
  MORNING:   { label: "Morning",   color: "bg-amber-50 text-amber-700 border-amber-200",  Icon: Sun    },
  AFTERNOON: { label: "Afternoon", color: "bg-blue-50 text-blue-700 border-blue-200",     Icon: Sunset },
  EVENING:   { label: "Evening",   color: "bg-purple-50 text-purple-700 border-purple-200", Icon: Moon  },
} as const;

type Preference = {
  id?: string;
  subjectCode: string;
  preferredSession: "MORNING" | "AFTERNOON" | "EVENING";
  isHard: boolean;
  instruction?: string;
};

type Subject = { id: string; code: string; name: string };

type Distribution = {
  morning:   { availableSlots: number };
  afternoon: { availableSlots: number };
  evening:   { availableSlots: number };
};

export default function PreferencesPage() {
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);

  const [preferences,  setPreferences]  = useState<Preference[]>([]);
  const [subjects,     setSubjects]     = useState<Subject[]>([]);
  const [distribution, setDistribution] = useState<Distribution | null>(null);
  const [aiAvailable,  setAiAvailable]  = useState(false);

  // NL instruction input
  const [instruction,  setInstruction]  = useState("");
  const [translating,  setTranslating]  = useState(false);
  const [translateResult, setTranslateResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prefRes, trRes] = await Promise.all([
        fetch("/api/timetable/session-preferences"),
        fetch("/api/timetable/translate-preference"),
      ]);

      if (prefRes.ok) {
        const d = await prefRes.json();
        setPreferences(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (d.preferences ?? []).map((p: any) => ({
            id: p.id,
            subjectCode: p.subjectCode ?? "",
            preferredSession: p.preferredSession ?? "MORNING",
            isHard: p.isHard ?? false,
            instruction: p.instruction,
          }))
        );
        setDistribution(d.distribution ?? null);
      }

      if (trRes.ok) {
        const d = await trRes.json();
        setSubjects(d.subjects ?? []);
        setAiAvailable(d.aiAvailable ?? false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function addPreference() {
    setPreferences((prev) => [
      ...prev,
      {
        subjectCode: subjects[0]?.code ?? "",
        preferredSession: "MORNING",
        isHard: false,
      },
    ]);
  }

  function updatePreference(idx: number, patch: Partial<Preference>) {
    setPreferences((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function removePreference(idx: number) {
    setPreferences((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleTranslate() {
    if (!instruction.trim()) return;
    setTranslating(true);
    setTranslateResult(null);
    try {
      const res = await fetch("/api/timetable/translate-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: [{ instruction }],
          useAI: aiAvailable,
        }),
      });
      const data = await res.json();
      const result = data.results?.[0];
      if (result?.success && result.preference) {
        const { subjectCode, preferredSession, isHard, explanation } = result.preference;
        // Add the translated preference to the list
        setPreferences((prev) => [
          ...prev,
          {
            subjectCode: subjectCode ?? "",
            preferredSession: preferredSession ?? "MORNING",
            isHard: isHard ?? false,
            instruction,
          },
        ]);
        setTranslateResult(`Added: ${explanation}`);
        setInstruction("");
      } else {
        const clarify = result?.needsClarification?.[0] ?? "Could not understand the instruction";
        setTranslateResult(`Could not parse: ${clarify}`);
      }
    } catch (e) {
      setTranslateResult(`Error: ${(e as Error).message}`);
    } finally {
      setTranslating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/timetable/session-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: preferences.map((p) => ({
            subjectCode: p.subjectCode.toUpperCase(),
            preferredSession: p.preferredSession,
            isHard: p.isHard,
            instruction: p.instruction,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save preferences");
        return;
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <ContextNavigation items={TIMETABLE_NAV} />
        <PageHeader title="Timetable" description="Configure session preferences." />
        <div className="mt-4 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 bg-white border border-line rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ContextNavigation items={TIMETABLE_NAV} />
      <PageHeader
        title="Timetable"
        description="Define which subjects should be scheduled in morning, afternoon, or evening sessions."
      />

      <div className="space-y-5">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {success && (
          <div className="rounded-xl border border-success/20 bg-success-bg p-4 text-sm text-success font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Preferences saved.
          </div>
        )}

        {/* ── Session slot counts ──────────────────────────────────── */}
        {distribution && (
          <div className="grid grid-cols-3 gap-3">
            {(["MORNING", "AFTERNOON", "EVENING"] as const).map((s) => {
              const meta = SESSION_META[s];
              const Icon = meta.Icon;
              const available = s === "MORNING"
                ? distribution.morning.availableSlots
                : s === "AFTERNOON"
                  ? distribution.afternoon.availableSlots
                  : distribution.evening.availableSlots;
              return (
                <div key={s} className={`flex items-center gap-3 p-4 rounded-xl border ${meta.color}`}>
                  <Icon className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{meta.label}</p>
                    <p className="text-xs opacity-80">{available} slots/week</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Natural language input ────────────────────────────── */}
        <div className="bg-white border border-line rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-teal" />
            <h2 className="text-sm font-semibold text-ink">Add preference by instruction</h2>
            {!aiAvailable && (
              <span className="text-xs text-slate bg-line px-2 py-0.5 rounded-full">Pattern matching only</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              className={`${inputClass} flex-1`}
              placeholder='e.g. "Mathematics must be in the morning" or "PE should be in the afternoon"'
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTranslate()}
            />
            <button
              type="button"
              onClick={handleTranslate}
              disabled={translating || !instruction.trim()}
              className={primaryButtonClass}
            >
              {translating
                ? <RefreshCw className="h-4 w-4 animate-spin" />
                : <Sparkles className="h-4 w-4" />
              }
              Parse
            </button>
          </div>
          {translateResult && (
            <p className={`text-xs mt-2 flex items-center gap-1.5 ${
              translateResult.startsWith("Added")
                ? "text-success"
                : "text-warn"
            }`}>
              {translateResult.startsWith("Added")
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              }
              {translateResult}
            </p>
          )}
          <p className="text-xs text-slate mt-2">
            Use &quot;must&quot; or &quot;always&quot; for hard constraints (engine enforced); &quot;prefer&quot; or &quot;should&quot; for soft preferences.
          </p>
        </div>

        {/* ── Preferences table ─────────────────────────────────── */}
        <div className="bg-white border border-line rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <h2 className="text-sm font-semibold text-ink">
              Session preferences
              {preferences.length > 0 && (
                <span className="ml-2 text-xs font-medium text-slate bg-line px-2 py-0.5 rounded-full">
                  {preferences.length}
                </span>
              )}
            </h2>
            <button type="button" onClick={addPreference} className={`${secondaryButtonClass} py-1.5 text-xs`}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          {preferences.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Sun className="h-8 w-8 text-slate/30 mx-auto mb-3" />
              <p className="text-sm text-slate">No session preferences defined.</p>
              <p className="text-xs text-slate/60 mt-1">
                The engine will distribute lessons freely across all sessions.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden sm:grid grid-cols-[1fr_140px_140px_100px_40px] gap-3 px-5 py-2 bg-paper border-b border-line">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">Subject code</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">Session</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">Constraint type</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate">From instruction</span>
                <span />
              </div>

              <div className="divide-y divide-line">
                {preferences.map((pref, idx) => {
                  const meta = SESSION_META[pref.preferredSession];
                  const Icon = meta.Icon;
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-[1fr_140px_140px_100px_40px] gap-3 px-5 py-3 items-center"
                    >
                      {/* Subject code */}
                      {subjects.length > 0 ? (
                        <select
                          value={pref.subjectCode.toUpperCase()}
                          onChange={(e) => updatePreference(idx, { subjectCode: e.target.value })}
                          className={`${inputClass} text-sm py-1.5`}
                        >
                          {subjects.map((s) => (
                            <option key={s.id} value={s.code.toUpperCase()}>
                              {s.code} — {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={pref.subjectCode}
                          onChange={(e) => updatePreference(idx, { subjectCode: e.target.value.toUpperCase() })}
                          placeholder="e.g. MATH"
                          className={`${inputClass} text-sm py-1.5 font-mono uppercase`}
                        />
                      )}

                      {/* Session select */}
                      <div className="relative">
                        <select
                          value={pref.preferredSession}
                          onChange={(e) =>
                            updatePreference(idx, {
                              preferredSession: e.target.value as Preference["preferredSession"],
                            })
                          }
                          className={`${inputClass} text-sm py-1.5 pl-8`}
                        >
                          <option value="MORNING">Morning</option>
                          <option value="AFTERNOON">Afternoon</option>
                          <option value="EVENING">Evening</option>
                        </select>
                        <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate pointer-events-none" />
                      </div>

                      {/* Hard vs soft */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updatePreference(idx, { isHard: !pref.isHard })}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors
                            ${pref.isHard
                              ? "bg-danger/10 text-danger border-danger/20"
                              : "bg-line text-slate border-line"
                            }`}
                        >
                          {pref.isHard ? "Hard (enforced)" : "Soft (preferred)"}
                        </button>
                      </div>

                      {/* Instruction badge */}
                      <div className="flex items-center">
                        {pref.instruction ? (
                          <span
                            title={pref.instruction}
                            className="px-2 py-0.5 rounded bg-teal/10 text-teal text-[10px] font-medium max-w-[80px] truncate"
                          >
                            AI
                          </span>
                        ) : (
                          <span className="text-slate/40 text-xs">—</span>
                        )}
                      </div>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removePreference(idx)}
                        className="p-1 text-slate hover:text-danger transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="px-5 py-4 border-t border-line flex items-center justify-between">
            <div className="flex items-start gap-2 text-xs text-slate max-w-sm">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <strong className="text-ink">Hard</strong> constraints must be satisfied — the engine regenerates until they pass.{" "}
                <strong className="text-ink">Soft</strong> preferences are respected when possible but won&apos;t block generation.
              </span>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={primaryButtonClass}
            >
              {saving
                ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving…</>
                : <><Save className="h-4 w-4" />Save preferences</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
