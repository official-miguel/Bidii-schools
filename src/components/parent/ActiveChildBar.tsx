"use client";

/**
 * src/components/parent/ActiveChildBar.tsx
 *
 * Compact chip rendered inside TopAppBar when role === "parent".
 * Displays the active child's full name and class name.
 * Returns null until the parent store is hydrated or has no children.
 */

import { useParentStore } from "@/lib/stores/parentStore";

export default function ActiveChildBar() {
  const activeChildId = useParentStore((s) => s.activeChildId);
  const children      = useParentStore((s) => s.children);
  const hydrated      = useParentStore((s) => s.hydrated);

  if (!hydrated || children.length === 0) return null;

  const child = children.find((c) => c.id === activeChildId) ?? children[0];

  return (
    <span
      className="hidden md:flex items-center gap-1.5 text-xs text-slate dark:text-dark-muted
                 bg-paper dark:bg-dark-surface border border-line dark:border-dark-border
                 rounded-full px-3 py-1 select-none"
    >
      <span className="font-medium text-ink dark:text-dark-text">{child.fullName}</span>
      <span aria-hidden="true">·</span>
      <span>{child.className}</span>
    </span>
  );
}
