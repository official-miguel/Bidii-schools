"use client";

/**
 * ExamSetupTabs — tabbed shell inside the Exam Setup hub.
 *
 * Tab 1 — Frameworks & Periods  : FrameworkManager
 * Tab 2 — Pathway Weights       : shortcut to /principal/assessments/pathway-weights
 * Tab 3 — Ranking & Flags       : inline RankingConfig form + mean grade flag threshold
 */

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import FrameworkManager from "@/components/assessment/FrameworkManager";

type Tab = "frameworks" | "pathway-weights" | "ranking";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "frameworks",      label: "Frameworks & Periods" },
  { id: "pathway-weights", label: "Pathway Weights" },
  { id: "ranking",         label: "Ranking & Flags" },
];

// ---------------------------------------------------------------------------
// Inline ranking config form (previously lived in Settings)
// ---------------------------------------------------------------------------

interface RankingConfigData {
  improvementWeight: number;
  completionWeight:  number;
  absoluteWeight:    number;
  meanFlagThreshold: number | null;
  updatedAt:         string | null;
}

function RankingConfigForm() {
  const [config,     setConfig]     = useState<RankingConfigData | null>(null);
  const [improvement, setImprovement] = useState("0.40");
  const [completion,  setCompletion]  = useState("0.30");
  const [absolute,    setAbsolute]    = useState("0.30");
  const [flagThreshold, setFlagThreshold] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/ranking-config")
      .then((r) => r.json())
      .then((d: RankingConfigData) => {
        setConfig(d);
        setImprovement(d.improvementWeight.toFixed(2));
        setCompletion(d.completionWeight.toFixed(2));
        setAbsolute(d.absoluteWeight.toFixed(2));
        setFlagThreshold(d.meanFlagThreshold != null ? String(d.meanFlagThreshold) : "");
        if (d.updatedAt) setSavedAt(d.updatedAt);
      })
      .catch(() => setError("Failed to load ranking configuration."));
  }, []);

  const sum = parseFloat(improvement || "0") + parseFloat(completion || "0") + parseFloat(absolute || "0");
  const sumValid = Math.abs(sum - 1.0) <= 0.001;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const threshold =
      flagThreshold.trim() === "" ? null : parseFloat(flagThreshold);

    if (threshold !== null && (isNaN(threshold) || threshold < 0)) {
      setError("Mean grade flag threshold must be a non-negative number, or leave blank to disable flagging.");
      setSaving(false);
      return;
    }

    const res = await fetch("/api/settings/ranking-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        improvementWeight: parseFloat(improvement),
        completionWeight:  parseFloat(completion),
        absoluteWeight:    parseFloat(absolute),
        meanFlagThreshold: threshold,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to save.");
      return;
    }
    setSavedAt(data.updatedAt);
    setConfig(data);
  }

  if (!config && !error) {
    return <div className="h-40 rounded-xl bg-line/40 animate-pulse" />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-8 max-w-lg">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Ranking weights ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Ranking Weights</h3>
          <p className="text-xs text-slate mt-0.5">
            Three weights that determine the composite teacher performance score.
            They must sum to <strong>1.0</strong>.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "Improvement",
              key: "improvement",
              value: improvement,
              set: setImprovement,
              hint: "Score improvement over previous period.",
            },
            {
              label: "Completion",
              key: "completion",
              value: completion,
              set: setCompletion,
              hint: "Marks-entry completion rate.",
            },
            {
              label: "Absolute Mean",
              key: "absolute",
              value: absolute,
              set: setAbsolute,
              hint: "Absolute class mean grade points.",
            },
          ].map(({ label, key, value, set, hint }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-ink mb-1">{label}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={value}
                onChange={(e) => set(e.target.value)}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-royal/30"
              />
              <p className="text-xs text-slate mt-1">{hint}</p>
            </div>
          ))}
        </div>

        <div className={`text-sm font-medium ${sumValid ? "text-green-700" : "text-red-600"}`}>
          Sum: {sum.toFixed(3)}{" "}
          {sumValid ? "✓ valid" : "— must equal 1.000"}
        </div>
      </div>

      {/* ── Mean grade flag threshold ───────────────────────────────────── */}
      <div className="space-y-3 rounded-xl border border-line bg-white p-5">
        <div>
          <h3 className="text-sm font-semibold text-ink">Mean Grade Flag Threshold</h3>
          <p className="text-xs text-slate mt-0.5">
            Classes whose mean grade points fall <strong>below</strong> this value will
            be flagged in the dashboard. Leave blank to disable flagging.
          </p>
        </div>

        <div className="flex items-end gap-3">
          <div className="w-40">
            <label className="block text-xs font-medium text-ink mb-1">
              Threshold (grade points)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="e.g. 5.0"
              value={flagThreshold}
              onChange={(e) => setFlagThreshold(e.target.value)}
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-royal/30"
            />
          </div>
          {flagThreshold.trim() !== "" && (
            <button
              type="button"
              onClick={() => setFlagThreshold("")}
              className="text-xs text-slate hover:text-danger transition-colors pb-2"
            >
              Clear (disable)
            </button>
          )}
        </div>

        <p className="text-xs text-slate">
          Example: set to <span className="font-mono">5.0</span> to flag any class averaging
          below a C grade. The flag appears as a warning indicator next to the class in
          the dashboard and staff performance views.
        </p>
      </div>

      {/* ── Save ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving || !sumValid}
          className="inline-flex items-center rounded-md bg-royal px-4 py-2 text-sm font-medium text-white hover:bg-royal/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save configuration"}
        </button>
        {savedAt && (
          <span className="text-xs text-slate">
            Last saved: {new Date(savedAt).toLocaleString()}
          </span>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main ExamSetupTabs export
// ---------------------------------------------------------------------------

export default function ExamSetupTabs() {
  const [active, setActive] = useState<Tab>("frameworks");

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-8 border-b border-line">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === tab.id
                ? "border-royal text-royal"
                : "border-transparent text-slate hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Frameworks & Periods ─────────────────────────────────── */}
      {active === "frameworks" && (
        <div>
          <div className="mb-6">
            <h2 className="text-base font-semibold text-ink mb-1">
              Assessment Frameworks
            </h2>
            <p className="text-sm text-slate">
              A framework ties together a curriculum type (8-4-4 or CBE), an
              academic year, and the exam periods within it. Create one framework
              per curriculum type per year, then add the periods teachers will use
              to enter marks.
            </p>
          </div>
          <FrameworkManager />
        </div>
      )}

      {/* ── Tab 2: Pathway Weights ───────────────────────────────────────── */}
      {active === "pathway-weights" && (
        <div className="max-w-lg">
          <h2 className="text-base font-semibold text-ink mb-1">
            CBE Pathway Weights
          </h2>
          <p className="text-sm text-slate mb-6">
            Set the SBA-to-exam weighting split for each subject in the senior CBE
            pathway. Weights must sum to 100% per subject.
          </p>
          <div className="rounded-xl border border-line bg-white p-6 flex items-start gap-4">
            <div className="flex-1">
              <p className="font-medium text-ink text-sm">Configure per-subject weights</p>
              <p className="text-sm text-slate mt-1">
                Opens the full pathway weights editor where you can set SBA and
                exam split for each subject.
              </p>
            </div>
            <Link
              href="/principal/assessments/pathway-weights"
              className="inline-flex items-center gap-1.5 rounded-md bg-royal px-4 py-2 text-sm font-medium text-white hover:bg-royal/90 transition-colors shrink-0"
            >
              Open Editor →
            </Link>
          </div>
          <p className="text-xs text-slate mt-4">
            Pathway weights apply to CBE classes only. 8-4-4 classes use a fixed
            100-point numeric score — no weighting needed.
          </p>
        </div>
      )}

      {/* ── Tab 3: Ranking & Flags ───────────────────────────────────────── */}
      {active === "ranking" && (
        <div>
          <div className="mb-6">
            <h2 className="text-base font-semibold text-ink mb-1">
              Ranking &amp; Performance Flags
            </h2>
            <p className="text-sm text-slate">
              Adjust how the composite teacher performance score is weighted, and set
              the mean grade threshold below which a class is flagged for attention.
              Changes to weights apply to all future ranking calculations.
            </p>
          </div>
          <RankingConfigForm />
        </div>
      )}
    </div>
  );
}
