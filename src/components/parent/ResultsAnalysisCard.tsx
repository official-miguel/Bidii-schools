"use client";

/**
 * ResultsAnalysisCard
 *
 * One scrollable rectangle "tile" per assessment period, titled with the
 * period name, holding the full results-analysis view (overall grade, subject
 * movement counts, subject breakdown table, AI insights) — mirrors the
 * parent "Results Analysis" mock. No student photo (per spec — everything
 * else from the mock is kept).
 *
 * Only rendered for periods whose results SMS has already gone out
 * (server gates this — see /parent/results/page.tsx).
 */

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, Sparkles, Loader2 } from "lucide-react";
import type { PeriodAnalysis, SubjectMovement } from "@/lib/parent/resultsAnalysis";

interface Props {
  studentId: string;
  analysis: PeriodAnalysis;
  /** Every SMS-released period for this student, for the AI "compare" picker. */
  comparablePeriods: { id: string; label: string }[];
}

const DEFAULT_PROMPTS = [
  "Which subjects should I encourage more effort on if he wants to pursue engineering?",
  "Which subjects should I encourage more effort on if she wants to pursue medicine?",
  "How does this term compare to the last one, and what changed?",
  "What's the single most useful thing I can do to help this term?",
];

function bucketMeta(bucket: SubjectMovement["bucket"]) {
  switch (bucket) {
    case "SIGNIFICANT_IMPROVEMENT":
      return { label: "Significant improvement", color: "text-success", bg: "bg-success-bg", Icon: TrendingUp };
    case "MODERATE_IMPROVEMENT":
      return { label: "Moderate improvement", color: "text-success", bg: "bg-success-bg", Icon: TrendingUp };
    case "DECLINE":
      return { label: "Decline", color: "text-danger", bg: "bg-danger-bg", Icon: TrendingDown };
    case "NEW":
      return { label: "New", color: "text-info", bg: "bg-info/10", Icon: Minus };
    default:
      return { label: "No change", color: "text-slate", bg: "bg-slate/10", Icon: Minus };
  }
}

export default function ResultsAnalysisCard({ studentId, analysis, comparablePeriods }: Props) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparePeriodId, setComparePeriodId] = useState<string>("");
  const [customQuestion, setCustomQuestion] = useState("");

  const { period, overall, previousOverall, movements, counts, highestSubject } = analysis;

  const pointsDelta = overall && previousOverall != null
    ? overall.totalPoints - previousOverall.totalPoints
    : null;

  async function askAi(question?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/parent/results/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          periodId: period.id,
          comparePeriodId: comparePeriodId || undefined,
          question,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setInsight(data.insight);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden">
      {/* Tile header — named by the exam period */}
      <div className="px-5 py-4 border-b border-border bg-[#F5F7FA] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-foreground">{period.name}</h3>
          <p className="text-xs text-slate mt-0.5">
            {period.academicYear}{period.term != null ? ` · Term ${period.term}` : ""}
          </p>
        </div>
        {overall && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-slate">Overall grade</p>
              <p className="text-lg font-bold text-teal leading-tight">{overall.gradeBand ?? "—"}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-slate">Points</p>
              <p className="text-lg font-bold text-foreground leading-tight">{overall.totalPoints}</p>
            </div>
            {pointsDelta != null && (
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                  pointsDelta > 0 ? "bg-success-bg text-success" : pointsDelta < 0 ? "bg-danger-bg text-danger" : "bg-slate/10 text-slate"
                }`}
              >
                {pointsDelta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : pointsDelta < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                {pointsDelta > 0 ? "+" : ""}{pointsDelta} pts
              </span>
            )}
          </div>
        )}
      </div>

      {/* Scrollable body — everything else lives inside this one tile */}
      <div className="max-h-[640px] overflow-y-auto p-5 space-y-5">
        {/* Stat row */}
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Improved" value={counts.improved} tone="success" />
          <StatTile label="Stable" value={counts.stable} tone="slate" />
          <StatTile label="Declined" value={counts.declined} tone="danger" />
        </div>

        {highestSubject && (
          <div className="rounded-xl border border-teal/20 bg-teal/5 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate">Highest subject</p>
              <p className="text-sm font-semibold text-foreground">{highestSubject.subjectName}</p>
            </div>
            <span className="text-sm font-bold text-teal">{highestSubject.bandName}</span>
          </div>
        )}

        {/* Subject breakdown */}
        <div>
          <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-2">Subject breakdown</p>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F7FA]">
                <tr className="text-left text-[11px] text-slate uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Subject</th>
                  <th className="px-3 py-2 font-medium">Current</th>
                  <th className="px-3 py-2 font-medium">Previous</th>
                  <th className="px-3 py-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((m) => {
                  const meta = bucketMeta(m.bucket);
                  return (
                    <tr key={m.subjectId}>
                      <td className="px-3 py-2 text-foreground">{m.subjectName}</td>
                      <td className="px-3 py-2 font-semibold text-foreground">{m.current.bandName ?? "—"}</td>
                      <td className="px-3 py-2 text-slate">{m.previous?.bandName ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${meta.bg} ${meta.color}`}>
                          <meta.Icon className="h-3 w-3" />
                          {m.pointsDelta != null ? (m.pointsDelta > 0 ? `+${m.pointsDelta}` : m.pointsDelta) : meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI insights */}
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-teal" />
            <p className="text-sm font-semibold text-foreground">AI Insights</p>
          </div>

          {comparablePeriods.length > 1 && (
            <select
              value={comparePeriodId}
              onChange={(e) => setComparePeriodId(e.target.value)}
              className="w-full text-xs border border-border rounded-lg px-2.5 py-2 bg-card text-foreground"
            >
              <option value="">Compare against… (optional)</option>
              {comparablePeriods.filter((p) => p.id !== period.id).map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          )}

          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => askAi(q)}
                disabled={loading}
                className="text-[11px] px-2.5 py-1.5 rounded-full border border-teal/30 text-teal
                           hover:bg-teal/5 transition-colors disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); if (customQuestion.trim()) askAi(customQuestion.trim()); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="Ask about this child's results…"
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-card text-foreground"
            />
            <button
              type="submit"
              disabled={loading || !customQuestion.trim()}
              className="px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium disabled:opacity-50"
            >
              Ask
            </button>
          </form>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          {insight && !loading && (
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{insight}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: "success" | "danger" | "slate" }) {
  const toneClass = tone === "success" ? "text-success bg-success-bg" : tone === "danger" ? "text-danger bg-danger-bg" : "text-slate bg-slate/10";
  return (
    <div className={`rounded-xl px-3 py-3 text-center ${toneClass}`}>
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="text-[11px] mt-1 font-medium">{label}</p>
    </div>
  );
}
