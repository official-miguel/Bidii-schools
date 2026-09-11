"use client";

/**
 * ClassPromotionSection
 *
 * The full promotion settings UI, rendered inside the Principal Settings page.
 * Split into three sub-panels:
 *
 *  1. Stage Migration Review  — fix legacy classes that have no stageName yet
 *  2. Promotion Mapping       — set promotesToClassId / confirmedTerminal per class
 *  3. Run Year Promotion      — preview + atomic run
 *
 * Panels are shown as collapsible sections so the principal can focus on what
 * they need without scrolling past completed steps.
 */

import {
  useState,
  useEffect,
  useCallback,
  Fragment,
} from "react";
import Modal from "@/components/Modal";
import {
  ErrorBanner,
  SuccessBanner,
  labelClass,
  inputClass,
  secondaryButtonClass,
  royalButtonClass,
} from "@/components/ui";
import { SkeletonTable, SkeletonBar } from "@/components/ui/ProgressivePage";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  ArrowRight,
  Info,
  Loader2,
  Play,
  RefreshCw,
  SkipForward,
  Users,
  Pencil,
  X,
} from "lucide-react";
import { STAGE_CATALOG } from "@/lib/curriculum/stageCatalog";
import type { FrameworkType } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Shared types (mirror the API shapes)
// ─────────────────────────────────────────────────────────────────────────────

interface SchoolClass {
  id: string;
  name: string;
  form: number;
  stageName: string | null;
  streamId: string | null;
  frameworkType: FrameworkType;
  promotesToClassId: string | null;
  confirmedTerminal: boolean;
  resetTeachersOnPromotion: boolean;
  skipStageConfirmed: boolean;
  _count: { students: number };
}

interface Stream {
  id: string;
  name: string;
  _count: { classes: number };
}

type PreviewOutcome = "promote" | "graduate" | "unresolved" | "unconfirmed-skip";

interface PreviewClassRow {
  classId: string;
  className: string;
  stageName: string | null;
  studentCount: number;
  outcome: PreviewOutcome;
  targetClassId: string | null;
  targetClassName: string | null;
}

interface PromotionPreview {
  academicYear: number | null;
  classes: PreviewClassRow[];
  promotedTotal: number;
  graduatedTotal: number;
  unresolvedCount: number;
  canRun: boolean;
  alreadyRunThisYear: boolean;
  alreadyRunAt: string | null;
}

interface MigrationReview {
  unresolvedCount: number;
  classes: {
    id: string;
    name: string;
    form: number;
    frameworkType: FrameworkType;
    stream: string | null;
    autoSuggestion: { name: string; rank: number } | null;
  }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal/30 focus:ring-offset-1 ${
          checked ? "bg-teal" : "bg-line"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">{label}</p>
        {description && (
          <p className="text-xs text-slate mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
    </label>
  );
}

function OutcomeBadge({ outcome }: { outcome: PreviewOutcome }) {
  switch (outcome) {
    case "promote":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-teal/8 text-teal border border-teal/20">
          <ArrowRight className="h-3 w-3" />
          Promote
        </span>
      );
    case "graduate":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-success-bg text-success border border-success/20">
          <GraduationCap className="h-3 w-3" />
          Graduate
        </span>
      );
    case "unresolved":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-danger-bg text-danger border border-danger/20">
          <AlertCircle className="h-3 w-3" />
          Unresolved
        </span>
      );
    case "unconfirmed-skip":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40">
          <SkipForward className="h-3 w-3" />
          Confirm skip
        </span>
      );
  }
}

function CollapsiblePanel({
  title,
  badge,
  badgeVariant = "neutral",
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: string;
  badgeVariant?: "neutral" | "warning" | "danger" | "success";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const variantClass = {
    neutral: "bg-line/60 text-slate border border-border",
    warning: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40",
    danger:  "bg-danger-bg text-danger border border-danger/20",
    success: "bg-success-bg text-success border border-success/20",
  }[badgeVariant];

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left bg-background hover:bg-card transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate shrink-0" />
        )}
        <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
        {badge && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${variantClass}`}>
            {badge}
          </span>
        )}
      </button>
      {open && <div className="px-5 py-5 border-t border-border bg-card">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel 1 — Stage Migration Review
// ─────────────────────────────────────────────────────────────────────────────

function StageMigrationPanel() {
  const [data, setData]       = useState<MigrationReview | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  // Map: classId → selected stageName draft
  const [drafts, setDrafts]   = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/classes/stage-migration-review");
    if (!res.ok) { setError("Failed to load."); return; }
    const json: MigrationReview = await res.json();
    setData(json);
    // Pre-fill drafts with auto suggestions
    const initial: Record<string, string> = {};
    for (const cls of json.classes) {
      if (cls.autoSuggestion) initial[cls.id] = cls.autoSuggestion.name;
    }
    setDrafts(initial);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    const assignments = Object.entries(drafts)
      .filter(([, v]) => v)
      .map(([classId, stageName]) => ({ classId, stageName }));

    if (!assignments.length) return;
    setSaving(true); setError(null);
    const res = await fetch("/api/classes/stage-migration-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    load();
  }

  if (!data && !error) {
    return (
      <div className="space-y-2">
        <SkeletonBar height="1rem" width="60%" />
        <SkeletonTable rows={3} cols={4} />
      </div>
    );
  }

  if (data?.unresolvedCount === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-success font-medium py-2">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        All classes have a confirmed stage name. No action needed.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {saved && <SuccessBanner message="Stage names saved successfully." />}

      <p className="text-sm text-slate leading-relaxed">
        The classes below do not have a canonical stage name yet. Assign one so the
        promotion system can correctly determine ordering and detect skip-stage moves.
        Where possible, a suggestion based on the existing form number is pre-filled.
      </p>

      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-background">
            <tr>
              {["Class", "Framework", "Legacy form #", "Assign stage"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data?.classes ?? []).map((cls) => {
              const stages = STAGE_CATALOG[cls.frameworkType] ?? [];
              return (
                <tr key={cls.id} className="bg-card hover:bg-background/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{cls.name}</td>
                  <td className="px-4 py-3 text-slate text-xs">{cls.frameworkType}</td>
                  <td className="px-4 py-3 text-slate tabular-nums">{cls.form}</td>
                  <td className="px-4 py-3">
                    {stages.length === 0 ? (
                      <span className="text-xs text-slate italic">No catalog for this framework</span>
                    ) : (
                      <select
                        value={drafts[cls.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [cls.id]: e.target.value }))
                        }
                        className={`${inputClass} text-sm py-1.5 max-w-[180px]`}
                      >
                        <option value="">— choose —</option>
                        {stages.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          className={royalButtonClass}
          disabled={saving || !Object.values(drafts).some(Boolean)}
          onClick={handleSave}
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
          ) : (
            "Assign stage names"
          )}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={load}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel 2 — Promotion Mapping (per class)
// ─────────────────────────────────────────────────────────────────────────────

function PromotionMappingRow({
  cls,
  allClasses,
  onUpdate,
}: {
  cls: SchoolClass;
  allClasses: SchoolClass[];
  onUpdate: () => void;
}) {
  const [editing, setEditing]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [showSkipWarning, setShowSkipWarning] = useState(false);

  // Local draft state for the edit form
  const [draftTarget, setDraftTarget]   = useState(cls.promotesToClassId ?? "");
  const [draftTerminal, setDraftTerminal] = useState(cls.confirmedTerminal);
  const [draftReset, setDraftReset]     = useState(cls.resetTeachersOnPromotion);

  // Eligble targets: same framework, not self
  const eligibleTargets = allClasses.filter(
    (c) => c.id !== cls.id && c.frameworkType === cls.frameworkType
  );

  function openEdit() {
    setDraftTarget(cls.promotesToClassId ?? "");
    setDraftTerminal(cls.confirmedTerminal);
    setDraftReset(cls.resetTeachersOnPromotion);
    setError(null);
    setEditing(true);
  }

  // Determine skip-stage status for selected draft target.
  function getDraftSkipStatus(): "ok" | "skip" | "backward" | "no-catalog" | "cross-framework" | null {
    if (!draftTarget || draftTerminal) return null;
    if (!cls.stageName) return "no-catalog";
    const target = allClasses.find((c) => c.id === draftTarget);
    if (!target) return null;
    if (target.frameworkType !== cls.frameworkType) return "cross-framework";
    const catalog = STAGE_CATALOG[cls.frameworkType];
    if (!catalog?.length) return "no-catalog";
    const srcEntry = catalog.find((s) => s.name === cls.stageName);
    const tgtEntry = target.stageName ? catalog.find((s) => s.name === target.stageName) : null;
    if (!srcEntry || !tgtEntry) return "no-catalog";
    if (tgtEntry.rank === srcEntry.rank + 1) return "ok";
    if (tgtEntry.rank <= srcEntry.rank) return "backward";
    return "skip";
  }

  const skipStatus = getDraftSkipStatus();
  const needsSkipConfirm = skipStatus === "skip" || skipStatus === "backward" || skipStatus === "cross-framework";

  async function handleSave(skipConfirmed = false) {
    if (needsSkipConfirm && !skipConfirmed) {
      setShowSkipWarning(true);
      return;
    }
    setSaving(true); setError(null);
    const body: Record<string, unknown> = {};
    if (draftTerminal) {
      body.confirmedTerminal  = true;
      body.promotesToClassId  = null;
      body.skipStageConfirmed = false;
    } else {
      body.promotesToClassId  = draftTarget || null;
      body.confirmedTerminal  = false;
      body.skipStageConfirmed = skipConfirmed ? true : (!needsSkipConfirm ? true : false);
    }
    body.resetTeachersOnPromotion = draftReset;

    const res = await fetch(`/api/classes/${cls.id}/promotion-link`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
    setEditing(false);
    setShowSkipWarning(false);
    onUpdate();
  }

  function getTargetLabel() {
    if (cls.confirmedTerminal) return "Graduates here";
    if (cls.promotesToClassId) {
      const t = allClasses.find((c) => c.id === cls.promotesToClassId);
      return t?.name ?? "Unknown class";
    }
    return null;
  }

  const targetLabel  = getTargetLabel();
  const isUnresolved = !cls.promotesToClassId && !cls.confirmedTerminal;
  const needsConfirm = cls.promotesToClassId && !cls.skipStageConfirmed;

  return (
    <Fragment>
      <tr className="group border-b border-border last:border-0 hover:bg-slate-50/50 transition-colors">
        {/* Class name */}
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-foreground">{cls.name}</p>
          {cls.stageName && (
            <p className="text-xs text-slate/60">{cls.stageName}</p>
          )}
        </td>

        {/* Framework */}
        <td className="px-4 py-3 text-xs text-slate">{cls.frameworkType}</td>

        {/* Students */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 text-sm text-slate">
            <Users className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="tabular-nums">{cls._count.students}</span>
          </div>
        </td>

        {/* Outcome */}
        <td className="px-4 py-3">
          {cls.confirmedTerminal ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-success-bg text-success border border-success/20">
              <GraduationCap className="h-3 w-3" />
              Graduates here
            </span>
          ) : targetLabel ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-teal/8 text-teal border border-teal/20">
                <ArrowRight className="h-3 w-3" />
                {targetLabel}
              </span>
              {needsConfirm && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40">
                  <SkipForward className="h-3 w-3" />
                  Confirm skip
                </span>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-danger-bg text-danger border border-danger/20">
              <AlertCircle className="h-3 w-3" />
              Not configured
            </span>
          )}
        </td>

        {/* Reset toggle display */}
        <td className="px-4 py-3 text-xs text-slate">
          {cls.resetTeachersOnPromotion ? (
            <span className="text-amber-600 font-medium">Reset</span>
          ) : (
            <span className="text-slate/50">Keep</span>
          )}
        </td>

        {/* Edit action */}
        <td className="px-4 py-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border text-slate hover:text-teal hover:border-teal/30 hover:bg-teal/5 transition-all"
            onClick={openEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
            Configure
          </button>
        </td>
      </tr>

      {/* Edit modal */}
      {editing && (
        <tr className="bg-transparent">
          <td colSpan={6} className="p-0">
            <Modal
              title={`Configure promotion for ${cls.name}`}
              description="Set where students in this class move at year-end, or mark this as the final stage."
              onClose={() => { setEditing(false); setShowSkipWarning(false); }}
            >
              <div className="space-y-5">
                {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

                {/* Terminal toggle */}
                <Toggle
                  checked={draftTerminal}
                  onChange={(v) => {
                    setDraftTerminal(v);
                    if (v) setDraftTarget("");
                  }}
                  label="Students graduate from this class"
                  description="When the promotion is run, all students in this class will be marked as graduated and removed from the active student list."
                />

                {/* Target class selector */}
                {!draftTerminal && (
                  <div>
                    <label className={labelClass}>
                      Promotes to <span className="text-danger">*</span>
                    </label>
                    <select
                      value={draftTarget}
                      onChange={(e) => setDraftTarget(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">— choose target class —</option>
                      {eligibleTargets
                        .sort((a, b) => a.form - b.form || a.name.localeCompare(b.name))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.stageName ? ` (${c.stageName})` : ""}
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-slate mt-1.5">
                      Only classes with the same curriculum framework ({cls.frameworkType}) are shown.
                    </p>

                    {/* Live skip-stage feedback */}
                    {draftTarget && skipStatus === "ok" && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-success font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        Normal one-stage promotion
                      </div>
                    )}
                    {draftTarget && (skipStatus === "skip" || skipStatus === "backward") && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2">
                        <SkipForward className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                          {skipStatus === "backward"
                            ? "Warning: the target class is at the same level or lower than this one (backward/same-level move)."
                            : "Warning: this skips one or more stages in the canonical order."}
                          {" "}You can still save this, but you&apos;ll need to confirm the warning before running the promotion.
                        </span>
                      </div>
                    )}
                    {draftTarget && skipStatus === "cross-framework" && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        Promotion cannot cross curriculum frameworks.
                      </div>
                    )}
                  </div>
                )}

                {/* Teacher reset toggle */}
                <Toggle
                  checked={draftReset}
                  onChange={setDraftReset}
                  label="Reset teacher assignments after promotion"
                  description="When on, ClassSubjectTeacher and ClassElectiveGroupTeacher rows for the target class are deleted after the run, so the incoming class can be assigned fresh teachers. When off (default), existing assignments persist."
                />

                {/* Skip-stage confirmation dialog (shown inline before saving) */}
                {showSkipWarning && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-4 py-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <SkipForward className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                        <strong>
                          {skipStatus === "backward"
                            ? "This is a backward/same-level promotion."
                            : "This skips a stage in the canonical curriculum order."}
                        </strong>{" "}
                        {cls.stageName && (
                          <>
                            {cls.stageName} normally promotes to{" "}
                            {(() => {
                              const catalog = STAGE_CATALOG[cls.frameworkType];
                              const src = catalog?.find((s) => s.name === cls.stageName);
                              const next = src ? catalog?.find((s) => s.rank === src.rank + 1) : null;
                              return next?.name ?? "the next stage";
                            })()}
                            , but you&apos;re linking it to{" "}
                            {allClasses.find((c) => c.id === draftTarget)?.name ?? "the chosen class"}.
                          </>
                        )}
                        {" "}Confirm this is intentional.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`${royalButtonClass} bg-amber-600 border-amber-600 hover:bg-amber-700`}
                        disabled={saving}
                        onClick={() => handleSave(true)}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Yes, I confirm this mapping
                      </button>
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        onClick={() => setShowSkipWarning(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!showSkipWarning && (
                  <div className="flex justify-end gap-3 pt-1">
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={() => { setEditing(false); setShowSkipWarning(false); }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={royalButtonClass}
                      disabled={saving || (skipStatus === "cross-framework")}
                      onClick={() => handleSave(false)}
                    >
                      {saving ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                      ) : (
                        "Save configuration"
                      )}
                    </button>
                  </div>
                )}
              </div>
            </Modal>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function PromotionMappingPanel({
  classes,
  onUpdate,
}: {
  classes: SchoolClass[];
  onUpdate: () => void;
}) {
  const unresolvedCount = classes.filter(
    (c) => !c.promotesToClassId && !c.confirmedTerminal
  ).length;
  const pendingSkipCount = classes.filter(
    (c) => c.promotesToClassId && !c.skipStageConfirmed
  ).length;

  if (classes.length === 0) {
    return (
      <p className="text-sm text-slate py-2">
        No classes found. Add classes first from the Classes section.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {unresolvedCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-danger-bg border border-danger/20 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
          <p className="text-sm text-danger leading-relaxed">
            <strong>{unresolvedCount} class{unresolvedCount > 1 ? "es" : ""}</strong> still need
            {unresolvedCount === 1 ? "s" : ""} a promotion configuration before the run can be triggered.
          </p>
        </div>
      )}
      {pendingSkipCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-4 py-3">
          <SkipForward className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
            <strong>{pendingSkipCount} class{pendingSkipCount > 1 ? "es have" : " has"}</strong> an
            unconfirmed skip-stage warning. Open their configuration to confirm the mapping.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-background">
            <tr>
              {["Class", "Framework", "Students", "Promotion outcome", "Teachers", ""].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classes.map((cls) => (
              <PromotionMappingRow
                key={cls.id}
                cls={cls}
                allClasses={classes}
                onUpdate={onUpdate}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel 3 — Run Year Promotion
// ─────────────────────────────────────────────────────────────────────────────

function RunPromotionPanel() {
  const [preview, setPreview]           = useState<PromotionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);
  const [running, setRunning]           = useState(false);
  const [runResult, setRunResult]       = useState<{
    promotedCount: number;
    graduatedCount: number;
    academicYear: number;
  } | null>(null);
  const [runError, setRunError]         = useState<string | null>(null);

  // Double-run confirmation state
  const [showDoubleRunWarning, setShowDoubleRunWarning] = useState(false);
  // Final "are you sure" confirm dialog
  const [showConfirmDialog, setShowConfirmDialog]       = useState(false);

  const loadPreview = useCallback(async () => {
    setLoading(true); setPreviewError(null); setRunResult(null);
    const res = await fetch("/api/classes/promotion/preview");
    setLoading(false);
    if (!res.ok) { setPreviewError("Failed to load preview."); return; }
    setPreview(await res.json());
  }, []);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  async function runPromotion(confirmedDoubleRun = false) {
    if (!preview?.academicYear) return;
    setRunning(true); setRunError(null);
    const res = await fetch("/api/classes/promotion/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        academicYear:       preview.academicYear,
        confirmedDoubleRun,
      }),
    });
    const json = await res.json();
    setRunning(false);

    if (!res.ok) {
      if (json.error === "double_run_warning") {
        setShowDoubleRunWarning(true);
        return;
      }
      setRunError(json.message ?? json.error ?? "Promotion failed.");
      return;
    }

    setRunResult({
      promotedCount:  json.promotedCount,
      graduatedCount: json.graduatedCount,
      academicYear:   json.academicYear,
    });
    setShowConfirmDialog(false);
    setShowDoubleRunWarning(false);
    loadPreview();
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <SkeletonBar height="1rem" width="50%" />
        <SkeletonTable rows={4} cols={4} />
      </div>
    );
  }

  if (previewError) {
    return (
      <ErrorBanner
        message={previewError}
        onDismiss={() => { setPreviewError(null); loadPreview(); }}
      />
    );
  }

  if (!preview) return null;

  return (
    <div className="space-y-5">
      {runResult && (
        <SuccessBanner
          message={`Promotion complete for ${runResult.academicYear}: ${runResult.promotedCount} students promoted, ${runResult.graduatedCount} graduated.`}
        />
      )}
      {runError && <ErrorBanner message={runError} onDismiss={() => setRunError(null)} />}

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Classes",     value: preview.classes.length,    color: "text-foreground"    },
          { label: "Promoting",   value: preview.promotedTotal,      color: "text-teal"           },
          { label: "Graduating",  value: preview.graduatedTotal,     color: "text-success"        },
          { label: "Unresolved",  value: preview.unresolvedCount,    color: preview.unresolvedCount > 0 ? "text-danger" : "text-success" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-border bg-background px-4 py-3 text-center">
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-xs text-slate mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Academic year */}
      {preview.academicYear && (
        <div className="flex items-center gap-2 text-sm text-slate">
          <Info className="h-4 w-4 shrink-0" />
          Current academic year: <strong className="text-foreground">{preview.academicYear}</strong>
        </div>
      )}

      {/* Per-class preview table */}
      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-background">
            <tr>
              {["Class", "Stage", "Students", "Outcome", "Target"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {preview.classes.map((row) => (
              <tr key={row.classId} className="bg-card hover:bg-background/50 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{row.className}</td>
                <td className="px-4 py-3 text-xs text-slate">{row.stageName ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-slate tabular-nums">{row.studentCount}</td>
                <td className="px-4 py-3">
                  <OutcomeBadge outcome={row.outcome} />
                </td>
                <td className="px-4 py-3 text-sm text-slate">
                  {row.outcome === "graduate"  && "Graduates"}
                  {row.outcome === "promote"   && (row.targetClassName ?? "—")}
                  {(row.outcome === "unresolved" || row.outcome === "unconfirmed-skip") && (
                    <span className="text-xs text-danger italic">
                      {row.outcome === "unresolved"
                        ? "Needs configuration"
                        : "Confirm skip warning first"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Double-run warning banner */}
      {preview.alreadyRunThisYear && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
            A promotion was already run for{" "}
            <strong>{preview.academicYear}</strong> on{" "}
            {preview.alreadyRunAt
              ? new Date(preview.alreadyRunAt).toLocaleString()
              : "an unknown date"}
            . Running again may re-move already-promoted students.
          </p>
        </div>
      )}

      {/* Run button area */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          className={`${royalButtonClass} ${!preview.canRun ? "opacity-50 cursor-not-allowed" : ""}`}
          disabled={!preview.canRun || running}
          onClick={() => setShowConfirmDialog(true)}
          title={
            !preview.canRun
              ? `${preview.unresolvedCount} class(es) are not fully configured.`
              : undefined
          }
        >
          <Play className="h-4 w-4" />
          Run Year Promotion
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={loadPreview}
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh preview
        </button>
        {!preview.canRun && (
          <p className="text-xs text-danger">
            {preview.unresolvedCount} class{preview.unresolvedCount !== 1 ? "es" : ""} must be
            configured before this run can proceed.
          </p>
        )}
      </div>

      {/* Final confirmation modal */}
      {showConfirmDialog && (
        <Modal
          title="Run Year Promotion?"
          description={`This will move ${preview.promotedTotal} student(s) to their next class and graduate ${preview.graduatedTotal} student(s). The operation runs in a single atomic transaction — it either completes fully or rolls back entirely.`}
          onClose={() => setShowConfirmDialog(false)}
        >
          <div className="space-y-4">
            {showDoubleRunWarning && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-4 py-3">
                <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                  A promotion already ran for <strong>{preview.academicYear}</strong>.
                  Running again may re-move already-promoted students. This cannot be undone.
                </p>
              </div>
            )}

            <div className="rounded-xl bg-background border border-border px-4 py-3 space-y-1.5 text-sm">
              <p>
                <span className="font-medium text-teal tabular-nums">{preview.promotedTotal}</span>
                {" "}students will be promoted
              </p>
              <p>
                <span className="font-medium text-success tabular-nums">{preview.graduatedTotal}</span>
                {" "}students will graduate
              </p>
              {preview.academicYear && (
                <p className="text-slate text-xs">
                  Academic year: {preview.academicYear}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => { setShowConfirmDialog(false); setShowDoubleRunWarning(false); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={royalButtonClass}
                disabled={running}
                onClick={() => runPromotion(showDoubleRunWarning)}
              >
                {running ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Running…</>
                ) : (
                  <><Play className="h-4 w-4" />Confirm &amp; Run</>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel 2b — Stream Management
// ─────────────────────────────────────────────────────────────────────────────

function StreamManagementPanel() {
  const [streams, setStreams]   = useState<Stream[] | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [newName, setNewName]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/streams");
    if (!res.ok) { setError("Failed to load streams."); return; }
    setStreams(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true); setError(null);
    const res = await fetch("/api/streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to create stream."); return; }
    setNewName(""); load();
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    setSaving(true); setError(null);
    const res = await fetch(`/api/streams/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to rename."); return; }
    setEditId(null); load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete stream "${name}"? Classes linked to it will lose their stream assignment.`)) return;
    const res = await fetch(`/api/streams/${id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json(); setError(j.error ?? "Failed to delete."); return; }
    load();
  }

  if (!streams && !error) {
    return <SkeletonBar height="2.5rem" width="60%" />;
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Existing streams */}
      {streams && streams.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background">
              <tr>
                {["Stream name", "Classes", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {streams.map((s) => (
                <tr key={s.id} className="bg-card hover:bg-background/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {editId === s.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")  handleRename(s.id);
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className={`${inputClass} py-1 text-sm max-w-[180px]`}
                      />
                    ) : (
                      s.name
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate tabular-nums">{s._count.classes}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {editId === s.id ? (
                        <>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-teal/10 text-teal border border-teal/20 hover:bg-teal/20 transition-colors"
                            disabled={saving}
                            onClick={() => handleRename(s.id)}
                          >
                            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border text-slate hover:text-foreground transition-colors"
                            onClick={() => setEditId(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border text-slate hover:text-teal hover:border-teal/30 transition-colors"
                            onClick={() => { setEditId(s.id); setEditName(s.name); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border text-slate hover:text-danger hover:border-danger/30 hover:bg-danger-bg/30 transition-colors"
                            onClick={() => handleDelete(s.id, s.name)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {streams?.length === 0 && (
        <p className="text-sm text-slate italic py-1">No streams yet.</p>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="flex items-center gap-2 max-w-sm">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New stream name, e.g. North"
          className={`${inputClass} flex-1`}
        />
        <button type="submit" disabled={saving || !newName.trim()} className={royalButtonClass}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root export — ClassPromotionSection
// ─────────────────────────────────────────────────────────────────────────────

export default function ClassPromotionSection() {
  const [classes, setClasses] = useState<SchoolClass[] | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    const res = await fetch("/api/classes");
    if (!res.ok) { setError("Failed to load classes."); return; }
    const data: SchoolClass[] = await res.json();
    setClasses(data);
  }, []);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  // Counts for collapsible badges
  const migrationCount = classes
    ? classes.filter((c) => !c.stageName).length
    : null;
  const unresolvedCount = classes
    ? classes.filter((c) => !c.promotesToClassId && !c.confirmedTerminal).length
    : null;
  const pendingSkipCount = classes
    ? classes.filter((c) => c.promotesToClassId && !c.skipStageConfirmed).length
    : null;

  if (!classes && !error) {
    return (
      <div className="space-y-3">
        <SkeletonBar height="3rem" />
        <SkeletonBar height="3rem" />
        <SkeletonBar height="3rem" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onDismiss={() => { setError(null); loadClasses(); }} />;
  }

  return (
    <div className="space-y-4 max-w-4xl">

      {/* Panel 0 — intro callout */}
      <div className="flex items-start gap-3 rounded-xl bg-teal/5 border border-teal/20 px-4 py-3">
        <GraduationCap className="h-5 w-5 text-teal shrink-0 mt-0.5" />
        <div className="text-sm text-slate leading-relaxed">
          <p className="font-medium text-foreground mb-1">Year-End Promotion</p>
          Complete the steps below in order: assign stage names to legacy classes, configure where
          each class promotes to (or mark it as terminal), then run the promotion. The run is a
          single atomic transaction — it either completes fully or rolls back.
        </div>
      </div>

      {/* Step 1 — Stage migration */}
      <CollapsiblePanel
        title="Step 1 — Assign canonical stage names"
        badge={
          migrationCount == null
            ? undefined
            : migrationCount === 0
            ? "All resolved"
            : `${migrationCount} need attention`
        }
        badgeVariant={
          migrationCount == null
            ? "neutral"
            : migrationCount === 0
            ? "success"
            : "warning"
        }
        defaultOpen={(migrationCount ?? 0) > 0}
      >
        <StageMigrationPanel />
      </CollapsiblePanel>

      {/* Step 1b — Stream management */}
      <CollapsiblePanel
        title="Streams"
        badge="Optional"
        badgeVariant="neutral"
        defaultOpen={false}
      >
        <div className="space-y-2">
          <p className="text-sm text-slate leading-relaxed">
            Streams (e.g. &quot;North&quot;, &quot;Science&quot;, &quot;A&quot;) let you group parallel classes across forms.
            The auto-suggestion for promotion links matches classes in the same stream.
            Streams are optional — single-stream schools can skip this.
          </p>
          <StreamManagementPanel />
        </div>
      </CollapsiblePanel>

      {/* Step 2 — Mapping */}
      <CollapsiblePanel
        title="Step 2 — Configure promotion mappings"
        badge={
          unresolvedCount == null
            ? undefined
            : unresolvedCount === 0 && pendingSkipCount === 0
            ? "All configured"
            : unresolvedCount === 0 && (pendingSkipCount ?? 0) > 0
            ? `${pendingSkipCount} skip warnings`
            : `${unresolvedCount} unresolved`
        }
        badgeVariant={
          unresolvedCount == null
            ? "neutral"
            : unresolvedCount === 0 && pendingSkipCount === 0
            ? "success"
            : unresolvedCount === 0
            ? "warning"
            : "danger"
        }
        defaultOpen={(unresolvedCount ?? 0) > 0 || (pendingSkipCount ?? 0) > 0}
      >
        {classes ? (
          <PromotionMappingPanel classes={classes} onUpdate={loadClasses} />
        ) : (
          <SkeletonTable rows={4} cols={5} />
        )}
      </CollapsiblePanel>

      {/* Step 3 — Run */}
      <CollapsiblePanel
        title="Step 3 — Run Year Promotion"
        badge={
          unresolvedCount === 0 && pendingSkipCount === 0 ? "Ready" : "Not ready"
        }
        badgeVariant={
          unresolvedCount === 0 && pendingSkipCount === 0 ? "success" : "neutral"
        }
        defaultOpen={unresolvedCount === 0 && (pendingSkipCount ?? 0) === 0}
      >
        <RunPromotionPanel />
      </CollapsiblePanel>
    </div>
  );
}
