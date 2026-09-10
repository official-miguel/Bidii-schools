"use client";

/**
 * src/components/GlobalSearchModal.tsx
 *
 * Application-wide instant search modal.
 * Triggered by Ctrl/Cmd+K or the search button in TopAppBar.
 *
 * Features:
 *   - Instant results (<1ms) from in-memory stores
 *   - Grouped by category with distinct icons
 *   - Keyboard navigation (arrow keys, enter)
 *   - Click or Enter to navigate
 *   - Esc to close
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Search } from "lucide-react";
import { useGlobalSearch } from "@/lib/hooks/useGlobalSearch";
import { useProductivityStore } from "@/lib/stores/productivityStore";
import { getLucideIcon } from "@/lib/utils/lucideIcon";

// useProductivityStore is accessed via .getState() inside callbacks to avoid
// subscribing to unstable function references that would cause infinite loops.

interface Props {
  isOpen: boolean;
  onClose: () => void;
  role: string;
}

export default function GlobalSearchModal({ isOpen, onClose, role }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, totalCount } = useGlobalSearch(query, role);

  // Flatten results for keyboard navigation
  const flatResults = results.flatMap((g) => g.results);

  // handleNavigate must be defined before the keyboard useEffect that
  // references it in its dependency array to avoid a temporal dead zone error.
  // trackVisit is accessed via getState() to avoid subscribing to the function
  // reference — Zustand creates a new function object on every state update,
  // which would make this callback unstable and cause infinite re-renders.
  const handleNavigate = useCallback(
    (result: typeof flatResults[0]) => {
      useProductivityStore.getState().trackVisit({
        href: result.href,
        label: result.label,
        icon: result.icon,
        hub: result.category,
      });
      router.push(result.href);
      onClose();
    },
    [router, onClose]
  );

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(flatResults.length, 1));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) =>
          i === 0 ? flatResults.length - 1 : i - 1
        );
        return;
      }

      if (e.key === "Enter" && flatResults[selectedIndex]) {
        e.preventDefault();
        handleNavigate(flatResults[selectedIndex]);
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, flatResults, selectedIndex, handleNavigate, onClose]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]
                 bg-ink/30 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-xl bg-card border border-border
                   shadow-2xl
                   animate-scale-in"
      >
        {/* ── Search input ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-5 w-5 text-slate shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students, staff, classes, subjects, pages…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-slate
                       outline-none"
            aria-label="Search query"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-slate hover:text-foreground
                       transition-colors"
            aria-label="Close search"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* ── Results ──────────────────────────────────────────────────── */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length === 0 && (
            <div className="px-6 py-12 text-center">
              <Search className="h-10 w-10 mx-auto text-slate/40 mb-3/40" />
              <p className="text-sm text-slate">
                Start typing to search across students, staff, and more…
              </p>
              <p className="text-xs text-slate/60/60 mt-2">
                Use <kbd className="px-1.5 py-0.5 rounded bg-line text-xs">↑↓</kbd> to
                navigate, <kbd className="px-1.5 py-0.5 rounded bg-line text-xs">Enter</kbd> to
                select
              </p>
            </div>
          )}

          {query.trim().length > 0 && totalCount === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate">
                No results for &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-slate/60/60 mt-1">
                Try a different search term
              </p>
            </div>
          )}

          {results.map((group, groupIdx) => {
            const GroupIcon = getLucideIcon(group.icon);

            // Calculate flat index offset for this group
            const groupStartIndex = results
              .slice(0, groupIdx)
              .reduce((acc, g) => acc + g.results.length, 0);

            return (
              <div key={group.category} className="py-2">
                {/* Category header */}
                <div className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold
                                text-slate uppercase tracking-wider">
                  <GroupIcon className="h-3.5 w-3.5" />
                  {group.label}
                </div>

                {/* Results */}
                {group.results.map((result, idx) => {
                  const flatIdx = groupStartIndex + idx;
                  const isSelected = flatIdx === selectedIndex;

                  const ResultIcon = getLucideIcon(result.icon);

                  return (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => handleNavigate(result)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5
                                  text-left transition-colors
                                  ${
                                    isSelected
                                      ? "bg-teal-50 dark:bg-teal-900/20"
                                      : "hover:bg-background/50"
                                  }`}
                    >
                      <div
                        className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0
                                    ${
                                      isSelected
                                        ? "bg-teal text-white"
                                        : "bg-background text-slate"
                                    }`}
                      >
                        <ResultIcon className="h-4.5 w-4.5" strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium truncate
                                      ${
                                        isSelected
                                          ? "text-foreground"
                                          : "text-foreground"
                                      }`}
                        >
                          {result.label}
                        </p>
                        {result.detail && (
                          <p className="text-xs text-slate truncate">
                            {result.detail}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ── Footer hint ─────────────────────────────────────────────── */}
        {totalCount > 0 && (
          <div className="px-4 py-2 border-t border-border
                          bg-background/50/50 rounded-b-xl">
            <p className="text-xs text-slate">
              {totalCount} result{totalCount === 1 ? "" : "s"} •{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-line text-xs">↑↓</kbd> navigate •{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-line text-xs">Enter</kbd> select •{" "}
              <kbd className="px-1.5 py-0.5 rounded bg-line text-xs">Esc</kbd> close
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
