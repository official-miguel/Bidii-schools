"use client";

/**
 * TopBar — module name + active period badge + user info strip.
 * Sits at the top of assessment layouts (principal & teacher).
 * Accepts the current period name/year as a prop (resolved server-side).
 */

export interface TopBarProps {
  moduleName?: string;
  periodLabel?: string | null;  // e.g. "Term 1 — 2026"
  userName: string;
  roleLabel: string;
}

export default function TopBar({
  moduleName = "Exams & Analysis",
  periodLabel,
  userName,
  roleLabel,
}: TopBarProps) {
  return (
    <div className="w-full flex items-center justify-between gap-4 px-6 py-3 bg-card border-b border-border sticky top-0 z-30">
      {/* Left: module name + active period */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-display font-semibold text-foreground text-sm truncate">
          {moduleName}
        </span>
        {periodLabel && (
          <>
            <span className="text-line select-none">·</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-royal/10 text-royal font-medium truncate">
              {periodLabel}
            </span>
          </>
        )}
      </div>

      {/* Right: user name + role badge */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-slate hidden sm:block truncate max-w-[160px]">
          {userName}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-line text-foreground font-medium whitespace-nowrap">
          {roleLabel}
        </span>
      </div>
    </div>
  );
}
