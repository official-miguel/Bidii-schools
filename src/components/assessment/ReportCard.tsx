/**
 * Pure display component — no state, no API calls.
 * Accepts the response shape from GET /api/assessments/report-card.
 * Used by the preview pages and the print page.
 */

import { gradeColour, type KcseGrade } from "@/lib/assessment/grading844";

// ---------------------------------------------------------------------------
// Types (mirror the report-card API response)
// ---------------------------------------------------------------------------

export interface PaperResult {
  paper: { id: string; name: string; maxMarks: number };
  score: number | null;
}

export interface SubjectResult {
  subject: { id: string; name: string; code: string };
  papers: PaperResult[];
  subjectScore: number | null;
  grade: KcseGrade | null;
  points: number | null;
}

export interface ReportCardData {
  student: { id: string; fullName: string; admissionNumber: string };
  schoolClass: { id: string; name: string; form: number };
  period: { id: string; name: string; academicYear: string; term: number | null };
  school: { name: string };
  subjects: SubjectResult[];
  summary: {
    totalPoints: number | null;
    meanGrade: KcseGrade | null;
    meanPoints: number | null;
    position: number | null;
    classSize: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Dash() {
  return <span className="text-slate">—</span>;
}

function GradeCell({ grade }: { grade: KcseGrade | null }) {
  if (!grade) return <Dash />;
  const { bg, text } = gradeColour(grade);
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${bg} ${text}`}
    >
      {grade}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportCard({ data }: { data: ReportCardData }) {
  const { student, schoolClass, period, school, subjects, summary } = data;

  // Max papers across all subjects — determines how many paper columns to render.
  const maxPapers = Math.max(...subjects.map((s) => s.papers.length), 0);

  return (
    <div className="report-card-page bg-card p-8 text-sm text-foreground font-sans">
      {/* ---- Header ---- */}
      <div className="text-center mb-6 border-b-2 border-ink pb-4">
        {/* Logo placeholder */}
        <div className="mx-auto mb-2 w-16 h-16 rounded-full border-2 border-ink flex items-center justify-center text-xl font-bold">
          {school.name.charAt(0)}
        </div>
        <h1 className="font-display text-xl font-bold uppercase tracking-wide">
          {school.name}
        </h1>
        <h2 className="font-display text-base font-semibold mt-1 uppercase tracking-widest text-slate">
          Student Report Card
        </h2>
        <p className="text-xs text-slate mt-0.5">
          {period.name} &bull; Academic Year {period.academicYear}
          {period.term ? ` · Term ${period.term}` : ""}
        </p>
      </div>

      {/* ---- Student info ---- */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-6 text-xs">
        <div>
          <span className="font-semibold text-slate uppercase tracking-wide">
            Student Name:
          </span>{" "}
          {student.fullName}
        </div>
        <div>
          <span className="font-semibold text-slate uppercase tracking-wide">
            Adm. No.:
          </span>{" "}
          {student.admissionNumber}
        </div>
        <div>
          <span className="font-semibold text-slate uppercase tracking-wide">
            Class:
          </span>{" "}
          {schoolClass.name}
        </div>
        <div>
          <span className="font-semibold text-slate uppercase tracking-wide">
            Form:
          </span>{" "}
          {schoolClass.form}
        </div>
      </div>

      {/* ---- Subject table ---- */}
      <table className="w-full text-xs border border-border mb-6">
        <thead>
          <tr className="bg-background border-b border-border text-left">
            <th className="px-3 py-2 font-semibold">Subject</th>
            {maxPapers === 0 && (
              <th className="px-3 py-2 font-semibold text-center">Score</th>
            )}
            {maxPapers >= 1 && (
              <th className="px-3 py-2 font-semibold text-center">P1 Score</th>
            )}
            {maxPapers >= 2 && (
              <th className="px-3 py-2 font-semibold text-center">P2 Score</th>
            )}
            <th className="px-3 py-2 font-semibold text-center">%</th>
            <th className="px-3 py-2 font-semibold text-center">Grade</th>
            <th className="px-3 py-2 font-semibold text-center">Pts</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((sr, i) => (
            <tr
              key={sr.subject.id}
              className={`border-b border-border ${i % 2 === 0 ? "bg-card" : "bg-background/40"}`}
            >
              <td className="px-3 py-1.5 font-medium">
                {sr.subject.name}
                <span className="ml-1 text-slate font-normal">
                  ({sr.subject.code})
                </span>
              </td>

              {/* Paper score columns */}
              {maxPapers === 0 && (
                <td className="px-3 py-1.5 text-center tabular-nums">
                  {sr.subjectScore !== null ? (
                    sr.subjectScore.toFixed(1)
                  ) : (
                    <Dash />
                  )}
                </td>
              )}
              {maxPapers >= 1 && (
                <td className="px-3 py-1.5 text-center tabular-nums">
                  {sr.papers[0]?.score !== undefined &&
                  sr.papers[0]?.score !== null ? (
                    <>
                      {sr.papers[0].score}
                      <span className="text-slate">/{sr.papers[0].paper.maxMarks}</span>
                    </>
                  ) : (
                    <Dash />
                  )}
                </td>
              )}
              {maxPapers >= 2 && (
                <td className="px-3 py-1.5 text-center tabular-nums">
                  {sr.papers[1]?.score !== undefined &&
                  sr.papers[1]?.score !== null ? (
                    <>
                      {sr.papers[1].score}
                      <span className="text-slate">/{sr.papers[1].paper.maxMarks}</span>
                    </>
                  ) : (
                    <Dash />
                  )}
                </td>
              )}

              {/* Computed columns */}
              <td className="px-3 py-1.5 text-center tabular-nums">
                {sr.subjectScore !== null ? (
                  `${sr.subjectScore.toFixed(1)}%`
                ) : (
                  <Dash />
                )}
              </td>
              <td className="px-3 py-1.5 text-center">
                <GradeCell grade={sr.grade} />
              </td>
              <td className="px-3 py-1.5 text-center tabular-nums font-medium">
                {sr.points ?? <Dash />}
              </td>
            </tr>
          ))}
        </tbody>

        {/* ---- Summary row ---- */}
        <tfoot>
          <tr className="border-t-2 border-ink bg-background font-semibold">
            <td
              className="px-3 py-2 text-xs uppercase tracking-wide"
              colSpan={maxPapers > 0 ? maxPapers + 1 : 2}
            >
              Summary
            </td>
            <td className="px-3 py-2 text-center tabular-nums">
              {summary.meanPoints !== null ? (
                `${summary.meanPoints.toFixed(2)}`
              ) : (
                <Dash />
              )}
            </td>
            <td className="px-3 py-2 text-center">
              <GradeCell grade={summary.meanGrade} />
            </td>
            <td className="px-3 py-2 text-center tabular-nums">
              {summary.totalPoints ?? <Dash />}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* ---- Position / class size ---- */}
      <div className="flex items-center gap-6 mb-6 text-xs">
        <div>
          <span className="font-semibold text-slate uppercase tracking-wide">
            Class Position:
          </span>{" "}
          {summary.position !== null ? (
            <span className="font-bold text-base text-foreground">
              {summary.position}
              <span className="text-sm font-normal text-slate">
                {" "}/ {summary.classSize}
              </span>
            </span>
          ) : (
            <Dash />
          )}
        </div>
        <div>
          <span className="font-semibold text-slate uppercase tracking-wide">
            Mean Grade:
          </span>{" "}
          {summary.meanGrade ? (
            <span className="font-bold text-base text-foreground">{summary.meanGrade}</span>
          ) : (
            <Dash />
          )}
        </div>
        <div>
          <span className="font-semibold text-slate uppercase tracking-wide">
            Mean Points:
          </span>{" "}
          {summary.meanPoints !== null ? (
            <span className="font-bold text-base text-foreground">
              {summary.meanPoints.toFixed(2)}
            </span>
          ) : (
            <Dash />
          )}
        </div>
      </div>

      {/* ---- Class teacher signature line ---- */}
      <div className="flex justify-between items-end mt-8 pt-4 border-t border-border text-xs text-slate">
        <div>
          <div className="border-b border-slate w-40 mb-1" />
          <span>Class Teacher Signature</span>
        </div>
        <div>
          <div className="border-b border-slate w-40 mb-1" />
          <span>Principal Signature</span>
        </div>
        <div>
          <div className="border-b border-slate w-40 mb-1" />
          <span>Date</span>
        </div>
      </div>
    </div>
  );
}
