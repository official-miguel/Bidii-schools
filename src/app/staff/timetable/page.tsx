"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ContextNavigation from "@/components/ContextNavigation";
import { getTimetableNav } from "@/lib/timetable/navItems";
import { PageHeader } from "@/components/ui";
import {
  CheckCircle2, AlertTriangle, RefreshCw, Zap, Wrench, Settings,
} from "lucide-react";

const NAV = getTimetableNav("/staff/timetable");

type Version = {
  id: string;
  name: string;
  status: string;
  slotCount: number;
  publishedAt: string | null;
};

export default function StaffTimetablePage() {
  const [published,   setPublished]   = useState<Version | null>(null);
  const [draftCount,  setDraftCount]  = useState(0);
  const [loading,     setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/timetable/v2/versions");
      if (res.ok) {
        const versions: Version[] = await res.json();
        setPublished(versions.find((v) => v.status === "PUBLISHED") ?? null);
        setDraftCount(versions.filter((v) => v.status === "DRAFT").length);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <ContextNavigation items={NAV} />
      <PageHeader
        title="Timetable"
        description="Configure, generate, and manage the school schedule."
      />
      <div className="space-y-5">
        {!loading && (
          <div
            className={`rounded-xl border p-5 flex items-center gap-4 ${
              published
                ? "bg-success-bg border-success/20"
                : "bg-warn-bg border-warn/20"
            }`}
          >
            {published ? (
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-warn shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              {published ? (
                <>
                  <p className="text-sm font-semibold text-foreground">
                    Live — {published.name}
                  </p>
                  <p className="text-xs text-slate mt-0.5">
                    {published.slotCount} lessons scheduled
                    {draftCount > 0 &&
                      ` · ${draftCount} draft${draftCount !== 1 ? "s" : ""} pending`}
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold text-foreground">
                  No timetable published yet.
                </p>
              )}
            </div>
            <button
              onClick={load}
              className="p-2 rounded-lg border border-border text-slate hover:text-teal hover:border-teal transition-colors"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              href: "/staff/timetable/generate",
              icon: <Zap className="h-5 w-5" />,
              title: "Generate",
              desc: "Run the constraint solver to create a new timetable draft.",
              accent: "bg-teal/10 text-teal group-hover:bg-teal/15",
            },
            {
              href: "/staff/timetable/builder",
              icon: <Wrench className="h-5 w-5" />,
              title: "Builder",
              desc: "View, drag-and-drop, and manually edit any slot.",
              accent: "bg-teal/10 text-teal group-hover:bg-teal/15",
            },
            {
              href: "/staff/timetable/settings",
              icon: <Settings className="h-5 w-5" />,
              title: "Settings",
              desc: "Day template, lesson requirements, preferences, and versions.",
              accent: "bg-teal/10 text-teal group-hover:bg-teal/15",
            },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group bg-card border border-border rounded-xl p-5 flex flex-col gap-3
                         hover:border-teal/40 hover:shadow-sm transition-all duration-150 dark:hover:border-teal/30"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${card.accent}`}
              >
                {card.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground group-hover:text-teal transition-colors">
                  {card.title}
                </p>
                <p className="text-xs text-slate mt-1 leading-relaxed">{card.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
