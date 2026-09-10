"use client";

import type { TeacherRankResult } from "@/lib/assessment/teacherRanking";
import RankIcon from "./RankIcon";
import { Building2 } from "lucide-react";

interface DeptTop3LeaderboardProps {
  top3: TeacherRankResult[];
  /** Department name shown as a badge above the podium. */
  departmentName: string;
  /** If provided, that card gets a subtle highlight ring. */
  highlightTeacherId?: string;
}

/** Podium visual order: 2nd | 1st | 3rd */
const ORDER = [1, 0, 2];

const CARD_BASE =
  "flex flex-col items-center rounded-xl border-2 px-4 py-4 w-44 shadow-sm transition-all";

const CARD_STYLES = [
  // 1st — gold
  "border-amber-400 bg-gradient-to-b from-amber-50 to-white",
  // 2nd — silver
  "border-slate-300 bg-gradient-to-b from-slate-50 to-white",
  // 3rd — bronze
  "border-orange-300 bg-gradient-to-b from-orange-50 to-white",
];

const RANK_LABEL_STYLES = [
  "text-amber-700 bg-amber-100",
  "text-slate-600 bg-slate-100",
  "text-orange-700 bg-orange-100",
];

const SCORE_STYLES = [
  "text-amber-700",
  "text-slate-600",
  "text-orange-700",
];

export default function DeptTop3Leaderboard({
  top3,
  departmentName,
  highlightTeacherId,
}: DeptTop3LeaderboardProps) {
  if (top3.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-slate">
        No ranking data available for this department.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Department badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-royal/10 px-3 py-1 text-xs font-semibold text-royal">
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          {departmentName} Department
        </span>
        <span className="text-xs text-slate">Top performers this period</span>
      </div>

      {/* Podium */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-3 min-w-max md:min-w-0 md:justify-center items-end">
          {ORDER.map((idx) => {
            const entry = top3[idx];
            if (!entry) return null;
            const isFirst     = idx === 0;
            const isHighlight = entry.teacherId === highlightTeacherId;

            return (
              <div
                key={entry.teacherId}
                className={`${CARD_BASE} ${CARD_STYLES[idx]} ${
                  isFirst ? "mb-0 scale-105 shadow-md" : "mb-3"
                } ${isHighlight ? "ring-2 ring-royal ring-offset-2" : ""}`}
              >
                {/* Position icon */}
                <RankIcon rank={idx + 1} size={40} className="mb-1" />

                {/* Rank pill */}
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 ${RANK_LABEL_STYLES[idx]}`}
                >
                  #{entry.rank} in dept
                </span>

                {/* Name */}
                <p className="font-bold text-foreground text-sm text-center leading-tight">
                  {entry.teacherName}
                </p>

                {/* Subject */}
                {entry.subjectName && (
                  <p className="text-xs text-slate text-center mt-0.5 leading-tight">
                    {entry.subjectName}
                  </p>
                )}

                {/* Score */}
                <p className={`text-xs font-semibold mt-2 ${SCORE_STYLES[idx]}`}>
                  {(entry.compositeScore * 100).toFixed(1)} pts
                </p>

                {/* Trend */}
                {entry.trendDirection !== 0 && (
                  <span
                    className={`text-xs mt-0.5 font-medium ${
                      entry.trendDirection === 1 ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {entry.trendDirection === 1 ? "↑ Improved" : "↓ Declined"}
                  </span>
                )}

                {/* "You" badge */}
                {isHighlight && (
                  <span className="mt-1.5 text-[10px] bg-royal text-white px-2 py-0.5 rounded-full font-medium">
                    You
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
