"use client";

/**
 * MarksheetPageClient
 *
 * Client wrapper rendered by the Teacher Mark Sheets server page.
 *
 * Two modes:
 *   Landing (no classId + subjectId in URL):
 *     Shows TeacherMarksheetCards — the period selector + assignment card grid.
 *     For HOD users: shows a tab switch between "My Classes" and "My Department"
 *
 *   Grid (classId + subjectId present in URL):
 *     Shows a "← Back to mark sheets" breadcrumb, then the MarksheetGrid /
 *     CBE grid passed in as {children}. No period selector here — the teacher
 *     picks the period on the landing screen before opening a card.
 */

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Users, Building2 } from "lucide-react";
import TeacherMarksheetCards from "@/components/assessment/TeacherMarksheetCards";
import HODDepartmentMarksheetCards from "@/components/assessment/HODDepartmentMarksheetCards";

interface PeriodOption {
  id: string;
  name: string;
  academicYear: string;
  term: number | null;
  isCurrent: boolean;
}

interface MarksheetPageClientProps {
  children: React.ReactNode;
  periods: PeriodOption[];
  activePeriodId: string;
  isGridMode: boolean;
  /** Whether this user is an HOD — if true, show My Classes / My Department tabs */
  isHOD?: boolean;
  /** HOD's department name for display */
  departmentName?: string;
}

type LandingTab = "my_classes" | "my_department";

export default function MarksheetPageClient({
  children,
  periods,
  activePeriodId,
  isGridMode,
  isHOD = false,
  departmentName,
}: MarksheetPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [landingTab, setLandingTab] = useState<LandingTab>("my_classes");

  // ── Landing mode: period selector + assignment cards ──────────────────────
  if (!isGridMode) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">
            Mark Sheets
          </h1>
          <p className="text-sm text-slate mt-0.5">
            {isHOD
              ? "Select an assignment from your classes or manage your department's mark sheets."
              : "Select an assignment below to open its mark sheet."}
          </p>
        </div>

        {/* HOD Tab Switch */}
        {isHOD && (
          <div className="flex gap-0.5 rounded-xl border border-border bg-background p-1 w-fit">
            <button
              type="button"
              onClick={() => setLandingTab("my_classes")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                landingTab === "my_classes"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-slate hover:text-foreground"
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              My Classes
            </button>
            <button
              type="button"
              onClick={() => setLandingTab("my_department")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                landingTab === "my_department"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-slate hover:text-foreground"
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              My Department
              {departmentName && (
                <span className="text-xs opacity-60">({departmentName})</span>
              )}
            </button>
          </div>
        )}

        {/* Cards Display */}
        {(!isHOD || landingTab === "my_classes") && (
          <TeacherMarksheetCards
            periods={periods}
            initialPeriodId={activePeriodId}
          />
        )}

        {isHOD && landingTab === "my_department" && (
          <HODDepartmentMarksheetCards
            periods={periods}
            initialPeriodId={activePeriodId}
            departmentName={departmentName ?? ""}
          />
        )}
      </div>
    );
  }

  // ── Grid mode: back link + grid only (no period selector) ─────────────────
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => {
          // Strip classId and subjectId; keep periodId so the landing reopens
          // on the same period the teacher was viewing.
          const params = new URLSearchParams(searchParams.toString());
          params.delete("classId");
          params.delete("subjectId");
          router.push(`/teacher/assessments/marksheet?${params.toString()}`);
        }}
        className="inline-flex items-center gap-1 text-sm text-teal hover:text-teal/80 transition-colors dark:text-teal dark:hover:text-teal/80"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to mark sheets
      </button>

      {children}
    </div>
  );
}
