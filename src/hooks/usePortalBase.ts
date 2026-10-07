"use client";

import { usePathname } from "next/navigation";

export type PortalBase = "/principal" | "/teacher" | "/staff";

/**
 * The portal the current page lives in, read from the URL.
 *
 * Shared components (discipline list, calendar, analytics, ...) render under
 * more than one portal. Hard-coding "/principal/..." in their links sent
 * teachers and staff to a layout that only admits the Principal, which
 * bounced them to /login and looked like a spontaneous logout. Building links
 * from this base keeps every click inside the portal the user is already in.
 *
 * Falls back to "/principal" outside the three portals, matching the old
 * hard-coded links.
 */
export function portalBaseFromPath(pathname: string | null): PortalBase {
  const first = pathname?.split("/")[1];
  if (first === "teacher") return "/teacher";
  if (first === "staff")   return "/staff";
  return "/principal";
}

export function usePortalBase(): PortalBase {
  return portalBaseFromPath(usePathname());
}

/**
 * Maps a principal-portal link onto the portal a shared screen is rendered
 * in, so a screen written for /principal can be reused elsewhere without
 * sending anyone into the principal layout (which bounces non-principals).
 *
 *  /staff:   same path under /staff; per-person staff pages → the directory,
 *            school settings (principal-only) → the staff dashboard.
 *  /teacher: dorm pages → the teacher's dorm views, staff pages → People,
 *            school settings → the teacher dashboard.
 */
export function rebaseHref(href: string, portal: PortalBase): string {
  if (portal === "/principal" || !href.startsWith("/principal/")) return href;
  const rest = href.slice("/principal".length);

  if (portal === "/staff") {
    if (rest.startsWith("/staff/"))   return "/staff/directory";
    if (rest.startsWith("/settings")) return "/staff";
    return `/staff${rest}`;
  }

  if (rest.startsWith("/accommodation/dormitories/")) {
    return `/teacher/accommodation-details${rest.slice("/accommodation".length)}`;
  }
  if (rest.startsWith("/accommodation")) return "/teacher/accommodation-details";
  if (rest.startsWith("/staff/"))        return "/teacher/people";
  if (rest.startsWith("/settings"))      return "/teacher";
  return `/teacher${rest}`;
}

export function usePortalHref(): (href: string) => string {
  const portal = usePortalBase();
  return (href: string) => rebaseHref(href, portal);
}

/**
 * Root of the read-only dorm views (overview, dorm detail, analytics), which
 * the teacher and staff portals share under different paths.
 */
export function useAccommodationViewBase(): string {
  return usePortalBase() === "/staff" ? "/staff/accommodation" : "/teacher/accommodation-details";
}
