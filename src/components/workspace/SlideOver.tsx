"use client";

/**
 * SlideOver — drawer component for in-workspace interactions.
 *
 * Slides in from the right. Sizes: sm 384px / md 512px / lg 640px / xl 768px / full.
 * Sticky header + sticky footer (via footer prop) with scrollable body in between.
 * Smooth slide-in animation, backdrop blur, Escape key + backdrop click close.
 */

import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  children: ReactNode;
  footer?: ReactNode;
}

export default function SlideOver({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
}: SlideOverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape key close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const sizeClasses: Record<string, string> = {
    sm:   "max-w-sm",
    md:   "max-w-md",
    lg:   "max-w-lg",
    xl:   "max-w-xl",
    full: "max-w-full",
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      aria-labelledby="slide-over-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/35 backdrop-blur-sm drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 flex max-w-full">
        <div
          ref={panelRef}
          className={`relative w-screen ${sizeClasses[size]} drawer-panel`}
        >
          <div className="flex h-full flex-col bg-card border-l border-border shadow-2xl">

            {/* ── Sticky header ── */}
            <div className="shrink-0 border-b border-border bg-background px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2
                    id="slide-over-title"
                    className="text-base font-semibold text-foreground tracking-tight"
                  >
                    {title}
                  </h2>
                  {description && (
                    <p className="mt-1 text-sm text-slate leading-relaxed">
                      {description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate hover:text-foreground hover:bg-line transition-colors shrink-0 -mt-0.5 -mr-1"
                  aria-label="Close panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* ── Scrollable content ── */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-6 py-6 space-y-6">{children}</div>
            </div>

            {/* ── Sticky footer ── */}
            {footer && (
              <div className="shrink-0 border-t border-border bg-background px-6 py-4">
                {footer}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

interface SectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

function SlideOverSection({ title, description, children, className = "" }: SectionProps) {
  return (
    <div className={className}>
      {(title || description) && (
        <div className="mb-4">
          {title && (
            <h3 className="text-xs font-semibold text-slate uppercase tracking-wide">
              {title}
            </h3>
          )}
          {description && (
            <p className="mt-1 text-sm text-slate leading-relaxed">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

SlideOver.Section = SlideOverSection;

// ── Field (label + value pair) ────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: ReactNode;
  className?: string;
}

function SlideOverField({ label, value, className = "" }: FieldProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <dt className="text-xs font-medium text-slate uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{value || <span className="text-slate/50">—</span>}</dd>
    </div>
  );
}

SlideOver.Field = SlideOverField;

// ── Actions ───────────────────────────────────────────────────────────────────

interface ActionsProps {
  children: ReactNode;
  align?: "left" | "right" | "between";
}

function SlideOverActions({ children, align = "right" }: ActionsProps) {
  const alignClasses = {
    left:    "justify-start",
    right:   "justify-end",
    between: "justify-between",
  };
  return (
    <div className={`flex items-center gap-3 ${alignClasses[align]}`}>
      {children}
    </div>
  );
}

SlideOver.Actions = SlideOverActions;
