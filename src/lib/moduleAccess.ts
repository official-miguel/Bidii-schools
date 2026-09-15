/**
 * src/lib/moduleAccess.ts
 *
 * Per-school module switches.
 *
 * Three modules are optional and can be switched on or off per school by a
 * super admin: Library, Finance (fees), and Accommodation. Everything else is
 * core — always present for every school, with no toggle.
 *
 * When a module is switched off the school must not see it anywhere: no nav
 * entry, no dashboard tile, no search result, and any direct URL behaves as if
 * the page was never built (404, not "no permission"). That is achieved by
 * funnelling every check through this file:
 *
 *   • getEffectivePermissions() strips disabled modules, which removes them
 *     from the sidebar, hub pages, dashboards, and every permission-driven
 *     API guard in one move.
 *   • assertModuleEnabled() guards the page layouts (renders 404).
 *   • moduleDisabledResponse() guards role-based API routes that bypass the
 *     permission resolver (Principal / Bursar shortcuts).
 *
 * Default when no toggle row exists: ENABLED. A school that has never been
 * touched by the module manager keeps everything it has today; a module only
 * disappears when a super admin explicitly switches it off.
 */

import { cache } from "react";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import type { Module, SystemModule } from "@prisma/client";
import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────────────────────────
// The optional module set
// ─────────────────────────────────────────────────────────────────────────────

/** The only modules a school can have switched on or off. */
export const OPTIONAL_MODULES = ["LIBRARY", "FEES", "ACCOMMODATION"] as const;

export type OptionalModule = (typeof OPTIONAL_MODULES)[number];

/**
 * RBAC `Module` → `SystemModule`. The toggle rows are keyed by SystemModule,
 * whose finance member is still named FEE_MANAGEMENT.
 */
const SYSTEM_MODULE: Record<OptionalModule, SystemModule> = {
  LIBRARY:       "LIBRARY",
  FEES:          "FEE_MANAGEMENT",
  ACCOMMODATION: "ACCOMMODATION",
};

/** Reverse of SYSTEM_MODULE, for reading toggle rows back. */
const OPTIONAL_MODULE: Partial<Record<SystemModule, OptionalModule>> = {
  LIBRARY:        "LIBRARY",
  FEE_MANAGEMENT: "FEES",
  ACCOMMODATION:  "ACCOMMODATION",
};

/** Display names used by the super-admin module manager. */
export const OPTIONAL_MODULE_LABEL: Record<OptionalModule, string> = {
  LIBRARY:       "Library",
  FEES:          "Finance",
  ACCOMMODATION: "Accommodation",
};

/** One-line description of what each switch controls, for the admin UI. */
export const OPTIONAL_MODULE_DESCRIPTION: Record<OptionalModule, string> = {
  LIBRARY:       "Book catalogue, library cards, borrowing, reservations, and fines.",
  FEES:          "Fee structures, invoicing, payments, M-Pesa, and debtor tracking.",
  ACCOMMODATION: "Dormitories, cubicles, beds, and student boarding allocations.",
};

/** The SystemModule values the toggle grid may write. */
export const TOGGLEABLE_SYSTEM_MODULES: SystemModule[] =
  OPTIONAL_MODULES.map((m) => SYSTEM_MODULE[m]);

export function isOptionalModule(module: Module | string): module is OptionalModule {
  return (OPTIONAL_MODULES as readonly string[]).includes(module);
}

/** Maps an RBAC module to the SystemModule its toggle row uses. */
export function toSystemModule(module: OptionalModule): SystemModule {
  return SYSTEM_MODULE[module];
}

/** Maps a SystemModule back to the RBAC module, when it is a toggleable one. */
export function toOptionalModule(module: SystemModule): OptionalModule | null {
  return OPTIONAL_MODULE[module] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The optional modules currently switched on for a school.
 *
 * Wrapped in React's `cache` so the many guards that run during a single
 * request (layout + nested layouts + the page's own fetches) share one query.
 */
export const getEnabledOptionalModules = cache(
  async (schoolId: string): Promise<Set<OptionalModule>> => {
    // Default: everything on. Rows only ever subtract.
    const enabled = new Set<OptionalModule>(OPTIONAL_MODULES);

    try {
      const rows = await prisma.schoolModuleToggle.findMany({
        where:  { schoolId, module: { in: TOGGLEABLE_SYSTEM_MODULES } },
        select: { module: true, enabled: true },
      });

      for (const row of rows) {
        const optional = toOptionalModule(row.module);
        if (optional && !row.enabled) enabled.delete(optional);
      }
    } catch {
      // Never let a toggle lookup take the app down — fail open to today's
      // behaviour rather than hiding a module the school is actively using.
    }

    return enabled;
  }
);

/** True when `module` is available to this school. Core modules are always true. */
export async function isModuleEnabled(
  schoolId: string | null | undefined,
  module:   Module | string
): Promise<boolean> {
  if (!isOptionalModule(module)) return true;
  if (!schoolId) return true;
  const enabled = await getEnabledOptionalModules(schoolId);
  return enabled.has(module);
}

// ─────────────────────────────────────────────────────────────────────────────
// Enforcement helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Removes every disabled module from a permission set.
 *
 * This is the single point that makes a switched-off module vanish from the
 * sidebar, hub landing pages, dashboards, quick actions, and every route
 * guarded by requirePermission — they all read from the permission resolver.
 */
export async function stripDisabledModules<T extends Partial<Record<Module, unknown>>>(
  schoolId: string | null | undefined,
  perms:    T
): Promise<T> {
  if (!schoolId) return perms;

  const enabled = await getEnabledOptionalModules(schoolId);
  if (enabled.size === OPTIONAL_MODULES.length) return perms;

  const next = { ...perms };
  for (const module of OPTIONAL_MODULES) {
    if (!enabled.has(module)) delete next[module];
  }
  return next;
}

/**
 * Page/layout guard. Renders the 404 page when the module is switched off, so
 * a direct URL is indistinguishable from a route that does not exist.
 */
export async function assertModuleEnabled(
  schoolId: string | null | undefined,
  module:   Module | string
): Promise<void> {
  if (!(await isModuleEnabled(schoolId, module))) notFound();
}

/**
 * API guard. Returns a 404 response when the module is switched off, or null
 * when the route may proceed. 404 rather than 403 — a disabled module should
 * look absent, not forbidden.
 */
export async function moduleDisabledResponse(
  schoolId: string | null | undefined,
  module:   Module | string
): Promise<NextResponse | null> {
  if (await isModuleEnabled(schoolId, module)) return null;
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
