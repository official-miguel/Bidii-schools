"use client";

import { useSchoolBranding } from "./SchoolBrandingProvider";

interface LogoProps {
  className?: string;
  height?: number;
  width?: number;
  alt?: string;
  /**
   * Force the Bidii logo even inside a school's dashboard. Used by the
   * super-admin shell, which is platform chrome rather than a school's.
   */
  forceBidii?: boolean;
}

/**
 * The logo shown in app chrome.
 *
 * A school that has uploaded its own logo gets that logo everywhere inside its
 * dashboards. Schools without one fall back to the Bidii logo, which swaps
 * between light and dark variants based on the theme class on <html>. The
 * dark-safe variant (logo-dark.png) uses a light fill that maintains >= 3:1
 * contrast against the dark card surface (#162233), falling back to the
 * default logo if that asset is missing (Req 11.6).
 *
 * A school logo is a single uploaded image, so it is rendered in both light
 * and dark mode rather than swapped — there is no second asset to swap to.
 */
export function Logo({
  className,
  height = 32,
  width,
  alt = "Bidii",
  forceBidii = false,
}: LogoProps) {
  const { logoUrl, schoolName } = useSchoolBranding();
  const base = className ? ` ${className}` : "";

  // ── School's own logo ──────────────────────────────────────────────────
  if (!forceBidii && logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={schoolName ? `${schoolName} logo` : alt}
        height={height}
        width={width}
        className={`block${base}`}
        onError={(e) => {
          // A broken or deleted upload must not leave a blank header.
          (e.currentTarget as HTMLImageElement).src = "/logo.png";
        }}
      />
    );
  }

  // ── Bidii fallback ─────────────────────────────────────────────────────
  return (
    <>
      {/* Light-mode logo — hidden in dark mode */}
      <img
        src="/logo.png"
        alt={alt}
        height={height}
        width={width}
        className={`block dark:hidden${base}`}
      />
      {/* Dark-mode logo — hidden in light mode */}
      <img
        src="/logo-dark.png"
        alt={alt}
        height={height}
        width={width}
        className={`hidden dark:block${base}`}
        onError={(e) => {
          // Req 11.6: fall back to default logo if dark variant asset is missing
          console.error("[Theme] Dark-safe logo not found; falling back to default");
          (e.currentTarget as HTMLImageElement).src = "/logo.png";
        }}
      />
    </>
  );
}
