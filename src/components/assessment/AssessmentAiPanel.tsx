"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronUp, ChevronDown, RefreshCw, Lightbulb } from "lucide-react";
import { ErrorBanner } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types (mirrors /api/assessments/ai/insights response)
// ---------------------------------------------------------------------------

interface AtRiskStudent {
  studentId:   string;
  studentName: string;
  reason:      string;
  severity:    "HIGH" | "MEDIUM";
}

interface AtRiskReport {
  atRisk:         AtRiskStudent[];
  checkedCount:   number;
  periodName:     string;
  prevPeriodName: string | null;
}

interface AnomalyFlag {
  paperId:     string | null;
  subjectId:   string | null;
  studentId:   string | null;
  description: string;
  severity:    "HIGH" | "MEDIUM";
}

interface AnomalyReport {
  flags:   AnomalyFlag[];
  checked: number;
}

interface NlAnswer {
  value: { answer: string; relatedNumbers: string[] };
  error: string | null;
}

interface Recommendation {
  area:       string;
  issue:      string;
  suggestion: string;
}

interface InsightsData {
  framework:    string;
  atRisk:       AtRiskReport;
  anomalies:    AnomalyReport;
  nlAnswer:     NlAnswer | null;
  recommendations: { value: Recommendation[]; error: string | null } | null;
  contextSummary: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  periodId:   string;
  classId:    string;
  /** Pre-selected student for recommendations (optional). */
  studentId?: string;
  framework?: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: "HIGH" | "MEDIUM" }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
        severity === "HIGH"
          ? "bg-red-100 text-red-700"
          : "bg-amber-100 text-amber-700"
      }`}
    >
      {severity}
    </span>
  );
}

function AiLabel() {
  return (
    <span className="ml-2 inline-block rounded-full bg-purple-100 text-purple-700 text-[10px] font-semibold px-2 py-0.5 align-middle">
      AI-drafted
    </span>
  );
}

function Section({
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-background/40 transition-colors"
      >
        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
          {title}
          {badge}
        </span>
        <span className="text-slate shrink-0">
          {open
            ? <ChevronUp  className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
            : <ChevronDown className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
          }
        </span>
      </button>
      {open && <div className="px-5 pb-5 border-t border-border">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AssessmentAiPanel({
  periodId,
  classId,
  studentId,
  framework,
}: Props) {
  const [data,     setData]     = useState<InsightsData | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asked,    setAsked]    = useState("");
  const [isOpen,   setIsOpen]   = useState(true);
  const [qaHistory, setQaHistory] = useState<Array<{ q: string; a: string; nums: string[] }>>([]);

  const fetchInsights = useCallback(
    async (q?: string) => {
      if (!periodId || !classId) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/assessments/ai/insights", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ periodId, classId, studentId, question: q }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Failed to load AI insights.");
          return;
        }
        // Detect Gemini config issue from any sub-result error.
        const configErr =
          json.nlAnswer?.error ||
          json.recommendations?.error;
        if (configErr && configErr.includes("key")) {
          setError(configErr);
        }
        setData(json);
        if (q && json.nlAnswer?.value?.answer) {
          setQaHistory((prev) =>
            [{ q, a: json.nlAnswer.value.answer, nums: json.nlAnswer.value.relatedNumbers ?? [] }, ...prev].slice(0, 4)
          );
        }
      } catch {
        setError("Couldn't reach the AI insights endpoint.");
      } finally {
        setLoading(false);
      }
    },
    [periodId, classId, studentId]
  );

  // Auto-load when period/class change.
  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setAsked(q);
    setQuestion("");
    fetchInsights(q);
  }

  if (!isOpen) {
    return (
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="text-sm text-royal font-medium hover:underline"
        >
          Show AI Insights
        </button>
      </div>
    );
  }

  const atRiskCount   = data?.atRisk.atRisk.length   ?? 0;
  const anomalyCount  = data?.anomalies.flags.length  ?? 0;

  return (
    <div className="mt-6 space-y-4">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
          AI Insights
          <AiLabel />
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchInsights()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-slate hover:text-foreground disabled:opacity-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.8} aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-xs text-slate hover:text-foreground"
          >
            Hide
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading && (
        <div className="bg-card border border-border rounded-xl p-5 text-sm text-slate">
          Running AI analysis…
        </div>
      )}

      {!loading && data && (
        <>
          {/* At-risk detection */}
          <Section
            title="Early-warning / at-risk students"
            badge={
              atRiskCount > 0 ? (
                <span className="inline-block rounded-full bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5">
                  {atRiskCount} flagged
                </span>
              ) : (
                <span className="inline-block rounded-full bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5">
                  All clear
                </span>
              )
            }
          >
            <p className="text-xs text-slate mt-3 mb-3">
              Checked {data.atRisk.checkedCount} students in {data.atRisk.periodName}
              {data.atRisk.prevPeriodName ? ` vs ${data.atRisk.prevPeriodName}` : " (no previous period to compare)"}
              .{" "}
              {framework === "CBE"
                ? "CBE: flags learners with 2+ level drops per learning area or widening SBA/exam gap."
                : "8-4-4: flags mean-grade drops ≥ 3 pts or E-grade students."}
            </p>

            {atRiskCount === 0 ? (
              <p className="text-sm text-slate">No students flagged for this period.</p>
            ) : (
              <div className="space-y-2">
                {data.atRisk.atRisk.map((s) => (
                  <div
                    key={`${s.studentId}-${s.reason}`}
                    className={`flex items-start gap-3 rounded-lg px-3 py-2 ${
                      s.severity === "HIGH" ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"
                    }`}
                  >
                    <SeverityBadge severity={s.severity} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{s.studentName}</p>
                      <p className="text-xs text-slate mt-0.5">{s.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Anomaly detection */}
          <Section
            title="Entry anomalies"
            badge={
              anomalyCount > 0 ? (
                <span className="inline-block rounded-full bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5">
                  {anomalyCount} flag{anomalyCount !== 1 ? "s" : ""}
                </span>
              ) : undefined
            }
            defaultOpen={anomalyCount > 0}
          >
            <p className="text-xs text-slate mt-3 mb-3">
              Checked {data.anomalies.checked} mark entries for out-of-range scores,
              identical class-wide entries, and statistical outliers (±3σ).
            </p>
            {anomalyCount === 0 ? (
              <p className="text-sm text-slate">No anomalies detected.</p>
            ) : (
              <div className="space-y-2">
                {data.anomalies.flags.map((f, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 rounded-lg px-3 py-2 ${
                      f.severity === "HIGH" ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"
                    }`}
                  >
                    <SeverityBadge severity={f.severity} />
                    <p className="text-xs text-foreground flex-1">{f.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Per-student recommendations */}
          {data.recommendations && (
            <Section title="Personalised recommendations" defaultOpen={false}>
              <AiLabel />
              {data.recommendations.error ? (
                <ErrorBanner message={data.recommendations.error} />
              ) : data.recommendations.value.length === 0 ? (
                <p className="text-sm text-slate mt-3">No recommendations generated.</p>
              ) : (
                <div className="space-y-3 mt-3">
                  {data.recommendations.value.map((r, i) => (
                    <div key={i} className="rounded-lg bg-background border border-border px-4 py-3">
                      <p className="text-sm font-semibold text-foreground">{r.area}</p>
                      <p className="text-xs text-slate mt-0.5">{r.issue}</p>
                      <p className="text-xs text-foreground mt-1 flex items-start gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-px text-warn" strokeWidth={1.8} aria-hidden="true" />
                        {r.suggestion}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* NL query */}
          <Section title="Ask about these results" defaultOpen>
            <p className="text-xs text-slate mt-3 mb-3">
              Ask a plain-language question. The AI queries against real data from this class and period.
              <AiLabel />
            </p>

            <form onSubmit={handleAskSubmit} className="flex gap-2 mb-4">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={`e.g. "Which ${framework === "CBE" ? "learning area" : "subject"} needs the most attention?"`}
                className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-royal focus:outline-none"
                maxLength={500}
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="rounded-md bg-teal text-white text-sm font-medium px-4 py-2 hover:bg-teal-dark disabled:opacity-50 transition-colors"
              >
                Ask
              </button>
            </form>

            {/* Current answer */}
            {data.nlAnswer?.value?.answer && (
              <div className="mb-3 rounded-lg bg-background border border-border px-4 py-3">
                {asked && <p className="text-xs font-medium text-slate mb-1">Q: {asked}</p>}
                <p className="text-sm text-foreground">{data.nlAnswer.value.answer}</p>
                {data.nlAnswer.value.relatedNumbers?.length > 0 && (
                  <p className="mt-2 text-xs text-slate">
                    Key figures: {data.nlAnswer.value.relatedNumbers.join(" · ")}
                  </p>
                )}
              </div>
            )}

            {/* History */}
            {qaHistory.length > 1 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate">Recent questions</p>
                {qaHistory.slice(1).map((qa, i) => (
                  <div key={i} className="rounded-lg border border-border px-3 py-2 bg-card">
                    <p className="text-xs font-medium text-foreground">Q: {qa.q}</p>
                    <p className="text-xs text-slate">A: {qa.a}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
