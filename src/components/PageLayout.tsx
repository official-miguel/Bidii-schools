/**
 * PageLayout — standardized page structure for all authenticated pages.
 *
 * Stage 9 responsive changes:
 *  - Title row stacks vertically on mobile (flex-col), side-by-side on sm+
 *  - Primary action button moves below title on mobile, beside it on sm+
 *  - Page padding: px-4 mobile → px-6 sm → px-10 lg
 *  - Page header top padding: py-4 mobile → py-6 sm+
 *  - Search min-w: 0 (full-width) mobile → min-w-[220px] sm+
 *  - Filter bar wraps naturally; each filter can go full-width on mobile
 */

import { ReactNode } from "react";

export interface PageAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
  icon?: ReactNode;
}

interface Props {
  title: string;
  description?: string;
  primaryAction?: PageAction;
  actions?: PageAction[];
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filters?: ReactNode;
  contextNav?: ReactNode;
  children: ReactNode;
  maxWidth?: "4xl" | "5xl" | "6xl" | "7xl" | "full";
  headerActions?: ReactNode;
}

const MAX_WIDTH_MAP = {
  "4xl":  "max-w-4xl",
  "5xl":  "max-w-5xl",
  "6xl":  "max-w-6xl",
  "7xl":  "max-w-7xl",
  "full": "max-w-full",
};

export default function PageLayout({
  title,
  description,
  primaryAction,
  actions = [],
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters,
  contextNav,
  children,
  maxWidth = "7xl",
  headerActions,
}: Props) {
  const hasToolBar = searchPlaceholder || filters || actions.length > 0 || headerActions;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Sticky Page Header ─────────────────────────────────────────── */}
      <header
        className="sticky top-16 z-20 bg-card border-b border-border"
      >
        <div className={`mx-auto px-4 sm:px-6 py-4 sm:py-6 lg:px-10 ${MAX_WIDTH_MAP[maxWidth]}`}>

          {/* Title row — stacks on mobile, side-by-side on sm+ */}
          <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-semibold text-foreground leading-tight">
                {title}
              </h1>
              {description && (
                <p className="text-sm text-slate mt-1 sm:mt-1.5 leading-relaxed">
                  {description}
                </p>
              )}
            </div>

            {/* Primary action — full-width on mobile, auto on sm+ */}
            {primaryAction && (
              <div className="xs:shrink-0">
                <ActionButton
                  action={primaryAction}
                  variant={primaryAction.variant ?? "primary"}
                  fullWidthMobile
                />
              </div>
            )}
          </div>

          {/* Search / filters / actions toolbar */}
          {hasToolBar && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Search — full-width on mobile, constrained on sm+ */}
              {searchPlaceholder && (
                <div className="w-full sm:flex-1 sm:min-w-[220px] sm:max-w-sm">
                  <input
                    type="search"
                    placeholder={searchPlaceholder}
                    value={searchValue ?? ""}
                    onChange={(e) => onSearchChange?.(e.target.value)}
                    className="w-full h-11 sm:h-9 px-3.5 rounded-lg border border-border
                               bg-card text-sm text-foreground placeholder:text-slate
                               focus:outline-none focus:ring-2 focus:ring-teal/20 focus:border-teal
                               transition-colors"
                  />
                </div>
              )}

              {/* Filters — wrap naturally */}
              {filters && (
                <div className="flex flex-wrap items-center gap-2">
                  {filters}
                </div>
              )}

              {/* Additional actions */}
              {actions.map((action, i) => (
                <ActionButton key={i} action={action} variant={action.variant ?? "secondary"} />
              ))}

              {/* Custom header actions */}
              {headerActions}
            </div>
          )}
        </div>

        {/* Context navigation */}
        {contextNav && (
          <div className={`mx-auto px-4 sm:px-6 lg:px-10 ${MAX_WIDTH_MAP[maxWidth]}`}>
            {contextNav}
          </div>
        )}
      </header>

      {/* ── Scrollable Content ──────────────────────────────────────────── */}
      <main className="flex-1">
        <div className={`mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:px-10 ${MAX_WIDTH_MAP[maxWidth]}`}>
          {children}
        </div>
      </main>
    </div>
  );
}

/* ── ActionButton subcomponent ── */
function ActionButton({
  action,
  variant,
  fullWidthMobile = false,
}: {
  action: PageAction;
  variant: "primary" | "secondary" | "ghost";
  fullWidthMobile?: boolean;
}) {
  const baseClasses = `
    inline-flex items-center justify-center gap-2 px-4 h-11 sm:h-9 rounded-lg
    text-sm font-medium transition-colors duration-100
    ${fullWidthMobile ? "w-full xs:w-auto" : ""}
  `;

  const variantClasses = {
    primary: `
      bg-teal text-white hover:bg-teal-dark active:bg-teal-dark
      shadow-sm
    `,
    secondary: `
      bg-card text-slate border border-border
      hover:bg-teal-50 hover:text-teal hover:border-teal/40
     
    `,
    ghost: `
      text-slate hover:bg-teal-50 hover:text-teal
    `,
  };

  const Tag = action.href ? "a" : "button";

  return (
    <Tag
      {...(action.href ? { href: action.href } : {})}
      {...(!action.href ? { type: "button" as const, onClick: action.onClick } : {})}
      className={`${baseClasses} ${variantClasses[variant]}`}
    >
      {action.icon}
      <span>{action.label}</span>
    </Tag>
  );
}
