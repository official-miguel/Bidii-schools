/**
 * src/components/ui.tsx
 *
 * Design-system primitive class strings and micro-components.
 * All class names reference the teal design tokens in tailwind.config.ts.
 */

import React from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

// ── Form primitives ───────────────────────────────────────────────────────────

export const inputClass =
  "w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-base sm:text-sm text-ink " +
  "placeholder:text-slate-light " +
  "focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 " +
  "hover:border-slate-light " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-paper " +
  "transition-colors duration-100";

export const labelClass =
  "block text-sm font-medium text-ink mb-1.5 leading-none";

export const helperClass =
  "mt-1.5 text-xs text-slate leading-relaxed";

export const errorTextClass =
  "mt-1.5 text-xs text-danger leading-relaxed flex items-center gap-1";

export const successTextClass =
  "mt-1.5 text-xs text-success leading-relaxed flex items-center gap-1";

// ── Button primitives ─────────────────────────────────────────────────────────

/** Teal primary — main CTA */
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 " +
  "rounded-lg bg-teal text-white text-sm font-medium px-4 py-2.5 min-h-[44px] sm:min-h-0 " +
  "hover:bg-teal-dark active:scale-[0.98] transition-all duration-100 " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:ring-offset-2 " +
  "shadow-xs";

/** Outlined secondary */
export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 " +
  "rounded-lg border border-line bg-white text-sm font-medium px-4 py-2.5 min-h-[44px] sm:min-h-0 text-ink " +
  "hover:bg-paper hover:border-slate-light active:scale-[0.98] transition-all duration-100 " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 " +
  "focus:outline-none focus:ring-2 focus:ring-teal/20 focus:ring-offset-2";

/** Danger destructive button */
export const dangerButtonClass =
  "inline-flex items-center justify-center gap-2 " +
  "rounded-lg bg-danger text-white text-sm font-medium px-4 py-2.5 min-h-[44px] sm:min-h-0 " +
  "hover:bg-red-600 active:scale-[0.98] transition-all duration-100 " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 " +
  "focus:outline-none focus:ring-2 focus:ring-danger/30 focus:ring-offset-2 " +
  "shadow-xs";

/** Danger text link */
export const dangerLinkClass =
  "text-danger text-sm font-medium hover:text-red-600 hover:underline transition-colors duration-100";

/** Royal/teal alias — kept for backwards compat */
export const royalButtonClass = primaryButtonClass;

/** Card shell used by principal-portal sections */
export const royalCardClass =
  "bg-white border border-line rounded-xl shadow-sm";

// ── FormField ─────────────────────────────────────────────────────────────────
// Wraps label + input + helper/error text as a single composable unit.

interface FormFieldProps {
  label: string;
  required?: boolean;
  helper?: string;
  error?: string;
  success?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  required,
  helper,
  error,
  success,
  children,
  className = "",
}: FormFieldProps) {
  return (
    <div className={className}>
      <label className={labelClass}>
        {label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden="true">*</span>
        )}
      </label>
      {children}
      {error && (
        <p className={errorTextClass} role="alert">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {success && !error && (
        <p className={successTextClass}>
          <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
          {success}
        </p>
      )}
      {helper && !error && !success && (
        <p className={helperClass}>{helper}</p>
      )}
    </div>
  );
}

// ── FormSection ────────────────────────────────────────────────────────────────
// Card-based section grouping for multi-section forms.

interface FormSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({
  title,
  description,
  children,
  className = "",
}: FormSectionProps) {
  return (
    <div className={`form-section ${className}`}>
      {(title || description) && (
        <div className={title ? "form-section-title" : "mb-3"}>
          {title && <span>{title}</span>}
          {description && !title && (
            <p className="text-xs text-slate">{description}</p>
          )}
        </div>
      )}
      {description && title && (
        <p className="text-xs text-slate -mt-2 mb-3 leading-relaxed">{description}</p>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ── FormGrid ───────────────────────────────────────────────────────────────────

export function FormGrid({
  cols = 2,
  children,
  className = "",
}: {
  cols?: 2 | 3;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-4 ${cols === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"} ${className}`}
    >
      {children}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

type BadgeVariant = "default" | "success" | "warn" | "danger" | "info" | "teal";

export function Badge({
  children,
  variant = "default",
  className = "",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  const variantClasses: Record<BadgeVariant, string> = {
    default: "bg-line text-ink",
    teal:    "bg-teal-50 text-teal-dark",
    success: "bg-success-bg text-success",
    warn:    "bg-warn-bg text-warn",
    danger:  "bg-danger-bg text-danger",
    info:    "bg-info-bg text-info",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-3 mb-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl sm:text-2xl font-semibold text-ink tracking-tight dark:text-dark-text">{title}</h1>
        {description && (
          <p className="text-slate text-sm mt-1 leading-relaxed dark:text-dark-muted">{description}</p>
        )}
      </div>
      {action && <div className="xs:shrink-0">{action}</div>}
    </div>
  );
}

// ── Section heading (within a page) ──────────────────────────────────────────

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="text-slate text-sm mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function Card({
  children,
  className = "",
  padding = true,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={`bg-card border border-line rounded-xl shadow-sm ${padding ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────

export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3 animate-slide-down"
    >
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 leading-relaxed">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity
                     -mr-1 p-1.5 rounded-md hover:bg-danger/10 min-w-[36px] min-h-[36px]
                     flex items-center justify-center"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Success banner ────────────────────────────────────────────────────────────

export function SuccessBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg bg-success-bg border border-success/20 text-success text-sm px-4 py-3 animate-slide-down"
    >
      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 leading-relaxed">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity
                     -mr-1 p-1.5 rounded-md hover:bg-success/10 min-w-[36px] min-h-[36px]
                     flex items-center justify-center"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Warning banner ────────────────────────────────────────────────────────────

export function WarnBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg bg-warn-bg border border-warn/20 text-warn text-sm px-4 py-3 animate-slide-down"
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 leading-relaxed">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity
                     -mr-1 p-1.5 rounded-md hover:bg-warn/10 min-w-[36px] min-h-[36px]
                     flex items-center justify-center"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Info banner ───────────────────────────────────────────────────────────────

export function InfoBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg bg-info-bg border border-info/20 text-info text-sm px-4 py-3 animate-slide-down"
    >
      <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 leading-relaxed">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity
                     -mr-1 p-1.5 rounded-md hover:bg-info/10 min-w-[36px] min-h-[36px]
                     flex items-center justify-center"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({
  message,
  action,
  icon,
}: {
  message: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line px-6 py-14 text-center">
      {icon && (
        <div className="flex items-center justify-center h-12 w-12 rounded-full bg-paper text-slate">
          {icon}
        </div>
      )}
      <p className="text-sm text-slate max-w-xs leading-relaxed">{message}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

// ── Loading spinner ───────────────────────────────────────────────────────────

export function Spinner({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = { sm: "h-4 w-4 border-[1.5px]", md: "h-5 w-5 border-2", lg: "h-7 w-7 border-2" };
  return (
    <span
      aria-label="Loading"
      className={`inline-block rounded-full border-teal border-t-transparent animate-spin ${sizeClasses[size]} ${className}`}
    />
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Divider({ className = "", label }: { className?: string; label?: string }) {
  if (label) {
    return (
      <div className={`flex items-center gap-3 my-4 ${className}`}>
        <hr className="flex-1 border-line" />
        <span className="text-xs text-slate font-medium">{label}</span>
        <hr className="flex-1 border-line" />
      </div>
    );
  }
  return <hr className={`border-line my-4 ${className}`} />;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
  highlight,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <p className={`text-2xl font-semibold ${highlight ? "text-danger" : "text-ink"}`}>
        {value}
      </p>
      <p className="text-slate text-xs mt-1">{label}</p>
      {sub && <p className="text-slate/70 text-xs">{sub}</p>}
    </>
  );

  const base = `rounded-xl border p-4 transition-all duration-150 ${
    highlight ? "border-danger/20 bg-danger-bg/40" : "bg-card border-line"
  }`;

  if (href) {
    return (
      <a href={href} className={`block ${base} hover:border-teal/40 hover:-translate-y-0.5 hover:shadow-sm`}>
        {inner}
      </a>
    );
  }

  return <div className={base}>{inner}</div>;
}

// ── Table helpers ─────────────────────────────────────────────────────────────

export const tableClass =
  "w-full text-sm border-collapse";

export const theadClass =
  "border-b border-line text-left text-xs font-semibold text-slate uppercase tracking-wide bg-paper/60";

export const thClass =
  "px-4 py-3 font-semibold";

export const tdClass =
  "px-4 py-3";

export const trClass =
  "border-b border-line last:border-0 hover:bg-paper/50 transition-colors";

// ── Premium Table Components ──────────────────────────────────────────────────

export const premiumTableContainerClass =
  "bg-white border border-line rounded-xl overflow-hidden shadow-sm";

export const premiumTheadClass =
  "sticky top-0 z-10 bg-white border-b border-line text-left text-xs font-semibold text-slate uppercase tracking-wide";

export const premiumThClass =
  "px-5 py-4 font-semibold whitespace-nowrap";

export const premiumTdClass =
  "px-5 py-4";

export const premiumTrClass =
  "border-b border-line last:border-0 hover:bg-slate-50/50 transition-colors";

// ── Avatar Component ──────────────────────────────────────────────────────────

export function Avatar({
  name,
  photoUrl,
  size = "md",
  className = "",
}: {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  };

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        title={name}
        className={`${sizeClasses[size]} rounded-full object-cover border border-line shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-teal/10 to-royal/10 border border-line flex items-center justify-center font-semibold text-ink shrink-0 ${className}`}
      title={name}
    >
      {initials}
    </div>
  );
}

// ── Status Dot ────────────────────────────────────────────────────────────────

export function StatusDot({
  variant = "default",
  className = "",
  pulse = false,
}: {
  variant?: "success" | "danger" | "warn" | "info" | "default";
  className?: string;
  pulse?: boolean;
}) {
  const variantClasses = {
    success: "bg-success",
    danger:  "bg-danger",
    warn:    "bg-warn",
    info:    "bg-info",
    default: "bg-slate",
  };

  return (
    <span className={`relative inline-flex ${className}`} aria-hidden="true">
      {pulse && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${variantClasses[variant]}`}
        />
      )}
      <span
        className={`relative inline-block h-2 w-2 rounded-full ${variantClasses[variant]}`}
      />
    </span>
  );
}

// ── Action Icon Button ────────────────────────────────────────────────────────

export function ActionIconButton({
  icon,
  label,
  onClick,
  variant = "default",
  disabled = false,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  const variantClasses =
    variant === "danger"
      ? "text-slate hover:text-danger hover:bg-danger-bg/40"
      : "text-slate hover:text-ink hover:bg-slate-50";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center
                  h-11 w-11 sm:h-8 sm:w-8
                  rounded-md transition-all duration-100
                  active:scale-95
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${variantClasses} ${className}`}
    >
      {icon}
    </button>
  );
}

// ── Chip Component ────────────────────────────────────────────────────────────

export function Chip({
  children,
  variant = "default",
  size = "sm",
  className = "",
  icon,
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warn" | "danger" | "info" | "teal" | "purple";
  size?: "xs" | "sm";
  className?: string;
  icon?: React.ReactNode;
}) {
  const variantClasses: Record<string, string> = {
    default: "bg-slate-100 text-slate-700 border-slate-200",
    teal:    "bg-teal-50 text-teal-700 border-teal-200",
    success: "bg-success-bg text-success border-success/20",
    warn:    "bg-warn-bg text-warn border-warn/20",
    danger:  "bg-danger-bg text-danger border-danger/20",
    info:    "bg-info-bg text-info border-info/20",
    purple:  "bg-purple-50 text-purple-700 border-purple-200",
  };

  const sizeClasses = {
    xs: "px-1.5 py-0.5 text-[10px] leading-tight",
    sm: "px-2 py-0.5 text-xs",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

export function ProgressBar({
  value,
  max = 100,
  size = "md",
  variant = "teal",
  showLabel = false,
  animated = false,
  className = "",
}: {
  value: number;
  max?: number;
  size?: "sm" | "md";
  variant?: "teal" | "success" | "warn" | "danger";
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const sizeClasses = { sm: "h-1.5", md: "h-2" };

  const variantClasses = {
    teal:    "bg-teal",
    success: "bg-success",
    warn:    "bg-warn",
    danger:  "bg-danger",
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex-1 bg-slate-100 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`h-full rounded-full ${animated ? "transition-all duration-500" : ""} ${variantClasses[variant]}`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-slate tabular-nums shrink-0 w-9 text-right">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}

// ── Toggle Switch ─────────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:ring-offset-2 ${
          checked ? "bg-teal" : "bg-line"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
      {(label || description) && (
        <div className="min-w-0">
          {label && <p className="text-sm font-medium text-ink leading-none">{label}</p>}
          {description && <p className="text-xs text-slate mt-0.5 leading-relaxed">{description}</p>}
        </div>
      )}
    </label>
  );
}

// ── Credential reveal box ─────────────────────────────────────────────────────
// Used when login credentials are generated for a new staff member.

export function CredentialBox({
  email,
  password,
  onDismiss,
}: {
  email: string;
  password: string;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-xl bg-success-bg border border-success/20 text-success text-sm px-5 py-4 space-y-3 animate-slide-down">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <span className="font-semibold">Login credentials created</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-success/70 font-medium uppercase tracking-wide mb-1">Email</p>
          <p className="font-mono text-xs bg-white/60 rounded-md px-2 py-1.5 break-all">{email}</p>
        </div>
        <div>
          <p className="text-xs text-success/70 font-medium uppercase tracking-wide mb-1">Temporary password</p>
          <p className="font-mono text-xs bg-white/60 rounded-md px-2 py-1.5 break-all">{password}</p>
        </div>
      </div>
      <p className="text-xs text-success/70 leading-relaxed">
        Share these directly — the password won&apos;t be shown again. They&apos;ll be prompted to change it on first login.
      </p>
    </div>
  );
}
