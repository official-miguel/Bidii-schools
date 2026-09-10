"use client";

/**
 * SearchableSelect
 *
 * A custom dropdown with an embedded search bar. Drop-in replacement for a
 * native <select> wherever the option list is long (staff, students, dorms…).
 *
 * Props
 *   value        — currently-selected option id (empty string = nothing selected)
 *   onChange     — called with the new option id (or "" when placeholder clicked)
 *   options      — array of { id, label, sub? } — id must be unique
 *   placeholder  — text shown when nothing is selected (default: "— Select —")
 *   searchPlaceholder — hint inside the search input (default: "Search…")
 *   disabled     — disables the whole control
 *   size         — "sm" renders a more compact trigger (for inline / table use)
 *   className    — extra classes on the root wrapper
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface SearchableSelectOption {
  id: string;
  label: string;
  /** Optional secondary line shown in smaller text */
  sub?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (id: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  size?: "default" | "sm";
  className?: string;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "— Select —",
  searchPlaceholder = "Search…",
  disabled = false,
  size = "default",
  className = "",
}: SearchableSelectProps) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState("");
  const rootRef               = useRef<HTMLDivElement>(null);
  const searchRef             = useRef<HTMLInputElement>(null);

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Auto-focus the search input when the dropdown opens
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const selected = options.find((o) => o.id === value) ?? null;

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.sub?.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  // ── Trigger styles ──────────────────────────────────────────────────────────
  const triggerBase =
    "w-full flex items-center justify-between gap-2 rounded-lg border bg-card " +
    "text-sm text-left transition-colors duration-100 " +
    "focus:outline-none focus:ring-2 focus:ring-teal/15 " +
    "hover:border-slate-light " +
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-background " +
    "";

  const triggerColor = open
    ? "border-teal ring-2 ring-teal/15"
    : "border-border";

  const triggerPad = size === "sm" ? "px-2.5 py-1.5" : "px-3.5 py-2.5";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* ── Trigger button ── */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`${triggerBase} ${triggerColor} ${triggerPad}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`flex-1 truncate ${selected ? "text-foreground" : "text-slate-light"}`}>
          {selected ? (
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="truncate">{selected.label}</span>
              {selected.sub && (
                <span className="text-xs text-slate shrink-0">
                  {selected.sub}
                </span>
              )}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          className={
            "absolute z-50 mt-1.5 w-full min-w-[220px] rounded-xl border border-border bg-card shadow-lg " +
            " overflow-hidden " +
            "animate-in fade-in-0 zoom-in-95 duration-100"
          }
          role="listbox"
        >
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search className="h-3.5 w-3.5 text-slate shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className={
                "flex-1 bg-transparent text-sm text-foreground placeholder:text-slate-light " +
                "focus:outline-none"
              }
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="shrink-0 text-slate hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Option list */}
          <div className="max-h-52 overflow-y-auto overscroll-contain">
            {/* "None / clear" row — shown only when something is already selected */}
            {value && (
              <button
                type="button"
                onClick={() => pick("")}
                className={
                  "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left " +
                  "text-slate hover:bg-slate-50/40 transition-colors"
                }
              >
                <span className="h-4 w-4 shrink-0" />
                <span className="italic">{placeholder}</span>
              </button>
            )}

            {filtered.length === 0 ? (
              <p className="px-3.5 py-4 text-sm text-slate text-center">
                No results for &ldquo;{query}&rdquo;
              </p>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.id === value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pick(opt.id)}
                    className={
                      "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition-colors " +
                      (isSelected
                        ? "bg-teal/8 dark:bg-teal/15"
                        : "hover:bg-slate-50/40")
                    }
                  >
                    {/* check mark column — always reserved so text stays aligned */}
                    <span className="h-4 w-4 shrink-0 flex items-center justify-center">
                      {isSelected && <Check className="h-3.5 w-3.5 text-teal" />}
                    </span>

                    <span className="flex-1 min-w-0">
                      <span
                        className={`block truncate ${
                          isSelected ? "text-teal font-medium" : "text-foreground"
                        }`}
                      >
                        {opt.label}
                      </span>
                      {opt.sub && (
                        <span className="block text-xs text-slate mt-0.5 truncate">
                          {opt.sub}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
