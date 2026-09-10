"use client";

/**
 * Modal — primary modal component used throughout the application.
 *
 * Stage 9 responsive changes:
 *   - Mobile (<sm): renders as a bottom-sheet that slides up from the bottom
 *     of the viewport, with rounded top corners and safe-area bottom padding.
 *     Drag handle bar at top for visual affordance.
 *   - sm+: existing centred dialog behaviour, unchanged.
 *
 * All other behaviour preserved:
 *   - Escape key + backdrop click close
 *   - Body scroll lock
 *   - Scrollable body, sticky footer
 *   - size prop controls max-width on sm+ (bottom sheet is always full-width)
 */

import { ReactNode, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  disableBackdropClose?: boolean;
}

export default function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = "lg",
  disableBackdropClose = false,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Closing animation state ─────────────────────────────────────────────
  const [isClosing, setIsClosing] = useState(false);

  function startClose() {
    setIsClosing(true);
    // Wait for the exit animation before calling onClose
    const t = setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 260);
    return () => clearTimeout(t);
  }

  // ── Escape key ──────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") startClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Body scroll lock ────────────────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Swipe-to-dismiss on mobile (drag handle only) ───────────────────────
  // Attached only to the drag handle bar — NOT the whole sheet — so that
  // taps on buttons/inputs inside the modal are never swallowed.
  const touchStartY = useRef(0);
  const SWIPE_DOWN_THRESHOLD = 80;

  function onHandleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }

  function onHandleTouchEnd(e: React.TouchEvent) {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > SWIPE_DOWN_THRESHOLD) startClose();
  }

  const sizeClasses: Record<string, string> = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-2xl",
  };

  return (
    <div
      className={`fixed inset-0 z-50 modal-backdrop bg-ink/40 backdrop-blur-sm
                  transition-opacity duration-260
                  ${isClosing ? "opacity-0" : "opacity-100"}`}
      onClick={(e) => {
        if (!disableBackdropClose && e.target === e.currentTarget) startClose();
      }}
    >
      {/* ── sm+: centred dialog ─────────────────────────────────────── */}
      <div
        className="hidden sm:flex items-start justify-center
                   overflow-y-auto px-4 py-8 sm:py-12 h-full"
        onClick={(e) => {
          if (!disableBackdropClose && e.target === e.currentTarget) startClose();
        }}
      >
        <div
          ref={contentRef}
          className={`
            relative w-full ${sizeClasses[size]} rounded-2xl
            bg-card border border-border shadow-xl flex flex-col
            ${isClosing ? "opacity-0 scale-95" : "modal-content"}
            transition-[opacity,transform] duration-200
          `}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <ModalInner
            title={title}
            description={description}
            footer={footer}
            onClose={startClose}
          >
            {children}
          </ModalInner>
        </div>
      </div>

      {/* ── Mobile: bottom sheet ────────────────────────────────────── */}
      <div className="sm:hidden absolute inset-x-0 bottom-0 flex flex-col">
        <div
          ref={contentRef}
          className={`
            relative w-full rounded-t-2xl
            bg-card border-t border-border shadow-xl flex flex-col
            max-h-[92dvh]
            ${isClosing ? "sheet-exit" : "sheet-enter"}
          `}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={(e) => e.stopPropagation()}
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {/* Drag handle — only this area triggers swipe-to-dismiss */}
          <div
            className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing"
            onTouchStart={onHandleTouchStart}
            onTouchEnd={onHandleTouchEnd}
            aria-hidden="true"
          >
            <div className="w-10 h-1 rounded-full bg-line" />
          </div>

          <ModalInner
            title={title}
            description={description}
            footer={footer}
            onClose={startClose}
          >
            {children}
          </ModalInner>
        </div>
      </div>
    </div>
  );
}

// ── Shared inner content ─────────────────────────────────────────────────

function ModalInner({
  title,
  description,
  children,
  footer,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4
                      border-b border-border shrink-0">
        <div className="min-w-0">
          <h2
            id="modal-title"
            className="text-base font-semibold text-foreground leading-snug"
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
          aria-label="Close"
          className="flex items-center justify-center h-11 w-11 sm:h-8 sm:w-8
                     rounded-lg text-slate hover:text-foreground hover:bg-background
                     transition-colors shrink-0 -mr-2 -mt-1
                    "
        >
          <X className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>
      </div>

      {/* Body (scrollable) */}
      <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
        {children}
      </div>

      {/* Footer (sticky) */}
      {footer && (
        <div className="shrink-0 border-t border-border bg-background px-6 py-4
                        rounded-b-2xl">
          {footer}
        </div>
      )}
    </>
  );
}
