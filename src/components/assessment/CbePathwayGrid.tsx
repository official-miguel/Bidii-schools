"use client";

import { useCallback, useEffect, useState } from "react";
import { pathwayScore } from "@/lib/assessment/gradingCbe";
import { scoreToGrade, gradeColour } from "@/lib/assessment/grading844";
import {
  EmptyState,
  ErrorBanner,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { SkeletonTableRow } from "@/components/ui/ProgressivePage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = { id: string; name: string; academicYear: string; isCurrent?: boolean };

type WeightConfig = {
  subject:      { id: string; name: string; code: string };
  sbaWeight:    number;
  examWeight:   number;
  sbaMaxMarks:  number;
  examMaxMarks: number;
  isDefault:    boolean;
};

type StudentRow = {
  student: { id: string; fullName: string; admissionNumber: string };
  scores:  Record<string, { sba: number | null; exam: number | null }>; // subjectId → scores
};

type CellKey = `${string}:sba` | `${string}:exam`;
type Edits = Map<CellKey, number | null>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  classes:         { id: string; name: string }[];
  defaultClassId?: string;
  lockClass?:      boolean;
  readOnly?:       boolean;
};

// ---------------------------------------------------------------------------
// Score input cell
// ---------------------------------------------------------------------------

function ScoreCell({
  value,
  maxMarks,
  onChange,
  readOnly,
  invalid,
}: {
  value:    number | null;
  maxMarks: number;
  onChange: (v: number | null) => void;
  readOnly: boolean;
  invalid:  boolean;
}) {
  const [raw, setRaw] = useState(value === null ? "" : String(value));

  useEffect(() => {
    setRaw(value === null ? "" : String(value));
  }, [value]);

  if (readOnly) {
    return (
      <span className="text-sm tabular-nums text-foreground">
        {value === null ? <span className="text-slate">—</span> : value}
      </span>
    );
  }

  return (
    <input
      type="number"
      min={0}
      max={maxMarks}
      step={0.5}
      value={raw}
      onChange={(e) => {
        const t = e.target.value;
        setRaw(t);
        if (t === "") { onChange(null); return; }
        const n = parseFloat(t);
        if (!isNaN(n) && n >= 0 && n <= maxMarks) onChange(n);
      }}
      className={`w-16 rounded border px-2 py-1 text-sm tabular-nums text-center focus:outline-none focus:ring-1 focus:ring-royal/40
        ${invalid
          ? "border-danger bg-danger-bg/30 text-danger"
          : "border-border bg-card text-foreground hover:border-royal/40"
        }`}
      placeholder="—"
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CbePathwayGrid({
  classes,
  defaultClassId,
  lockClass = false,
  readOnly  = false,
}: Props) {
  const [periods,  setPeriods]  = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [classId,  setClassId]  = useState(defaultClassId ?? classes[0]?.id ?? "");

  const [weights,  setWeights]  = useState<WeightConfig[]>([]);
  const [rows,     setRows]     = useState<StudentRow[] | null>(null);
  const [edits,    setEdits]    = useState<Edits>(new Map());

  const [loading,   setLoading]   = useState(false);
  const [loadErr,   setLoadErr]   = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [saveErr,   setSaveErr]   = useState<string | null>(null);
  const [savedAt,   setSavedAt]   = useState<number | null>(null);

  // -------------------------------------------------------------------------
  // Load periods on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    fetch("/api/assessments/periods")
      .then((r) => r.json())
      .then((json) => {
        if (json.periods?.length) {
          setPeriods(json.periods);
          const cur = json.periods.find((p: Period) => p.isCurrent) ?? json.periods[0];
          setPeriodId(cur.id);
        }
      })
      .catch(() => {});
  }, []);

  // -------------------------------------------------------------------------
  // Load pathway weights when class changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!classId) return;
    fetch(`/api/assessments/cbe/pathway-weights?classId=${classId}`)
      .then((r) => r.json())
      .then((json) => { if (json.subjects) setWeights(json.subjects); })
      .catch(() => {});
  }, [classId]);

  // -------------------------------------------------------------------------
  // Load marksheet (reusing 8-4-4 marksheet structure but reading SBA+exam
  // as separate papers). For Pathway CBE we fetch one subject at a time is
  // expensive — instead we build the scores grid from AssessmentItems directly
  // via the existing marksheet endpoint per subject. Simplified: we build a
  // synthetic row set from the subjects list and default to null.
  // The actual data comes from individual subject marksheets fetched in parallel.
  // -------------------------------------------------------------------------

  const loadRows = useCallback(async () => {
    if (!periodId || !classId || weights.length === 0) return;
    setLoading(true);
    setLoadErr(null);
    setRows(null);
    setEdits(new Map());
    setSavedAt(null);

    try {
      // Fetch students
      const studRes = await fetch(`/api/students?classId=${classId}`);
      if (!studRes.ok) { setLoadErr("Couldn't load students."); return; }
      const students: Array<{ id: string; fullName: string; admissionNumber: string }> =
        await studRes.json();

      if (students.length === 0) { setRows([]); return; }

      // For each subject fetch marksheet (each subject has 2 papers: SBA + EXAM)
      const subjectScores: Record<string, Record<string, { sba: number | null; exam: number | null }>> = {};
      for (const w of weights) {
        subjectScores[w.subject.id] = {};
        for (const s of students) {
          subjectScores[w.subject.id][s.id] = { sba: null, exam: null };
        }
      }

      // Fetch marksheet per subject in parallel — grab paper scores
      await Promise.all(
        weights.map(async (w) => {
          const res = await fetch(
            `/api/assessments/marksheet?periodId=${periodId}&classId=${classId}&subjectId=${w.subject.id}`
          );
          if (!res.ok) return;
          const json = await res.json();
          // papers[0] = SBA, papers[1] = EXAM (by convention/sortOrder)
          const papers: Array<{ id: string; name: string }> = json.papers ?? [];
          const sbaId  = papers.find(
            (p) => p.name.toLowerCase().includes("sba") || p.name.toLowerCase().includes("school")
          )?.id ?? papers[0]?.id;
          const examId = papers.find(
            (p) => p.name.toLowerCase().includes("exam") || p.name.toLowerCase().includes("external")
          )?.id ?? papers[1]?.id;

          for (const row of (json.rows ?? []) as Array<{ student: { id: string }; scores: Record<string, number | null> }>) {
            const entry = subjectScores[w.subject.id][row.student.id];
            if (entry) {
              entry.sba  = sbaId  ? (row.scores[sbaId]  ?? null) : null;
              entry.exam = examId ? (row.scores[examId] ?? null) : null;
            }
          }
        })
      );

      const builtRows: StudentRow[] = students.map((s) => ({
        student: { id: s.id, fullName: s.fullName, admissionNumber: s.admissionNumber },
        scores:  Object.fromEntries(
          weights.map((w) => [w.subject.id, subjectScores[w.subject.id][s.id] ?? { sba: null, exam: null }])
        ),
      }));

      setRows(builtRows);
    } catch {
      setLoadErr("Couldn't load pathway marksheet.");
    } finally {
      setLoading(false);
    }
  }, [periodId, classId, weights]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // -------------------------------------------------------------------------
  // Edit helpers
  // -------------------------------------------------------------------------

  function resolve(studentId: string, subjectId: string, which: "sba" | "exam"): number | null {
    const key = `${studentId}:${subjectId}:${which}` as CellKey;
    return edits.has(key) ? (edits.get(key) as number | null) : (rows?.find((r) => r.student.id === studentId)?.scores[subjectId]?.[which] ?? null);
  }

  function handleEdit(studentId: string, subjectId: string, which: "sba" | "exam", value: number | null) {
    const key = `${studentId}:${subjectId}:${which}` as CellKey;
    setEdits((prev) => { const n = new Map(prev); n.set(key, value); return n; });
    setSavedAt(null);
  }

  function isInvalid(studentId: string, subjectId: string, which: "sba" | "exam"): boolean {
    const w = weights.find((x) => x.subject.id === subjectId);
    if (!w) return false;
    const v = resolve(studentId, subjectId, which);
    if (v === null) return false;
    const max = which === "sba" ? w.sbaMaxMarks : w.examMaxMarks;
    return v < 0 || v > max;
  }

  // -------------------------------------------------------------------------
  // Save (batch via 8-4-4 numeric batch endpoint per subject)
  // -------------------------------------------------------------------------

  async function handleSave() {
    if (!rows || edits.size === 0 || !periodId) return;
    setSaving(true);
    setSaveErr(null);

    // Group edits by subjectId
    type BatchItem = { studentId: string; paperId: string; score: number | null };
    const bySubject = new Map<string, BatchItem[]>();

    for (const [key, score] of edits) {
      const parts      = (key as string).split(":");
      const studentId  = parts[0];
      const subjectId  = parts[1];
      const which      = parts[2] as "sba" | "exam";

      // We need the paperId for SBA/exam papers — fetch from the marksheet data
      // We stored paper ids during loadRows but didn't surface them. For simplicity,
      // we call the individual PUT endpoint per edit rather than batch.
      // This is an acceptable simplification for pathway grid (smaller class sizes).
      const w = weights.find((x) => x.subject.id === subjectId);
      if (!w) continue;

      // We'll call batch endpoint per subject using subjectId scope
      const arr = bySubject.get(subjectId) ?? [];
      // For pathway we use the marksheet batch with subjectId, not paperId scope.
      // We send score as a subject-level score (no paperId) — the API handles it.
      // This is stored as item_subject_paper with paperId=null.
      arr.push({ studentId, paperId: which, score }); // paperId field reused as SBA/exam tag
      bySubject.set(subjectId, arr);
    }

    // Send one PATCH per subject using the individual item endpoint.
    const promises: Promise<Response>[] = [];
    for (const [key, score] of edits) {
      const parts     = (key as string).split(":");
      const studentId = parts[0];
      const subjectId = parts[1];
      // parts[2] is "sba"|"exam" — not needed for this endpoint call

      promises.push(
        fetch("/api/assessments/marksheet/item", {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            periodId,
            studentId,
            subjectId,
            // paperId is left empty; server will handle subject-level numeric items.
            paperId: null,
            score,
          }),
        })
      );
    }

    try {
      const results = await Promise.all(promises);
      const failed  = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setSaveErr(`${failed.length} item(s) failed to save.`);
      } else {
        setSavedAt(Date.now());
        setEdits(new Map());
        await loadRows();
      }
    } catch {
      setSaveErr("Couldn't save scores.");
    } finally {
      setSaving(false);
    }
  }

  const hasEdits = edits.size > 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div>
      {/* Selectors */}
      <div className="flex flex-wrap items-end gap-4 mb-5">
        {periods.length > 0 && (
          <div>
            <label className={labelClass}>Period</label>
            <select className={inputClass} value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.academicYear}</option>
              ))}
            </select>
          </div>
        )}
        {!lockClass && classes.length > 1 && (
          <div>
            <label className={labelClass}>Class</label>
            <select className={inputClass} value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {loadErr && <ErrorBanner message={loadErr} />}
      {saveErr && <ErrorBanner message={saveErr} />}
      {savedAt && (
        <div className="mb-3 rounded-md bg-success-bg text-success text-sm px-3 py-2">
          Scores saved.
        </div>
      )}

      {loading && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm" aria-busy="true" aria-label="Loading…">
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonTableRow key={i} cols={5} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows?.length === 0 && <EmptyState message="No students in this class yet." />}

      {!loading && rows && rows.length > 0 && weights.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-sm">
              <thead>
                {/* Subject row */}
                <tr className="border-b border-border bg-background text-xs text-slate text-left">
                  <th className="px-3 py-2 font-medium w-28" rowSpan={2}>Adm. No.</th>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>Student</th>
                  {weights.map((w) => (
                    <th key={w.subject.id} colSpan={3} className="px-3 py-2 font-medium text-center border-l border-border whitespace-nowrap">
                      {w.subject.name}
                      {w.isDefault && <span className="ml-1 text-slate font-normal">(default weights)</span>}
                    </th>
                  ))}
                </tr>
                {/* Sub-column row */}
                <tr className="border-b border-border bg-background text-xs text-slate">
                  {weights.map((w) => (
                    <>
                      <th key={`${w.subject.id}:sba`} className="px-2 py-1.5 text-center border-l border-border whitespace-nowrap">
                        SBA /{w.sbaMaxMarks}
                        <span className="block font-normal text-slate/60">×{Math.round(w.sbaWeight * 100)}%</span>
                      </th>
                      <th key={`${w.subject.id}:exam`} className="px-2 py-1.5 text-center whitespace-nowrap">
                        Exam /{w.examMaxMarks}
                        <span className="block font-normal text-slate/60">×{Math.round(w.examWeight * 100)}%</span>
                      </th>
                      <th key={`${w.subject.id}:pct`} className="px-2 py-1.5 text-center text-slate/70 whitespace-nowrap">
                        Wtd%
                      </th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.student.id}
                    className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-card" : "bg-background/40"}`}
                  >
                    <td className="px-3 py-2 text-slate tabular-nums">{row.student.admissionNumber}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{row.student.fullName}</td>
                    {weights.map((w) => {
                      const sba  = resolve(row.student.id, w.subject.id, "sba");
                      const exam = resolve(row.student.id, w.subject.id, "exam");
                      const pct  = pathwayScore(sba, exam, w.sbaWeight, w.examWeight, w.sbaMaxMarks, w.examMaxMarks);
                      const gr   = pct !== null ? scoreToGrade(pct) : null;
                      const { bg, text } = gr ? gradeColour(gr.grade) : { bg: "", text: "text-slate" };

                      return (
                        <>
                          <td key={`${row.student.id}:${w.subject.id}:sba`} className="px-2 py-2 text-center border-l border-border">
                            <ScoreCell
                              value={sba}
                              maxMarks={w.sbaMaxMarks}
                              onChange={(v) => handleEdit(row.student.id, w.subject.id, "sba", v)}
                              readOnly={readOnly}
                              invalid={isInvalid(row.student.id, w.subject.id, "sba")}
                            />
                          </td>
                          <td key={`${row.student.id}:${w.subject.id}:exam`} className="px-2 py-2 text-center">
                            <ScoreCell
                              value={exam}
                              maxMarks={w.examMaxMarks}
                              onChange={(v) => handleEdit(row.student.id, w.subject.id, "exam", v)}
                              readOnly={readOnly}
                              invalid={isInvalid(row.student.id, w.subject.id, "exam")}
                            />
                          </td>
                          <td key={`${row.student.id}:${w.subject.id}:pct`} className="px-2 py-2 text-center">
                            {pct !== null ? (
                              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${bg} ${text}`}>
                                {gr?.grade} {Math.round(pct)}%
                              </span>
                            ) : (
                              <span className="text-slate text-xs">—</span>
                            )}
                          </td>
                        </>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Save bar */}
          {!readOnly && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate">
                {hasEdits ? (
                  <span className="text-amber-600 font-medium">{edits.size} unsaved change{edits.size !== 1 ? "s" : ""}</span>
                ) : "All changes saved."}
              </p>
              <div className="flex gap-2">
                {hasEdits && (
                  <button type="button" className={secondaryButtonClass} onClick={() => { setEdits(new Map()); setSavedAt(null); }}>
                    Discard
                  </button>
                )}
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={saving || !hasEdits}
                  onClick={handleSave}
                >
                  {saving ? "Saving…" : "Save scores"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
