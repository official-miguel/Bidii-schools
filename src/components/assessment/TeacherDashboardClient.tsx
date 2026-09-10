"use client";

/**
 * TeacherDashboardClient
 *
 * Wraps the teacher In-depth Analysis page with:
 *   - Two top-level tabs: "My Classes" (default) | "Full School Analysis"
 *   - My Classes tab: clickable class/subject tiles → opens DashboardCharts
 *     scoped to that tile's class/subject.
 *   - Full School Analysis tab: full DashboardCharts with no class pre-filter
 *     (mirrors the principal dashboard).
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Users,
  ChevronRight,
  ArrowLeft,
  GraduationCap,
  School,
} from "lucide-react";

const DashboardCharts = dynamic(
  () => import("@/components/assessment/DashboardCharts"),
  { ssr: false }
);
const CbeDashboardEnhanced = dynamic(
  () => import("@/components/assessment/CbeDashboardEnhanced"),
  { ssr: false }
);

// ── Types ──────────────────────────────────────────────────────────────────────

interface ClassTile {
  classId: string;
  className: string;
  form: number;
  subjects: { id: string; name: string; code: string }[];
  frameworkType: string;
}

interface AllClassShape {
  id: string;
  name: string;
  form: number;
  frameworkType: string;
}

interface SubjectShape {
  id: string;
  name: string;
  applicableForms: number[];
}

interface TeacherDashboardClientProps {
  /** Tiles shown in "My Classes" — each class the teacher is assigned to. */
  tiles: ClassTile[];
  /** Subjects in the teacher's scope — used for tile drill-down. */
  subjects: SubjectShape[];
  /** All school subjects — used for Full School Analysis tab. */
  allSubjects: SubjectShape[];
  /** Whether this teacher has wide (school-wide) access. */
  isWideAccess: boolean;
  hasBoth: boolean;
  hasCbeOnly: boolean;
  kcseClasses: AllClassShape[];
  cbeClasses: AllClassShape[];
  cbeOnlyFlag: boolean;
}

type TopTab = "my_classes" | "full_school";
type DrillState = { classId: string; className: string; subjectId?: string; frameworkType: string } | null;

// ── Class tile card ────────────────────────────────────────────────────────────
// Clicking the card always goes straight to full analysis — no expand/collapse.
function ClassTileCard({
  tile,
  onDrill,
}: {
  tile: ClassTile;
  onDrill: (classId: string, className: string, subjectId: string | undefined, frameworkType: string) => void;
}) {
  // Pass the first subject id so DashboardCharts can pre-filter; if the
  // teacher teaches multiple subjects in this class we pass undefined so the
  // charts show all of them (same behaviour as principal's dashboard).
  const subjectId = tile.subjects.length === 1 ? tile.subjects[0]?.id : undefined;

  return (
    <button
      type="button"
      onClick={() => onDrill(tile.classId, tile.className, subjectId, tile.frameworkType)}
      className="group bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left w-full"
    >
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="shrink-0 w-9 h-9 rounded-lg bg-royal/10 flex items-center justify-center">
          <GraduationCap className="w-4.5 h-4.5 text-royal" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">{tile.className}</p>
          {tile.subjects.length > 0 && (
            <p className="text-xs text-slate mt-0.5 truncate">
              {tile.subjects.map((s) => s.name).join(" · ")}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-royal font-medium flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          Analyse
          <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function TeacherDashboardClient({
  tiles,
  subjects,
  allSubjects,
  isWideAccess,
  hasBoth,
  hasCbeOnly,
  kcseClasses,
  cbeClasses,
  cbeOnlyFlag,
}: TeacherDashboardClientProps) {
  const [topTab, setTopTab] = useState<TopTab>("my_classes");
  const [drill, setDrill] = useState<DrillState>(null);
  // Framework sub-tab (844 vs CBE) for "Full School" when hasBoth
  const [fwTab, setFwTab] = useState<"844" | "cbe">(hasCbeOnly ? "cbe" : "844");

  function handleDrill(classId: string, className: string, subjectId: string | undefined, frameworkType: string) {
    setDrill({ classId, className, subjectId, frameworkType });
  }

  function handleBack() {
    setDrill(null);
  }

  // ── Top tab bar ──────────────────────────────────────────────────────────────
  const topTabs = [
    { key: "my_classes" as TopTab, label: "My Classes", icon: Users },
    { key: "full_school" as TopTab, label: "Full School Analysis", icon: School },
  ];

  return (
    <div className="space-y-5">
      {/* Top-level tab bar */}
      <div className="flex gap-0.5 rounded-xl border border-border bg-background p-1 w-fit">
        {topTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTopTab(key);
              setDrill(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              topTab === key
                ? "bg-card shadow-sm text-foreground"
                : "text-slate hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* ── MY CLASSES TAB ─────────────────────────────────────────────────── */}
      {topTab === "my_classes" && (
        <>
          {drill ? (
            /* Drill-down: show full charts for the selected class/subject */
            <div className="space-y-4">
              {/* Back + breadcrumb */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1.5 text-sm text-royal hover:text-royal/80 font-medium transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to My Classes
                </button>
                <span className="text-slate text-sm">/</span>
                <span className="text-sm font-semibold text-foreground">{drill.className}</span>
              </div>

              <p className="text-xs text-slate">
                Showing full analysis for{" "}
                <span className="font-medium text-foreground">{drill.className}</span>
                {drill.subjectId && subjects.find((s) => s.id === drill.subjectId) && (
                  <>
                    {" — "}
                    <span className="font-medium text-foreground">
                      {subjects.find((s) => s.id === drill.subjectId)?.name}
                    </span>
                  </>
                )}
              </p>

              {drill.frameworkType === "CBE" ? (
                <CbeDashboardEnhanced
                  classes={cbeClasses.map((c) => ({ id: c.id, name: c.name, frameworkType: c.frameworkType }))}
                  cbeOnly={cbeOnlyFlag}
                  defaultClassId={drill.classId}
                />
              ) : (
                <DashboardCharts
                  classes={kcseClasses.map((c) => ({ id: c.id, name: c.name, form: c.form }))}
                  subjects={subjects}
                  defaultClassId={drill.classId}
                  defaultSubjectId={drill.subjectId ?? undefined}
                  hideFilters={true}
                />
              )}
            </div>
          ) : (
            /* Tiles grid */
            <div className="space-y-4">
              <p className="text-sm text-slate">
                Select a class or subject below to open its full analysis.
              </p>

              {tiles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-slate">
                  No class assignments found.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tiles.map((tile) => (
                    <ClassTileCard
                      key={tile.classId}
                      tile={tile}
                      onDrill={handleDrill}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── FULL SCHOOL ANALYSIS TAB ──────────────────────────────────────── */}
      {topTab === "full_school" && (
        <div className="space-y-4">
          <p className="text-sm text-slate">
            {isWideAccess
              ? "School-wide analytics — all classes and subjects."
              : "Full school assessment analytics for reference."}
          </p>

          {/* Framework sub-tabs when school has both 8-4-4 and CBE */}
          {hasBoth && (
            <div className="flex gap-1 border-b border-border">
              {[
                { key: "844" as const, label: `8-4-4 (${kcseClasses.length})` },
                { key: "cbe" as const, label: `CBE (${cbeClasses.length})` },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFwTab(key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    fwTab === key
                      ? "border-ink text-foreground"
                      : "border-transparent text-slate hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {(fwTab === "844" || !hasBoth) && kcseClasses.length > 0 && (
            <DashboardCharts
              classes={kcseClasses.map((c) => ({ id: c.id, name: c.name, form: c.form }))}
              subjects={allSubjects}
            />
          )}

          {(fwTab === "cbe" || hasCbeOnly) && cbeClasses.length > 0 && (
            <CbeDashboardEnhanced
              classes={cbeClasses.map((c) => ({ id: c.id, name: c.name, frameworkType: c.frameworkType }))}
              cbeOnly={cbeOnlyFlag}
            />
          )}
        </div>
      )}
    </div>
  );
}
