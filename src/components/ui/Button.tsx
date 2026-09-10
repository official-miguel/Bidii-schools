"use client";

import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "royal" | "ghost" | "outline" | "teal";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      loading,
      leftIcon,
      rightIcon,
      fullWidth,
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const variants: Record<string, string> = {
      // Teal / brand primary — used for all main CTAs
      primary:   "bg-teal text-white hover:bg-teal-dark focus:ring-teal/30 shadow-xs",
      teal:      "bg-teal text-white hover:bg-teal-dark focus:ring-teal/30 shadow-xs",
      royal:     "bg-teal text-white hover:bg-teal-dark focus:ring-teal/30 shadow-xs",
      // Ghost outlined
      secondary: "bg-card text-foreground border border-border hover:bg-background hover:border-slate-light focus:ring-teal/20",
      outline:   "bg-transparent border border-border text-foreground hover:bg-background hover:border-slate-light focus:ring-teal/20",
      // Destructive
      danger:    "bg-danger text-white hover:bg-red-600 focus:ring-danger/30 shadow-xs",
      // Subtle / text
      ghost:     "text-foreground hover:bg-background focus:ring-teal/20",
    };

    const sizes: Record<string, string> = {
      xs: "px-2.5 py-1.5 text-xs gap-1.5",
      sm: "px-3   py-2   text-xs gap-1.5",
      md: "px-4   py-2.5 text-sm gap-2",
      lg: "px-5   py-3   text-sm gap-2",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-100",
          "focus:outline-none focus:ring-2 focus:ring-offset-2",
          "active:scale-[0.98]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
          variants[variant],
          sizes[size],
          fullWidth ? "w-full" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />}
        {!loading && leftIcon && <span className="shrink-0" aria-hidden="true">{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span className="shrink-0" aria-hidden="true">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
