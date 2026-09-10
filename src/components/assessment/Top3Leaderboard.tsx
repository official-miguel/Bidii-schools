"use client";

import type { TeacherRankResult } from "@/lib/assessment/teacherRanking";
import RankIcon from "./RankIcon";

interface Top3LeaderboardProps {
  top3: TeacherRankResult[];
  /** Optional: highlight a specific teacher (e.g. the viewer). */
  highlightTeacherId?: string;
}

const CARD_STYLES = [
  // 1st — gold
  "border-amber-400 bg-gradient-to-b from-amber-50 to-white",
  // 2nd — silver
  "border-slate-300 bg-gradient-to-b from-slate-50 to-white",
  // 3rd — bronze
  "border-orange-300 bg-gradient-to-b from-orange-50 to-white",
];

const SCORE_STYLES = [
  "text-amber-700 font-semibold",
  "text-slate-600 font-semibold",
  "text-orange-700 font-semibold",
];

/** Podium visual order: 2nd | 1st | 3rd */
const ORDER = [1, 0, 2];

export default function Top3Leaderboard({
  top3,
  highlightTeacherId,
}: Top3LeaderboardProps) {
  if (top3.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-slate">
        No ranking data available for this period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-1">
      {/* Podium layout on md+; horizontal scroll on mobile */}
      <div className="flex gap-3 min-w-max md:min-w-0 md:justify-center items-end">
        {ORDER.map((idx) => {
          const entry = top3[idx];
          if (!entry) return null;
          const isFirst     = idx === 0;
          const isHighlight = entry.teacherId === highlightTeacherId;

          return (
            <div
              key={entry.teacherId}
              className={`flex flex-col items-center rounded-xl border-2 px-5 py-4 w-44 shadow-sm transition-all
                ${CARD_STYLES[idx]}
                ${isFirst ? "mb-0 scale-105 shadow-md" : "mb-2"}
                ${isHighlight ? "ring-2 ring-royal ring-offset-2" : ""}`}
            >
              {/* Position icon */}
              <RankIcon rank={idx + 1} size={42} className="mb-2" />

              {/* Name */}
              <p className="font-bold text-foreground text-sm text-center leading-tight mt-1">
                {entry.teacherName}
              </p>

              {/* Subject */}
              {entry.subjectName && (
                <p className="text-xs text-slate text-center mt-0.5 leading-tight">
                  {entry.subjectName}
                </p>
              )}

              {/* Score */}
              <p className={`text-xs mt-2 ${SCORE_STYLES[idx]}`}>
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
  );
}
