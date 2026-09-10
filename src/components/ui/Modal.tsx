"use client";

/**
 * src/components/ui/Modal.tsx
 *
 * Full-featured portal modal with:
 * - React portal (renders outside the component tree)
 * - Focus trap + restore
 * - Escape key handler
 * - Size variants (sm / md / lg / full)
 * - Optional sticky footer
 * - ConfirmModal variant (success / danger flavours)
 * - ModalFooter helper
 */

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, ReactNode } from "react";
import { X, AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import { primaryButtonClass, secondaryButtonClass, dangerButtonClass } from "@/components/ui";

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "full";
  footer?: ReactNode;
  children: ReactNode;
  closeOnBackdrop?: boolean;
}

export const Modal = ({
  open,
  onClose,
  title,
  description,
  size = "md",
  footer,
  children,
  closeOnBackdrop = true,
}: ModalProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedEl = useRef<HTMLElement | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => { setRendered(true); }, []);

  // Save / restore focus
  useEffect(() => {
    if (!open) return;
    previouslyFocusedEl.current = document.activeElement as HTMLElement;
    return () => { previouslyFocusedEl.current?.focus(); };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !contentRef.current) return;
    const focusable = contentRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    const trap = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", trap);
    requestAnimationFrame(() => first?.focus());
    return () => document.removeEventListener("keydown", trap);
  }, [open]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open || !rendered) return null;

  const sizeClass: Record<string, string> = {
    sm:   "max-w-sm",
    md:   "max-w-md",
    lg:   "max-w-lg",
    full: "max-w-full w-full",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-8 sm:py-12 modal-backdrop bg-ink/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && closeOnBackdrop) onClose();
      }}
    >
      <div
        ref={contentRef}
        className={`relative z-50 w-full ${sizeClass[size]} rounded-2xl bg-card border border-border shadow-xl modal-content flex flex-col`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "portal-modal-title" : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {title && (
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-border shrink-0">
            <div className="min-w-0">
              <h2
                id="portal-modal-title"
                className="text-base font-semibold text-foreground leading-snug"
              >
                {title}
              </h2>
              {description && (
                <p className="mt-1 text-sm text-slate leading-relaxed">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex items-center justify-center h-8 w-8 rounded-lg text-slate hover:text-foreground hover:bg-background transition-colors shrink-0 -mr-1 -mt-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 border-t border-border bg-background px-6 py-4 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

Modal.displayName = "Modal";

// ── ModalFooter ───────────────────────────────────────────────────────────────

export const ModalFooter = ({ children, align = "end" }: { children: ReactNode; align?: "start" | "end" | "between" }) => {
  const alignClass = { start: "justify-start", end: "justify-end", between: "justify-between" }[align];
  return <div className={`flex items-center gap-3 ${alignClass}`}>{children}</div>;
};

ModalFooter.displayName = "ModalFooter";

// ── ConfirmModal ──────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export const ConfirmModal = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  loading = false,
}: ConfirmModalProps) => {
  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex flex-col items-center text-center gap-4 py-2">
        {/* Icon */}
        <div
          className={`flex items-center justify-center h-12 w-12 rounded-full ${
            danger ? "bg-danger-bg" : "bg-teal-50"
          }`}
        >
          {danger ? (
            <Trash2 className="h-5 w-5 text-danger" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-teal" aria-hidden="true" />
          )}
        </div>

        {/* Title + message */}
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-1.5 text-sm text-slate leading-relaxed max-w-xs">{message}</p>
        </div>

        {/* Warn callout for destructive actions */}
        {danger && (
          <div className="w-full flex items-center gap-2 rounded-lg bg-danger-bg border border-danger/15 text-danger text-xs px-3 py-2.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>This action cannot be undone.</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex w-full gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 ${secondaryButtonClass}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 ${danger ? dangerButtonClass : primaryButtonClass}`}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

ConfirmModal.displayName = "ConfirmModal";
