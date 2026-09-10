/**
 * Pure display component for CBE report cards.
 * Accepts CbeReportCardData from reportCardCbe.ts.
 * No numeric mean, no class rank for Junior CBE.
 */

import { levelColour, LEVEL_LABELS, LEVEL_SHORT, type PerformanceLevel } from "@/lib/assessment/gradingCbe";
import type {
  CbeReportCardData,
  JuniorReportCardData,
  SeniorReportCardData,
} from "@/lib/assessment/reportCardCbe";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function Dash() {
  return <span className="text-slate">—</span>;
}

function LvlBadge({ level }: { level: PerformanceLevel | null }) {
  if (!level) return <Dash />;
  const { bg, text } = levelColour(level);
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${bg} ${text}`}>
      {LEVEL_SHORT[level]}
    </span>
  );
}

/**
 * Renders a CBE band name badge with colour-coding based on the EE/ME/AE/BE
 * category prefix.  Works for both the government default (EE1, ME2, etc.)
 * and any custom band names a school may define.
 *   EE → green   (Exceeds Expectation)
 *   ME → blue    (Meets Expectation)
 *   AE → amber   (Approaches Expectation)
 *   BE → orange  (Below Expectation)
 *   other → teal (custom / unknown)
 */
function GradeCell({ grade }: { grade: string | null }) {
  if (!grade) return <Dash />;

  const upper = grade.toUpperCase();
  let className = "bg-teal/10 text-teal"; // default for fully custom names
  if (upper.startsWith("EE")) className = "bg-green-100 text-green-800";
  else if (upper.startsWith("ME")) className = "bg-blue-100 text-blue-800";
  else if (upper.startsWith("AE")) className = "bg-amber-100 text-amber-800";
  else if (upper.startsWith("BE")) className = "bg-orange-100 text-orange-800";

  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${className}`}>
      {grade}
    </span>
  );
}

function CardHeader({
  school, student, schoolClass, period,
}: {
  school: { name: string };
  student: { fullName: string; admissionNumber: string };
  schoolClass: { name: string; form: number };
  period: { name: string; academicYear: string; term: number | null };
}) {
  return (
    <>
      <div className="text-center mb-6 border-b-2 border-ink pb-4">
        <div className="mx-auto mb-2 w-16 h-16 rounded-full border-2 border-ink flex items-center justify-center text-xl font-bold">
          {school.name.charAt(0)}
        </div>
        <h1 className="font-display text-xl font-bold uppercase tracking-wide">{school.name}</h1>
        <h2 className="font-display text-base font-semibold mt-1 uppercase tracking-widest text-slate">
          Student Report Card — CBE
        </h2>
        <p className="text-xs text-slate mt-0.5">
          {period.name} &bull; Academic Year {period.academicYear}
          {period.term ? ` · Term ${period.term}` : ""}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-6 text-xs">
        <div><span className="font-semibold text-slate uppercase tracking-wide">Student Name:</span> {student.fullName}</div>
        <div><span className="font-semibold text-slate uppercase tracking-wide">Adm. No.:</span> {student.admissionNumber}</div>
        <div><span className="font-semibold text-slate uppercase tracking-wide">Class:</span> {schoolClass.name}</div>
        <div><span className="font-semibold text-slate uppercase tracking-wide">Form:</span> {schoolClass.form}</div>
      </div>
    </>
  );
}

function SignatureLines() {
  return (
    <div className="flex justify-between items-end mt-8 pt-4 border-t border-border text-xs text-slate">
      <div><div className="border-b border-slate w-40 mb-1" /><span>Class Teacher Signature</span></div>
      <div><div className="border-b border-slate w-40 mb-1" /><span>Principal Signature</span></div>
      <div><div className="border-b border-slate w-40 mb-1" /><span>Date</span></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Junior CBE report card
// ---------------------------------------------------------------------------

function JuniorCard({ data }: { data: JuniorReportCardData }) {
  const levels: PerformanceLevel[] = ["EE", "ME", "AE", "BE"];
  const totalAssessed = data.assessedCount;

  return (
    <div className="report-card-page bg-card p-8 text-sm text-foreground font-sans">
      <CardHeader school={data.school} student={data.student} schoolClass={data.schoolClass} period={data.period} />

      {/* CBE framework notice */}
      <div className="mb-5 rounded-md bg-green-50 border border-green-200 text-green-800 text-xs px-3 py-2">
        Competency-Based Education (CBE) — Junior level. Results expressed as performance levels only.
        No numeric average or class ranking is produced, consistent with the CBE non-ranking design.
      </div>

      {/* Level key */}
      <div className="flex flex-wrap gap-2 mb-5 text-xs">
        {levels.map((l) => {
          const { bg, text } = levelColour(l);
          return (
            <span key={l} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${bg} ${text}`}>
              {LEVEL_SHORT[l]} — {LEVEL_LABELS[l]}
            </span>
          );
        })}
      </div>

      {/* Per-learning-area strand tables */}
      {data.learningAreas.map((la) => (
        <div key={la.learningArea.id} className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-semibold text-sm uppercase tracking-wide text-foreground">
              {la.learningArea.name}
            </h3>
            <LvlBadge level={la.summaryLevel} />
          </div>
          <table className="w-full text-xs border border-border">
            <thead>
              <tr className="bg-background border-b border-border text-left">
                <th className="px-3 py-2 font-semibold">Strand / Sub-strand</th>
                <th className="px-3 py-2 font-semibold text-center w-20">Level</th>
                <th className="px-3 py-2 font-semibold">Comment</th>
              </tr>
            </thead>
            <tbody>
              {la.strands.map((strand) => (
                <>
                  {/* Strand header row */}
                  <tr key={`strand-${strand.strand.id}`} className="bg-background/60 border-b border-border">
                    <td className="px-3 py-1.5 font-semibold text-foreground" colSpan={2}>
                      {strand.strand.name}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <LvlBadge level={strand.summaryLevel} />
                    </td>
                  </tr>
                  {/* Sub-strand rows */}
                  {strand.subStrands.map((ss, ssi) => (
                    <tr
                      key={ss.subStrand.id}
                      className={`border-b border-border last:border-0 ${ssi % 2 === 0 ? "bg-card" : "bg-background/30"}`}
                    >
                      <td className="px-3 py-1.5 pl-6 text-foreground">{ss.subStrand.name}</td>
                      <td className="px-3 py-1.5 text-center"><LvlBadge level={ss.level} /></td>
                      <td className="px-3 py-1.5 text-slate italic">{ss.comment ?? ""}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Summary counts */}
      <div className="mb-6 p-4 bg-background rounded-lg border border-border">
        <h3 className="font-semibold text-xs uppercase tracking-wide text-slate mb-3">
          Attainment summary ({totalAssessed} of {data.totalSubStrands} sub-strands assessed)
        </h3>
        <div className="flex flex-wrap gap-3">
          {levels.map((l) => {
            const { bg, text } = levelColour(l);
            const count = data.levelTotals[l];
            const pct   = totalAssessed > 0 ? Math.round((count / totalAssessed) * 100) : 0;
            return (
              <div key={l} className={`rounded-lg px-3 py-2 text-center min-w-[60px] ${bg}`}>
                <div className={`text-lg font-bold ${text}`}>{count}</div>
                <div className={`text-xs font-semibold ${text}`}>{LEVEL_SHORT[l]}</div>
                <div className={`text-[10px] ${text}`}>{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Narrative */}
      {data.narrativeSummary && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h3 className="font-semibold text-xs uppercase tracking-wide text-amber-700 mb-2">
            Teacher narrative summary <span className="font-normal italic">(AI-drafted, editable)</span>
          </h3>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{data.narrativeSummary}</p>
        </div>
      )}

      <SignatureLines />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Senior CBE report card
// ---------------------------------------------------------------------------

function SeniorCard({ data }: { data: SeniorReportCardData }) {
  return (
    <div className="report-card-page bg-card p-8 text-sm text-foreground font-sans">
      <CardHeader school={data.school} student={data.student} schoolClass={data.schoolClass} period={data.period} />

      <div className="mb-5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-xs px-3 py-2">
        Competency-Based Education (CBE) — Senior/Pathway level. Results show School-Based Assessment (SBA)
        and external exam scores with configured weighting. No class ranking is produced.
      </div>

      <table className="w-full text-xs border border-border mb-6">
        <thead>
          <tr className="bg-background border-b border-border text-left">
            <th className="px-3 py-2 font-semibold">Subject</th>
            <th className="px-3 py-2 font-semibold text-center">SBA score</th>
            <th className="px-3 py-2 font-semibold text-center">Exam score</th>
            <th className="px-3 py-2 font-semibold text-center">Weighted %</th>
            <th className="px-3 py-2 font-semibold text-center">Grade</th>
          </tr>
        </thead>
        <tbody>
          {data.subjects.map((sr, i) => (
            <tr key={sr.subject.id} className={`border-b border-border ${i % 2 === 0 ? "bg-card" : "bg-background/40"}`}>
              <td className="px-3 py-1.5 font-medium text-foreground">
                {sr.subject.name}
                <span className="ml-1 text-slate font-normal">({sr.subject.code})</span>
              </td>
              <td className="px-3 py-1.5 text-center tabular-nums">
                {sr.sbaScore !== null
                  ? <>{sr.sbaScore}<span className="text-slate">/{sr.sbaMaxMarks}</span><span className="ml-1 text-slate text-[10px]">×{Math.round(sr.sbaWeight * 100)}%</span></>
                  : <Dash />}
              </td>
              <td className="px-3 py-1.5 text-center tabular-nums">
                {sr.examScore !== null
                  ? <>{sr.examScore}<span className="text-slate">/{sr.examMaxMarks}</span><span className="ml-1 text-slate text-[10px]">×{Math.round(sr.examWeight * 100)}%</span></>
                  : <Dash />}
              </td>
              <td className="px-3 py-1.5 text-center tabular-nums font-medium">
                {sr.weightedScore !== null ? `${sr.weightedScore.toFixed(1)}%` : <Dash />}
              </td>
              <td className="px-3 py-1.5 text-center">
                <GradeCell grade={sr.indicativeGrade} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink bg-background font-semibold">
            <td className="px-3 py-2 text-xs uppercase tracking-wide" colSpan={3}>
              Overall pathway performance
            </td>
            <td className="px-3 py-2 text-center tabular-nums">
              {data.overallWeightedMean !== null ? `${data.overallWeightedMean.toFixed(1)}%` : <Dash />}
            </td>
            <td className="px-3 py-2 text-center">
              {data.overallWeightedMean !== null ? (
                (() => {
                  const { bg, text } = data.overallWeightedMean >= 75 ? { bg: "bg-green-100", text: "text-green-800" }
                    : data.overallWeightedMean >= 60 ? { bg: "bg-blue-100", text: "text-blue-800" }
                    : data.overallWeightedMean >= 40 ? { bg: "bg-amber-100", text: "text-amber-800" }
                    : { bg: "bg-red-100", text: "text-red-800" };
                  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${bg} ${text}`}>Summary</span>;
                })()
              ) : <Dash />}
            </td>
          </tr>
        </tfoot>
      </table>

      {data.narrativeSummary && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h3 className="font-semibold text-xs uppercase tracking-wide text-amber-700 mb-2">
            Teacher narrative summary <span className="font-normal italic">(AI-drafted, editable)</span>
          </h3>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{data.narrativeSummary}</p>
        </div>
      )}

      <SignatureLines />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

export default function CbeReportCard({ data }: { data: CbeReportCardData }) {
  if (data.kind === "JUNIOR") return <JuniorCard data={data} />;
  return <SeniorCard data={data} />;
}
