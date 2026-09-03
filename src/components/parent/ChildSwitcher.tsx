"use client";

/**
 * src/components/parent/ChildSwitcher.tsx
 *
 * Sidebar component that lets a parent switch between their linked children.
 * Renders nothing when the parent has only one child — no unnecessary chrome.
 *
 * Requirements: 3.2, 3.3, 3.6
 */

import { useParentStore } from "@/lib/stores/parentStore";

export default function ChildSwitcher() {
  const children      = useParentStore((s) => s.children);
  const activeChildId = useParentStore((s) => s.activeChildId);
  const setActiveChild = useParentStore((s) => s.setActiveChild);

  // Single-child parents don't need a switcher.
  if (children.length <= 1) return null;

  return (
    <div className="px-3 py-2 border-b border-border dark:border-dark-border">
      <p className="text-xs font-medium text-slate dark:text-dark-muted mb-1.5 uppercase tracking-wide">
        My Children
      </p>

      <div className="flex flex-col gap-1">
        {children.map((child) => {
          const isActive = child.id === activeChildId;
          return (
            <button
              key={child.id}
              onClick={() => setActiveChild(child.id)}
              className={`
                w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors
                ${
                  isActive
                    ? "bg-teal/10 text-teal font-medium"
                    : "hover:bg-paper dark:hover:bg-dark-surface text-ink dark:text-dark-text"
                }
              `}
            >
              <span className="block truncate">{child.fullName}</span>
              <span className="block text-xs text-slate dark:text-dark-muted truncate">
                {child.className}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
