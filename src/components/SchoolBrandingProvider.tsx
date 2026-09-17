"use client";

/**
 * School branding context.
 *
 * Carries the signed-in school's own logo so every dashboard chrome component
 * (sidebar, mobile drawer, top bar, parent portal) shows it without each one
 * having to thread a prop down from its layout.
 *
 * Deliberately a context rather than a prop: <Logo /> appears in nine places,
 * and the two that must NOT be re-branded — the login screens and the
 * super-admin shell — simply render outside any provider and fall back to the
 * Bidii logo on their own.
 */

import { createContext, useContext } from "react";

export interface SchoolBranding {
  /** The school's uploaded logo, or null when it has not set one. */
  logoUrl:    string | null;
  /** The school's name, used as the logo's alt text. */
  schoolName: string | null;
}

const SchoolBrandingContext = createContext<SchoolBranding>({
  logoUrl:    null,
  schoolName: null,
});

export function useSchoolBranding(): SchoolBranding {
  return useContext(SchoolBrandingContext);
}

export function SchoolBrandingProvider({
  logoUrl,
  schoolName,
  children,
}: SchoolBranding & { children: React.ReactNode }) {
  return (
    <SchoolBrandingContext.Provider value={{ logoUrl, schoolName }}>
      {children}
    </SchoolBrandingContext.Provider>
  );
}
