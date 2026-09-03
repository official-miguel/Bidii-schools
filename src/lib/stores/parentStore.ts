"use client";

/**
 * src/lib/stores/parentStore.ts
 *
 * Zustand store for the parent portal — tracks the active child selection
 * and the full list of children linked to the authenticated parent.
 *
 * Only `activeChildId` is persisted to localStorage so the child list is
 * always re-fetched from the server on mount (via ParentHydrator), while
 * the last-selected child survives page refreshes.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Lightweight child record returned by /api/parent/me/children */
export type ChildSummary = {
  id:              string;
  fullName:        string;
  admissionNumber: string;
  classId:         string;
  className:       string;
};

interface ParentState {
  /** ID of the child currently being viewed. Null until hydrated. */
  activeChildId: string | null;
  /** All children linked to the authenticated parent. */
  children:      ChildSummary[];
  /** True once ParentHydrator has received a response from /api/parent/me/children. */
  hydrated:      boolean;

  /** Switch the active child. */
  setActiveChild: (childId: string) => void;
  /**
   * Replace the children list (called after fetching /api/parent/me/children).
   * Resets activeChildId to the first child when the current value is null or
   * is no longer present in the new list.
   */
  setChildren:    (children: ChildSummary[]) => void;
  /** Mark the store as hydrated (called by ParentHydrator after fetch completes). */
  setHydrated:    (v: boolean) => void;
}

export const useParentStore = create<ParentState>()(
  persist(
    (set) => ({
      activeChildId: null,
      children:      [],
      hydrated:      false,

      setActiveChild: (childId) => set({ activeChildId: childId }),

      setChildren: (children) =>
        set((s) => ({
          children,
          // Keep the current selection if it's still valid; otherwise default
          // to the first child in the list.
          activeChildId:
            children.find((c) => c.id === s.activeChildId)?.id ??
            children[0]?.id ??
            null,
        })),

      setHydrated: (v) => set({ hydrated: v }),
    }),
    {
      name: "bidii-parent-active-child",
      // Persist only the selected child ID — the list is always re-fetched.
      partialize: (s) => ({ activeChildId: s.activeChildId }),
    }
  )
);
