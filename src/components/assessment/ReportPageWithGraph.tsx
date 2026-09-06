"use client";

/**
 * Enhanced ReportPage with the "Performance over Time" line chart shown
 * side-by-side with the marks table on desktop and stacked on mobile.
 *
 * Replaces / wraps ReportPage for the new unified report-cards view.
 */

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { ReportCardData } from "@/components/assessment/ReportCard";
import type { CbeReportCardData } from "@/lib/assessment/reportCardCbe";
import ReportCard from "@/components/assessment/ReportCard";
import CbeReportCard from "@/components/assessment/CbeReportCard";
// Recharts is only needed after the user clicks "Generate Report" — lazy load it.
import type { HistoryPoint } from "@/components/assessment/PerformanceLineChart";
const PerformanceLineChart = dynamic(
  () => import("@/components/assessment/PerformanceLineChart"),
  { ssr: false }
);

interface ReportRemark {
  draftRemark: string | null;
  editedRemark: string | null;
  isAiGenerated: boolean;
}

interface Props {
  studentId: string;
  periodId: string;
  frameworkType: "EIGHT_FOUR_FOUR" | "CBE";
  /** When true the Generate button is skipped and data loads immediately. */
  autoLoad?: boolean;
}

export default function ReportPageWithGraph({
  studentId,
  periodId,
  frameworkType,
  autoLoad = false,
}: Props) {
  const [generated, setGenerated] = useState(autoLoad);
  const [reportData, setReportData] = useState<ReportCardData | CbeReportCardData | null>(null);
  const [remark, setRemark] = useState<ReportRemark | null>(null);
  const [editedText, setEditedText] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);
  const [remarkSaved, setRemarkSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyPoints, setHistoryPoints] = useState<HistoryPoint[]>([]);
  const [emailSent, setEmailSent] = useState(false);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        frameworkType === "EIGHT_FOUR_FOUR"
          ? `/api/assessments/report-card?periodId=${periodId}&studentId=${studentId}`
          : `/api/assessments/report-card/cbe?periodId=${periodId}&studentId=${studentId}`;

      const requests: Promise<Response>[] = [
        fetch(endpoint),
        fetch(`/api/assessments/report/remarks?periodId=${periodId}&studentId=${studentId}`),
      ];

      // Only fetch history for 8-4-4 (numeric history makes sense there).
      if (frameworkType === "EIGHT_FOUR_FOUR") {
        requests.push(fetch(`/api/assessments/report-card/student-history?studentId=${studentId}`));
      }

      const [reportRes, remarkRes, historyRes] = await Promise.all(requests);

      if (!reportRes.ok) {
        const d = await reportRes.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "Failed to generate report.");
      }

      setReportData(await reportRes.json());

      if (remarkRes?.ok) {
        const rj: ReportRemark = await remarkRes.json();
        setRemark(rj);
        setEditedText(rj.editedRemark ?? rj.draftRemark ?? "");
      }

      if (historyRes?.ok) {
        const hj: { points: HistoryPoint[] } = await historyRes.json();
        setHistoryPoints(hj.points ?? []);
      }

      setGenerated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-load when prop is true or when studentId/periodId change after first load.
  useEffect(() => {
    if (autoLoad) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, periodId, autoLoad]);

  async function handleSaveRemark() {
    setSavingRemark(true);
    setRemarkSaved(false);
    try {
      const res = await fetch("/api/assessments/report/remarks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, studentId, remark: editedText }),
      });
      if (res.ok) {
        const data: ReportRemark = await res.json();
        setRemark(data);
        setRemarkSaved(true);
        setTimeout(() => setRemarkSaved(false), 3000);
      }
    } finally {
      setSavingRemark(false);
    }
  }

  // ---------- not yet generated ----------
  if (!generated) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-slate">
          Click Generate to build the report card and fetch an AI-drafted comment.
        </p>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="rounded-md bg-royal text-white text-sm font-medium px-5 py-2.5 hover:bg-royal/90 transition-colors disabled:opacity-60"
        >
          {loading ? "Generating…" : "Generate Report"}
        </button>
        {error && (
          <div className="rounded-md bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 rounded-lg bg-line/40 animate-pulse" />
        <div className="h-64 rounded-xl bg-line/40 animate-pulse" />
      </div>
    );
  }

  if (!reportData) return null;

  return (
    <div className="space-y-5 print:space-y-0">
      {/* ── Action bar ── */}
      <div className="flex flex-wrap gap-3 items-center justify-between bg-white border border-line rounded-xl px-4 py-3 print:hidden">
        <span className="text-sm font-medium text-ink">Report ready</span>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-md bg-teal text-white text-sm font-medium px-4 py-2 hover:bg-teal-dark transition-colors"
          >
            Download / Print PDF
          </button>
          <button
            onClick={() => setEmailSent(true)}
            className="rounded-md border border-line text-sm font-medium px-4 py-2 text-ink hover:bg-paper transition-colors"
          >
            {emailSent ? "Email queued ✓" : "Email to Parent"}
          </button>
        </div>
      </div>

      {/* ── AI remark editor ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3 print:hidden">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
            Teacher comment — review before sending
          </p>
          {remark?.isAiGenerated && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 font-medium shrink-0">
              AI draft
            </span>
          )}
        </div>
        {remark === null && (
          <p className="text-xs text-amber-700 italic">
            AI remark service unavailable. You can write a comment manually below.
          </p>
        )}
        <textarea
          value={editedText}
          onChange={(e) => { setEditedText(e.target.value); setRemarkSaved(false); }}
          rows={3}
          className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-ink focus:border-amber-500 focus:outline-none resize-none"
          placeholder="Write or edit the teacher comment here…"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveRemark}
            disabled={savingRemark}
            className="rounded-md bg-amber-700 text-white text-xs font-medium px-3 py-1.5 hover:bg-amber-800 transition-colors disabled:opacity-60"
          >
            {savingRemark ? "Saving…" : "Save Comment"}
          </button>
          {remarkSaved && <span className="text-xs text-green-700 font-medium">Saved ✓</span>}
        </div>
      </div>

      {/* ── Main report area ── */}
      <div className="border border-line rounded-xl overflow-hidden shadow-sm print:shadow-none print:border-0">
        {frameworkType === "EIGHT_FOUR_FOUR" ? (
          /*
           * 8-4-4: side-by-side layout matching the screenshot.
           * Left half: subject performance table (existing ReportCard).
           * Right half: performance-over-time line chart.
           * On mobile they stack vertically.
           */
          <div className="bg-white">
            <div className="flex flex-col lg:flex-row">
              {/* Left — marks table */}
              <div className="lg:w-1/2 border-b lg:border-b-0 lg:border-r border-line">
                <ReportCard data={reportData as ReportCardData} />
              </div>

              {/* Right — performance chart */}
              <div className="lg:w-1/2 p-6 flex flex-col gap-4">
                <h3 className="font-display font-semibold text-base text-ink">
                  Performance over Time
                </h3>
                <PerformanceLineChart points={historyPoints} />

                {/* Summary stats row below the graph */}
                {frameworkType === "EIGHT_FOUR_FOUR" && (() => {
                  const d = reportData as ReportCardData;
                  return (
                    <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
                      <div className="rounded-lg bg-paper border border-line p-3 text-center">
                        <div className="text-2xl font-bold text-royal">
                          {d.summary.meanGrade ?? "—"}
                        </div>
                        <div className="text-slate mt-0.5">Mean Grade</div>
                      </div>
                      <div className="rounded-lg bg-paper border border-line p-3 text-center">
                        <div className="text-2xl font-bold text-ink">
                          {d.summary.position !== null
                            ? `${d.summary.position}/${d.summary.classSize}`
                            : "—"}
                        </div>
                        <div className="text-slate mt-0.5">Class Position</div>
                      </div>
                      <div className="rounded-lg bg-paper border border-line p-3 text-center">
                        <div className="text-2xl font-bold text-ink">
                          {d.summary.totalPoints ?? "—"}
                        </div>
                        <div className="text-slate mt-0.5">Total Points</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        ) : (
          /* CBE: just the CBE card, no numeric history graph */
          <CbeReportCard data={reportData as CbeReportCardData} />
        )}
      </div>
    </div>
  );
}
