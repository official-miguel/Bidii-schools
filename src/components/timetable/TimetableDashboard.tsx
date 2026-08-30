"use client";

/**
 * TimetableDashboard — shared timetable hub content.
 *
 * Accepts a `basePath` prop so it can be rendered under both
 * /principal/timetable and /staff/timetable with correct nav links.
 *
 * The ContextNavigation bar is NOT rendered here — the parent page
 * is responsible for rendering it with the appropriate basePath so
 * that only one nav bar appears.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2, AlertTriangle, RefreshCw,
  ChevronRight, Zap, Layers, BookOpen,
  Clock, Sun, Wrench, ArrowRight,
} from "lucide-react";
import { PageHeader, ErrorBanner } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────
type Version = {
  id: string; name: string; status: string; slotCount: number;
  createdAt: string; publishedAt: string | null;
  academicYear: string | null; term: number | null;
};

// ── Props ──────────────────────────────────────────────────────────────────
interface TimetableDashboardProps {
  basePath: string;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function TimetableDashboard({ basePath }: TimetableDashboardProps) {
  const [published, setPublished] = useState<Version | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/timetable/v2/versions");
      if (!res.ok) throw new Error("Failed to load timetable data.");
      const versions: Version[] = await res.json();
      setPublished(versions.find((v) => v.status === "PUBLISHED") ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        title="Timetable"
        description="Configure, generate, and manage the school schedule."
      />

      <div className="space-y-6">
        {error && <ErrorBanner message={error} />}

        {/* ── Published status banner ───────────────────────────────── */}
        {!loading && (
          <div className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4
            ${published ? "bg-success-bg border-success/20" : "bg-warn-bg border-warn/20"}`}>
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {published
                ? <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                : <AlertTriangle className="h-5 w-5 text-warn shrink-0 mt-0.5" />}
              <div className="min-w-0">
                {published ? (
                  <>
                    <p className="text-sm font-semibold text-ink">Live — {published.name}</p>
                    <p className="text-xs text-slate mt-0.5">
                      {published.slotCount} lessons
                      {published.academicYear ? ` · ${published.academicYear}` : ""}
                      {published.term ? ` Term ${published.term}` : ""}
                      {published.publishedAt ? ` · Published ${new Date(published.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-ink">No timetable published</p>
                    <p className="text-xs text-slate mt-0.5">
                      Generate and publish a timetable so teachers can see their schedules.
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {published
                ? <Link href={`${basePath}/builder`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-white border border-line text-ink hover:border-teal hover:text-teal transition-colors">
                    Edit <ArrowRight className="h-3 w-3" />
                  </Link>
                : <Link href={`${basePath}/generate`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-teal text-white hover:bg-teal-dark transition-colors">
                    <Zap className="h-3 w-3" /> Generate now
                  </Link>}
              <button onClick={load} title="Refresh"
                className="p-2 rounded-lg border border-line text-slate hover:text-teal hover:border-teal transition-colors">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        )}

        {/* ── Quick-access cards ──────────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">All sections</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <NavCard href={`${basePath}/template`}     icon={<Clock className="h-5 w-5" />}
              title="Day Template"   description="Define the school-day format: lesson slots, breaks, lunch, games, and session times." accent="teal" />
            <NavCard href={`${basePath}/requirements`} icon={<BookOpen className="h-5 w-5" />}
              title="Requirements"   description="Set how many lessons per week each class needs for each subject." accent="blue" />
            <NavCard href={`${basePath}/preferences`}  icon={<Sun className="h-5 w-5" />}
              title="Preferences"    description="Tell the engine which subjects prefer morning or afternoon sessions." accent="amber" />
            <NavCard href={`${basePath}/generate`}     icon={<Zap className="h-5 w-5" />}
              title="Generate"       description="Run the constraint solver, review results, and publish." accent="purple" />
            <NavCard href={`${basePath}/builder`}      icon={<Wrench className="h-5 w-5" />}
              title="Builder"        description="Manually view, edit, and fine-tune any slot in the live grid." accent="teal" />
            <NavCard href={`${basePath}/versions`}     icon={<Layers className="h-5 w-5" />}
              title="Versions"       description="Manage drafts, clone between terms, and roll back." accent="blue" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function NavCard({
  href, icon, title, description, accent,
}: {
  href: string; icon: React.ReactNode; title: string; description: string; accent: string;
}) {
  const bg: Record<string, string> = {
    teal:   "bg-teal/8 text-teal group-hover:bg-teal/15",
    blue:   "bg-blue-50 text-blue-600 group-hover:bg-blue-100",
    amber:  "bg-amber-50 text-amber-600 group-hover:bg-amber-100",
    purple: "bg-purple-50 text-purple-600 group-hover:bg-purple-100",
    slate:  "bg-paper text-slate group-hover:bg-line",
  };
  return (
    <Link href={href}
      className="group bg-white border border-line rounded-xl p-5 flex flex-col gap-3
                 hover:border-teal/40 hover:shadow-sm transition-all duration-150">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${bg[accent] ?? bg.teal}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink group-hover:text-teal transition-colors flex items-center gap-1">
          {title}
          <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
        </p>
        <p className="text-xs text-slate mt-1 leading-relaxed">{description}</p>
      </div>
    </Link>
  );
}
