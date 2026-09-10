"use client";

/**
 * src/components/SomaAIButton.tsx
 *
 * Soma AI floating action button (FAB).
 *
 * States:
 *   - Idle:      small icon-only circle (Sparkles) — minimal footprint, won't
 *                block content. "Soma" tooltip appears on hover.
 *   - Open:      expands to show "Soma  ✕" label so the user can close it.
 *   - Streaming: pulse ring on the idle circle to signal activity.
 */

import { Sparkles, X } from "lucide-react";
import { useSomaAIStore } from "@/lib/soma-ai/store";

interface Props {
  /** Externally controlled open state (from TopAppBar mutual-exclusion) */
  isOpen: boolean;
  onClick: () => void;
}

export default function SomaAIButton({ isOpen, onClick }: Props) {
  const isStreaming = useSomaAIStore((s) => s.isStreaming);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? "Close Soma AI" : "Open Soma AI"}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      title={isOpen ? undefined : "Soma AI"}
      className={`
        fixed z-40
        bottom-[calc(60px+env(safe-area-inset-bottom,0px)+1.25rem)] md:bottom-5
        right-5
        flex items-center
        rounded-full
        shadow-md hover:shadow-lg
        transition-all duration-200
        select-none
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2
        ${isOpen
          ? "gap-2 h-9 pl-3 pr-3.5 bg-card border border-border text-slate hover:text-foreground"
          : "h-10 w-10 justify-center bg-gradient-to-br from-teal to-teal-dark text-white hover:-translate-y-0.5"
        }
      `}
    >
      {/* Streaming pulse ring — idle only */}
      {isStreaming && !isOpen && (
        <span
          className="absolute inset-0 rounded-full border-2 border-teal-light animate-soma-pulse"
          aria-hidden="true"
        />
      )}

      {/* Icon */}
      <span className="w-4 h-4 flex items-center justify-center shrink-0">
        {isOpen ? (
          <X className="w-3.5 h-3.5" />
        ) : (
          <Sparkles
            className={`w-4 h-4 ${isStreaming ? "animate-soma-spin" : ""}`}
          />
        )}
      </span>

      {/* Label — only visible when open */}
      {isOpen && (
        <span className="text-xs font-semibold leading-none tracking-tight">
          Soma
        </span>
      )}
    </button>
  );
}
