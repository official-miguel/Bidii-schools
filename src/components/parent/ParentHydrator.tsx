"use client";

/**
 * src/components/parent/ParentHydrator.tsx
 *
 * Invisible client component placed in the parent layout.
 * Fetches the authenticated parent's linked children from the server on mount
 * and seeds the Zustand parent store so all child portal pages have access to
 * the child list without each page making its own request.
 *
 * Requirements: 3.3
 */

import { useEffect } from "react";
import { useParentStore } from "@/lib/stores/parentStore";
import type { ChildSummary } from "@/lib/stores/parentStore";

export default function ParentHydrator() {
  const setChildren = useParentStore((s) => s.setChildren);
  const setHydrated = useParentStore((s) => s.setHydrated);

  useEffect(() => {
    fetch("/api/parent/me/children")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load children");
        return res.json() as Promise<ChildSummary[]>;
      })
      .then((children) => {
        setChildren(children);
        setHydrated(true);
      })
      .catch(() => {
        // Even on error, mark as hydrated so the UI doesn't stay in a
        // perpetual loading state.
        setHydrated(true);
      });
  }, [setChildren, setHydrated]);

  // Renders nothing — purely a data-loading side-effect component.
  return null;
}
