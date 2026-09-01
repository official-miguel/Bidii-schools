"use client";

/**
 * TimetableGenerate — shared timetable generation content.
 *
 * Accepts a `basePath` prop so it can be rendered under both
 * /principal/timetable and /staff/timetable with correct nav links.
 *
 * The ContextNavigation bar is NOT rendered here — the parent page
 * is responsible for rendering it.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Zap, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw,
  Upload, Trash2, ChevronDown, ChevronUp, Info, Shield,
  ClipboardList, ArrowRight, ExternalLink, Users, XCircle,
} from "lucide-react";
import { PageHeader, ErrorBanner, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────
type SchoolClass = { id: string; name: string; form: number };

type PreCheckIssue = {
  type: string; severity: "BLOCKING" | "WARNING" | "INFO";
  message: string; suggestedAction?: string; requiresApproval?: boolean;
  affectedClasses?: string[];
};

type PreCheckResult = {
  canProceed: boolean; requiresApproval: boolean;
  issues: PreCheckIssue[];
  summary: { blockingIssues: number; warnings: number; approvalsNeeded: number };
  config?: { classCount: number; subjectCount: number; totalLessonsRequired: number; lessonSlotsPerWeek: number };
};

type ValidationIssue = {
  rule: string;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
  affectedClasses?: string[];
  affectedTeachers?: string[];
  affectedSubjects?: string[];
};

type StaffShortage = {
  subjectCode: string;
  subjectName: string;
  totalLessonsRequired: number;
  totalLessonsCapacity: number;
  deficit: number;
  assignedTeachers: number;
  estimatedExtraTeachersNeeded: number;
  affectedClasses: string[];
  level: "critical" | "high" | "moderate";
  message: string;
  suggestion: string;
};

type GenerationResult = {
  success: boolean; versionId?: string; attempts: number;
  stats?: { totalLessonsScheduled: number; totalLessonsRequired: number; completionRate: number };
  validation?: {
    valid: boolean;
    failedRules: string[];
    issues?: ValidationIssue[];
    summary: { errors: number; warnings: number };
  };
  warnings?: string[];
  staffShortages?: StaffShortage[];
  skippedNoTeacher?: string[];
  error?: string; history?: Array<{ attempt: number; errors: number; warnings: number }>;
};

// ── Props ──────────────────────────────────────────────────────────────────
interface TimetableGenerateProps {
  basePath: string;
}

// ── Issue → fix URL mapping ────────────────────────────────────────────────
function fixUrl(issue: PreCheckIssue, basePath: string): string | null {
  switch (issue.type) {
    case "MISSING_TEACHER_ASSIGNMENT": {
      const classId = issue.affectedClasses?.[0];
      return classId
        ? `/principal/class-profiles/${encodeURIComponent(classId)}`
        : "/principal/class-profiles";
    }
    case "EMPTY_SLOTS": {
      const classId = issue.affectedClasses?.[0];
      return classId
        ? `${basePath}/requirements?classId=${encodeURIComponent(classId)}`
        : `${basePath}/requirements`;
    }
    case "INSUFFICIENT_CAPACITY":
      return `${basePath}/requirements`;
    case "STREAM_IMBALANCE":
    case "NO_STUDENTS_IN_SUBJECT":
      return "/principal/students";
    case "CONFIGURATION_ERROR":
      return `${basePath}/template`;
    default:
      return null;
  }
}

function fixLabel(type: string): string {
  switch (type) {
    case "MISSING_TEACHER_ASSIGNMENT": return "Open class profile";
    case "EMPTY_SLOTS":                return "Edit requirements";
    case "INSUFFICIENT_CAPACITY":      return "Edit requirements";
    case "STREAM_IMBALANCE":           return "Review student selections";
    case "NO_STUDENTS_IN_SUBJECT":     return "Review students";
    case "CONFIGURATION_ERROR":        return "Open template";
    default:                           return "Fix";
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function IssueRow({
  issue, basePath, onNavigate,
}: {
  issue: PreCheckIssue; basePath: string; onNavigate: (url: string) => void;
}) {
  const bg = issue.severity === "BLOCKING"
    ? "bg-danger/5 border-danger/20"
    : issue.severity === "WARNING"
      ? "bg-warn-bg border-warn/20"
      : "bg-paper border-line";
  const icon = issue.severity === "BLOCKING"
    ? <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
    : issue.severity === "WARNING"
      ? <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" />
      : <Info className="h-4 w-4 text-slate shrink-0 mt-0.5" />;

  const url   = fixUrl(issue, basePath);
  const label = fixLabel(issue.type);

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${bg}`}>
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink">{issue.message}</p>
        {issue.suggestedAction && (
          <p className="text-xs text-slate mt-1 leading-snug">{issue.suggestedAction}</p>
        )}
      </div>
      {url && (
        <button
          type="button"
          onClick={() => onNavigate(url)}
          title={label}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                     text-xs font-medium border transition-colors
                     bg-white border-line text-teal hover:bg-teal hover:text-white hover:border-teal"
        >
          {label}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function TimetableGenerate({ basePath }: TimetableGenerateProps) {
  const router = useRouter();

  const [classes,      setClasses]      = useState<SchoolClass[]>([]);
  const [scopeAll,     setScopeAll]     = useState(true);
  const [selClassIds,  setSelClassIds]  = useState<Set<string>>(new Set());
  const [draftName,    setDraftName]    = useState("");
  const [maxAttempts,  setMaxAttempts]  = useState(10);

  const [preCheck,     setPreCheck]     = useState<PreCheckResult | null>(null);
  const [checking,     setChecking]     = useState(false);
  const [generating,   setGenerating]   = useState(false);
  const [result,       setResult]       = useState<GenerationResult | null>(null);
  const [publishing,   setPublishing]   = useState(false);
  const [published,    setPublished]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [showAttempts, setShowAttempts] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/classes");
    const data = await res.json().catch(() => ({}));
    const cls: SchoolClass[] = (data?.classes ?? data ?? []);
    cls.sort((a, b) => a.form - b.form || a.name.localeCompare(b.name));
    setClasses(cls);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!draftName)
      setDraftName(`Draft ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`);
  }, [draftName]);

  const forms = useMemo(() => [...new Set(classes.map((c) => c.form))].sort((a, b) => a - b), [classes]);

  function toggleClass(id: string) {
    setSelClassIds((p) => { const n = new Set(p); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });
  }
  function toggleForm(form: number) {
    const ids = classes.filter((c) => c.form === form).map((c) => c.id);
    const all = ids.every((id) => selClassIds.has(id));
    setSelClassIds((p) => { const n = new Set(p); ids.forEach((id) => { if (all) { n.delete(id); } else { n.add(id); } }); return n; });
  }

  async function handlePreCheck() {
    setChecking(true); setError(null); setPreCheck(null); setResult(null);
    try {
      const body: Record<string, unknown> = {};
      if (!scopeAll && selClassIds.size > 0) body.classIds = [...selClassIds];
      const res = await fetch("/api/timetable/v2/pre-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Pre-check failed"); return; }
      setPreCheck(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true); setError(null); setResult(null); setPublished(false);
    try {
      const body: Record<string, unknown> = {
        name: draftName || "Generated draft",
        maxAttempts,
        bypassPreChecks: preCheck?.canProceed ?? false,
      };
      if (!scopeAll && selClassIds.size > 0) body.classIds = [...selClassIds];
      const res = await fetch("/api/timetable/v2/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generation failed");
        if (data.validation) setResult({ success: false, attempts: data.attempts ?? 0, ...data });
        return;
      }
      setResult({ success: true, ...data });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish() {
    if (!result?.versionId) return;
    setPublishing(true); setError(null);
    try {
      const res = await fetch(`/api/timetable/v2/versions/${result.versionId}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not publish"); return; }
      setPublished(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  async function handleDiscard() {
    if (result?.versionId) {
      await fetch(`/api/timetable/v2/versions/${result.versionId}`, { method: "DELETE" }).catch(() => {});
    }
    setResult(null); setPreCheck(null); setError(null); setPublished(false);
  }

  const blockingCount = preCheck?.summary.blockingIssues ?? 0;
  const warningCount  = preCheck?.summary.warnings ?? 0;
  const canGenerate   = preCheck?.canProceed && !preCheck?.requiresApproval;

  return (
    <div>
      <PageHeader
        title="Timetable"
        description="Run the constraint solver to generate a complete timetable for all classes."
      />

      <div className="space-y-5">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* ── Published success ─────────────────────────────────────────── */}
        {published && (
          <div className="rounded-xl border border-success/20 bg-success-bg p-5 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
            <div>
              <p className="text-sm font-semibold text-ink">Timetable published.</p>
              <p className="text-xs text-slate mt-0.5">All teachers can now view their schedules.</p>
            </div>
          </div>
        )}

        {/* ── STEP 1: Scope + pre-check ─────────────────────────────────── */}
        {!result && (
          <div className="bg-white border border-line rounded-xl p-5 space-y-5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-teal text-white text-xs font-bold flex items-center justify-center shrink-0">1</div>
              <h2 className="text-sm font-semibold text-ink">Scope &amp; readiness check</h2>
            </div>

            {/* Draft name */}
            <div className="max-w-sm">
              <label className={labelClass}>Draft name</label>
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className={inputClass} />
            </div>

            {/* Scope */}
            <div>
              <label className={labelClass}>Which classes to schedule</label>
              <div className="flex gap-2 mt-1">
                {(["all", "subset"] as const).map((opt) => (
                  <button key={opt} type="button" onClick={() => setScopeAll(opt === "all")}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors
                      ${(opt === "all") === scopeAll
                        ? "bg-teal text-white border-teal"
                        : "bg-white text-slate border-line hover:border-teal/40"}`}>
                    {opt === "all" ? "All classes" : "Select classes"}
                  </button>
                ))}
              </div>
            </div>

            {!scopeAll && (
              <div className="space-y-3">
                {forms.map((form) => (
                  <div key={form}>
                    <button type="button" onClick={() => toggleForm(form)}
                      className="text-xs font-semibold text-slate uppercase tracking-wide mb-1.5 hover:text-teal transition-colors">
                      Form {form} — select all
                    </button>
                    <div className="flex flex-wrap gap-2">
                      {classes.filter((c) => c.form === form).map((c) => (
                        <button key={c.id} type="button" onClick={() => toggleClass(c.id)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors
                            ${selClassIds.has(c.id) ? "bg-teal text-white border-teal" : "bg-white text-slate border-line hover:border-teal/40"}`}>
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pre-check result */}
            {preCheck && (
              <div className={`rounded-xl border p-4 space-y-3
                ${blockingCount > 0 ? "bg-danger/4 border-danger/20"
                  : warningCount > 0 ? "bg-warn-bg border-warn/20"
                  : "bg-success-bg border-success/20"}`}>
                <div className="flex items-center gap-2">
                  {blockingCount > 0
                    ? <AlertCircle className="h-4 w-4 text-danger" />
                    : warningCount > 0
                      ? <AlertTriangle className="h-4 w-4 text-warn" />
                      : <CheckCircle2 className="h-4 w-4 text-success" />
                  }
                  <p className="text-sm font-semibold text-ink">
                    {blockingCount > 0
                      ? `${blockingCount} blocking issue${blockingCount !== 1 ? "s" : ""} — fix before generating`
                      : warningCount > 0
                        ? `Ready with ${warningCount} warning${warningCount !== 1 ? "s" : ""}`
                        : "Ready to generate"}
                  </p>
                  {preCheck.config && (
                    <span className="ml-auto text-xs text-slate">
                      {preCheck.config.classCount} classes · {preCheck.config.subjectCount} subjects ·{" "}
                      {preCheck.config.totalLessonsRequired} lessons/week required
                    </span>
                  )}
                </div>
                {preCheck.issues.length > 0 && (
                  <div className="space-y-2">
                    {preCheck.issues.map((issue, i) => (
                      <IssueRow key={i} issue={issue} basePath={basePath} onNavigate={(url) => router.push(url)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handlePreCheck} disabled={checking}
                className={secondaryButtonClass}>
                {checking
                  ? <><RefreshCw className="h-4 w-4 animate-spin" />Checking…</>
                  : <><ClipboardList className="h-4 w-4" />Run readiness check</>}
              </button>
              <button type="button" onClick={handleGenerate}
                disabled={generating || (preCheck !== null && !canGenerate)}
                className={primaryButtonClass}>
                {generating
                  ? <><RefreshCw className="h-4 w-4 animate-spin" />Generating…</>
                  : <><Zap className="h-4 w-4" />{preCheck ? "Generate timetable" : "Check & generate"}</>}
              </button>
              <button type="button" onClick={() => setShowAttempts((o) => !o)}
                className="text-xs text-slate hover:text-teal transition-colors ml-auto self-center">
                {showAttempts ? "Hide options" : "Options"}
              </button>
            </div>

            {showAttempts && (
              <div className="pt-2 border-t border-line">
                <label className={`${labelClass} max-w-xs`}>
                  Max generation attempts (1–20)
                  <input type="number" min={1} max={20} value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value))}
                    className={`${inputClass} mt-1.5`} />
                </label>
                <p className="text-xs text-slate mt-1">
                  The engine regenerates automatically until all constraints pass, up to this many attempts.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Generating progress ───────────────────────────────── */}
        {generating && (
          <div className="bg-white border border-line rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-4 w-4 text-teal animate-spin shrink-0" />
              <p className="text-sm font-medium text-ink">Solving constraints… this may take a moment.</p>
            </div>
            <p className="text-xs text-slate">
              The engine places every lesson without double-booking any teacher or class, respects
              your session preferences, and re-tries automatically if a validation check fails.
            </p>
            <div className="w-full bg-line rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-teal rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
          </div>
        )}

        {/* ── STEP 3: Result ────────────────────────────────────────────── */}
        {result && !generating && (
          <div className="space-y-4">
            {/* Summary card */}
            <div className="bg-white border border-line rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0
                  ${result.success ? "bg-success-bg" : "bg-danger/10"}`}>
                  {result.success
                    ? <CheckCircle2 className="h-6 w-6 text-success" />
                    : <AlertCircle className="h-6 w-6 text-danger" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {result.success ? "Timetable generated successfully" : "Generation failed after all attempts"}
                  </p>
                  {result.stats && (
                    <div className="flex flex-wrap gap-4 text-xs text-slate mt-1.5">
                      <span>
                        <span className="font-semibold text-ink">{result.stats.totalLessonsScheduled}</span>
                        {" "}of{" "}
                        <span className="font-semibold text-ink">{result.stats.totalLessonsRequired}</span>
                        {" "}lessons scheduled
                      </span>
                      <span className={result.stats.completionRate === 100 ? "text-success font-semibold" : "text-warn font-semibold"}>
                        {result.stats.completionRate.toFixed(1)}% complete
                      </span>
                      <span>
                        {result.attempts} attempt{result.attempts !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                  {result.validation?.valid && (
                    <div className="flex items-center gap-2 mt-2">
                      <Shield className="h-3.5 w-3.5 text-slate" />
                      <span className="text-xs text-success font-medium">All constraints satisfied</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <button type="button" onClick={handleDiscard}
                    className={`${secondaryButtonClass} text-xs`}>
                    <Trash2 className="h-3.5 w-3.5" />Discard
                  </button>
                  {result.success && result.versionId && (
                    <button
                      type="button"
                      onClick={() => router.push(`${basePath}/builder?versionId=${result.versionId}`)}
                      className={`${secondaryButtonClass} text-xs`}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />Open in Builder
                    </button>
                  )}
                  {result.success && !published && (
                    <button type="button" onClick={handlePublish} disabled={publishing}
                      className={`${primaryButtonClass} text-xs`}>
                      {publishing
                        ? <><RefreshCw className="h-4 w-4 animate-spin" />Publishing…</>
                        : <><Upload className="h-4 w-4" />Publish</>}
                    </button>
                  )}
                  {published && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-success-bg text-success border border-success/20">
                      <CheckCircle2 className="h-3.5 w-3.5" />Published
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Warnings */}
            {result.warnings && result.warnings.length > 0 && (
              <Collapsible title="Warnings" badge={result.warnings.length} badgeColor="warn">
                <div className="space-y-2">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-ink flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-warn shrink-0 mt-0.5" />{w}
                    </p>
                  ))}
                </div>
              </Collapsible>
            )}

            {/* Teacher shortages — subjects with not enough teacher capacity */}
            {result.staffShortages && result.staffShortages.length > 0 && (
              <Collapsible
                title="Teacher shortages"
                badge={result.staffShortages.length}
                badgeColor="danger"
                defaultOpen
              >
                <div className="space-y-3">
                  <p className="text-xs text-slate leading-relaxed">
                    The following subjects do not have enough teacher capacity to cover all required lessons.
                    Assign additional teachers to fill the gap.
                  </p>
                  {result.staffShortages.map((s, i) => {
                    const levelColor =
                      s.level === "critical" ? "border-danger/30 bg-danger/5" :
                      s.level === "high" ? "border-warn/30 bg-warn/5" :
                      "border-line bg-paper";
                    const levelBadge =
                      s.level === "critical" ? "bg-danger/10 text-danger" :
                      s.level === "high" ? "bg-warn/10 text-warn" :
                      "bg-line text-slate";
                    return (
                      <div key={i} className={`rounded-lg border p-3 ${levelColor}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Users className="h-3.5 w-3.5 text-slate shrink-0" />
                          <span className="text-xs font-semibold text-ink">{s.subjectCode} — {s.subjectName}</span>
                          <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${levelBadge}`}>
                            {s.level}
                          </span>
                        </div>
                        <p className="text-xs text-ink ml-5 mb-1">{s.message}</p>
                        <div className="ml-5 flex flex-wrap gap-3 text-xs text-slate">
                          <span>Required: <strong className="text-ink">{s.totalLessonsRequired}</strong> lessons/week</span>
                          <span>Capacity: <strong className="text-ink">{s.totalLessonsCapacity}</strong> lessons/week</span>
                          <span>Shortfall: <strong className="text-danger">{s.deficit}</strong> lessons</span>
                          <span>Assigned teachers: <strong className="text-ink">{s.assignedTeachers}</strong></span>
                          <span>Extra needed: <strong className="text-danger">{s.estimatedExtraTeachersNeeded}</strong></span>
                        </div>
                        {s.affectedClasses.length > 0 && (
                          <p className="text-xs text-slate ml-5 mt-1">
                            Affects: {s.affectedClasses.slice(0, 6).join(", ")}
                            {s.affectedClasses.length > 6 && ` +${s.affectedClasses.length - 6} more`}
                          </p>
                        )}
                        <p className="text-xs text-slate ml-5 mt-1 italic">{s.suggestion}</p>
                      </div>
                    );
                  })}
                </div>
              </Collapsible>
            )}

            {/* Subjects skipped because no teacher is assigned at all */}
            {result.skippedNoTeacher && result.skippedNoTeacher.length > 0 && (
              <Collapsible
                title="Subjects not scheduled — no teacher assigned"
                badge={result.skippedNoTeacher.length}
                badgeColor="danger"
                defaultOpen
              >
                <div className="space-y-2">
                  <p className="text-xs text-slate leading-relaxed">
                    These subject–class combinations were completely excluded from the timetable
                    because no teacher is assigned to them. Assign a teacher in the class profile
                    or subject teachers page, then regenerate.
                  </p>
                  {result.skippedNoTeacher.map((line, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-ink">
                      <XCircle className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </Collapsible>
            )}

            {/* Attempt history */}
            {result.history && result.history.length > 1 && (
              <Collapsible title={`Attempt history (${result.history.length} attempts)`} badgeColor="slate">
                <div className="space-y-1.5">
                  {result.history.map((h) => (
                    <div key={h.attempt} className="flex items-center gap-3 text-xs text-slate">
                      <span className="w-16 shrink-0">Attempt {h.attempt}</span>
                      {h.errors === 0
                        ? <span className="text-success font-medium">✓ Passed</span>
                        : <span className="text-danger">{h.errors} error{h.errors !== 1 ? "s" : ""}</span>}
                      {h.warnings > 0 && <span className="text-warn">{h.warnings} warning{h.warnings !== 1 ? "s" : ""}</span>}
                    </div>
                  ))}
                </div>
              </Collapsible>
            )}

            {/* Constraint violations - COMPLETE_LESSON_COUNT is excluded because
                missed lessons are already listed individually in the Warnings section
                above (as engine shortfall messages). Showing them again here would
                be repetitive. */}
            {(() => {
              const otherFailedRules = result.validation?.failedRules?.filter(
                (r) => r !== "COMPLETE_LESSON_COUNT"
              ) ?? [];
              if (otherFailedRules.length === 0) return null;
              return (
              <Collapsible title="Constraint violations" badge={otherFailedRules.length} badgeColor="danger" defaultOpen>
                <div className="space-y-4">
                  {otherFailedRules.map((rule) => {
                    const ruleIssues = result.validation?.issues?.filter(
                      (i) => i.rule === rule && i.severity === "ERROR"
                    ) ?? [];
                    return (
                      <div key={rule}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <AlertCircle className="h-3.5 w-3.5 text-danger shrink-0" />
                          <span className="text-xs font-semibold text-danger uppercase tracking-wide">
                            {rule.replace(/_/g, " ")}
                          </span>
                          {ruleIssues.length > 0 && (
                            <span className="text-xs text-slate ml-auto">{ruleIssues.length} issue{ruleIssues.length !== 1 ? "s" : ""}</span>
                          )}
                        </div>
                        {ruleIssues.length > 0 ? (
                          <ul className="ml-5 space-y-1">
                            {ruleIssues.slice(0, 20).map((issue, idx) => (
                              <li key={idx} className="text-xs text-ink leading-relaxed">
                                {issue.message}
                              </li>
                            ))}
                            {ruleIssues.length > 20 && (
                              <li className="text-xs text-slate italic">
                                … and {ruleIssues.length - 20} more
                              </li>
                            )}
                          </ul>
                        ) : (
                          <p className="ml-5 text-xs text-slate italic">No detail available</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Collapsible>
              );
            })()}

            {/* Next steps */}
            {result.success && !published && result.versionId && (
              <div className="rounded-xl border border-teal/20 bg-teal-50 p-4 flex items-center gap-3">
                <Info className="h-4 w-4 text-teal shrink-0 mt-0.5" />
                <p className="text-xs text-ink leading-relaxed flex-1">
                  The draft is saved. Open it in the Builder to review, fine-tune manually, then publish when ready.
                </p>
                <button
                  type="button"
                  onClick={() => router.push(`${basePath}/builder?versionId=${result.versionId}`)}
                  className={`${primaryButtonClass} text-xs shrink-0`}
                >
                  <ArrowRight className="h-3.5 w-3.5" />Open in Builder
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Collapsible helper ─────────────────────────────────────────────────────
function Collapsible({
  title, badge, badgeColor = "slate", defaultOpen = false, children,
}: {
  title: string; badge?: number; badgeColor?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const colors: Record<string, string> = {
    danger: "bg-danger/10 text-danger", warn: "bg-warn/10 text-warn",
    success: "bg-success/10 text-success", slate: "bg-line text-slate",
  };
  return (
    <div className="bg-white border border-line rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-paper transition-colors">
        <span className="text-sm font-semibold text-ink flex-1">{title}</span>
        {badge !== undefined && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[badgeColor] ?? colors.slate}`}>{badge}</span>
        )}
        {open ? <ChevronUp className="h-4 w-4 text-slate" /> : <ChevronDown className="h-4 w-4 text-slate" />}
      </button>
      {open && <div className="border-t border-line px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}
