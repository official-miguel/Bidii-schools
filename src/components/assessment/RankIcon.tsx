"use client";

/**
 * RankIcon — classy position icons for 1st, 2nd, 3rd place.
 * Uses inline SVG so no external image dependency.
 * For ranks 4+ returns a plain numeric badge.
 */

interface RankIconProps {
  rank: number;
  /** Size of the icon area in pixels. Default 40. */
  size?: number;
  className?: string;
}

// ── 1st — Gold trophy ──────────────────────────────────────────────────────────
function GoldTrophy({ size }: { size: number }) {
  return (
    // rank colors: gold/silver/bronze are intentional decorative award colors, theme-independent
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="1st place">
      {/* Cup body */}
      <path d="M16 8h16v16a8 8 0 01-16 0V8z" fill="#F59E0B" /* award icon — intentional illustrative color */ />
      {/* Cup shine */}
      <path d="M18 10h4v10a4 4 0 01-4-4V10z" fill="#FDE68A" /* award icon — intentional illustrative color */ opacity="0.5"/>
      {/* Handles */}
      <path d="M16 12H10a4 4 0 004 4h2" stroke="#D97706" /* award icon — intentional illustrative color */ strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M32 12h6a4 4 0 01-4 4h-2" stroke="#D97706" /* award icon — intentional illustrative color */ strokeWidth="2" strokeLinecap="round" fill="none"/>
      {/* Stem */}
      <rect x="22" y="24" width="4" height="8" rx="1" fill="#F59E0B" /* award icon — intentional illustrative color */ />
      {/* Base */}
      <rect x="16" y="32" width="16" height="4" rx="2" fill="#D97706" /* award icon — intentional illustrative color */ />
      {/* Star on top */}
      <path d="M24 4l1.2 3.6H29l-3 2.2 1.2 3.6L24 11.2l-3.2 2.2L22 9.8l-3-2.2h3.8z" fill="#FDE68A" /* award icon — intentional illustrative color */ />
    </svg>
  );
}

// ── 2nd — Silver laurel / medal ────────────────────────────────────────────────
function SilverMedal({ size }: { size: number }) {
  return (
    // rank colors: gold/silver/bronze are intentional decorative award colors, theme-independent
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="2nd place">
      {/* Ribbon left */}
      <path d="M18 6l-4 10h6l2-10z" fill="#94A3B8" /* award icon — intentional illustrative color */ />
      {/* Ribbon right */}
      <path d="M30 6l4 10h-6l-2-10z" fill="#CBD5E1" /* award icon — intentional illustrative color */ />
      {/* Medal circle */}
      <circle cx="24" cy="30" r="12" fill="#CBD5E1" /* award icon — intentional illustrative color */ />
      <circle cx="24" cy="30" r="10" fill="#E2E8F0" /* award icon — intentional illustrative color */ />
      {/* Inner ring */}
      <circle cx="24" cy="30" r="8" fill="none" stroke="#94A3B8" /* award icon — intentional illustrative color */ strokeWidth="1.5"/>
      {/* "2" numeral */}
      <text x="24" y="35" textAnchor="middle" fontSize="11" fontWeight="700" fill="#475569" /* award icon — intentional illustrative color */ fontFamily="system-ui">2</text>
    </svg>
  );
}

// ── 3rd — Bronze award / ribbon ───────────────────────────────────────────────
function BronzeAward({ size }: { size: number }) {
  return (
    // rank colors: gold/silver/bronze are intentional decorative award colors, theme-independent
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="3rd place">
      {/* Shield body */}
      <path d="M24 6L10 12v12c0 8 6 14 14 16 8-2 14-8 14-16V12z" fill="#C2773A" /* award icon — intentional illustrative color */ />
      {/* Shield highlight */}
      <path d="M24 8L12 13v11c0 6.5 5 11.5 12 13.5" fill="#E09050" /* award icon — intentional illustrative color */ opacity="0.6"/>
      {/* Inner shield */}
      <path d="M24 10L14 15v9c0 5.5 4 9.5 10 11 6-1.5 10-5.5 10-11v-9z" fill="#D4854A" /* award icon — intentional illustrative color */ />
      {/* Star */}
      <path d="M24 16l1.5 4.5H30l-3.8 2.7 1.5 4.5L24 25l-3.7 2.7 1.5-4.5L18 20.5h4.5z" fill="#FEF3C7" /* award icon — intentional illustrative color */ />
    </svg>
  );
}

// ── Numeric badge for rank 4+ ──────────────────────────────────────────────────
function NumericBadge({ rank }: { rank: number }) {
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-background border border-border text-xs font-bold text-slate tabular-nums">
      {rank}
    </span>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export default function RankIcon({ rank, size = 40, className = "" }: RankIconProps) {
  const inner =
    rank === 1 ? <GoldTrophy size={size} /> :
    rank === 2 ? <SilverMedal size={size} /> :
    rank === 3 ? <BronzeAward size={size} /> :
    <NumericBadge rank={rank} />;

  return (
    <span className={`inline-flex items-center justify-center shrink-0 ${className}`}>
      {inner}
    </span>
  );
}

// ── Small inline version for table cells ─────────────────────────────────────
export function RankIconSmall({ rank }: { rank: number }) {
  if (rank > 3) {
    return <span className="text-sm tabular-nums text-slate font-medium">#{rank}</span>;
  }
  const configs = {
    1: { bg: "bg-amber-50 border-amber-300", text: "text-amber-700", label: "#1" },
    2: { bg: "bg-slate-100 border-slate-300", text: "text-slate-600", label: "#2" },
    3: { bg: "bg-orange-50 border-orange-300", text: "text-orange-700", label: "#3" },
  } as const;
  const c = configs[rank as 1 | 2 | 3];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-bold ${c.bg} ${c.text}`}>
      <RankIcon rank={rank} size={14} />
      <span>{c.label}</span>
    </div>
  );
}
