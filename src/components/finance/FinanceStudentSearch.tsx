"use client";

/**
 * FinanceStudentSearch
 *
 * Async autocomplete that searches students by name or admission number
 * and navigates to their individual finance ledger on selection.
 *
 * Designed to sit inside FinanceTopBar as a search pill that matches
 * the TopAppBar look (light bg, teal focus ring, white card dropdown).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";

interface StudentResult {
  id:              string;
  fullName:        string;
  admissionNumber: string;
  schoolClass:     { name: string };
}

export default function FinanceStudentSearch() {
  const router                    = useRouter();
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<StudentResult[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [open,      setOpen]      = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const listRef                   = useRef<HTMLUListElement>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/finance/students?search=${encodeURIComponent(q.trim())}&pageSize=8`);
      const data = res.ok ? await res.json() : { students: [] };
      setResults(data.students ?? []);
      setOpen(true);
      setActiveIdx(-1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch]);

  function navigate(student: StudentResult) {
    setQuery("");
    setResults([]);
    setOpen(false);
    router.push(`/staff/finance/students/${student.id}`);
  }

  function clear() {
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      navigate(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Keep active item visible
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div className="relative">
      {/* ── Pill input ── */}
      <div className="relative flex items-center">
        <Search
          className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate dark:text-dark-muted shrink-0"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search student…"
          aria-label="Search students"
          aria-autocomplete="list"
          aria-expanded={open}
          className="h-9 w-56 rounded-lg border border-line bg-paper pl-8 pr-8 text-sm text-ink
                     placeholder:text-slate outline-none transition-colors
                     focus:border-teal/50 focus:ring-2 focus:ring-teal/20
                     dark:bg-dark-surface dark:border-dark-border dark:text-dark-text
                     dark:placeholder:text-dark-muted dark:focus:border-teal/40"
        />
        <span className="absolute right-2.5 flex items-center">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-teal" aria-label="Searching" />
          ) : query ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={clear}
              aria-label="Clear search"
              className="text-slate hover:text-ink dark:text-dark-muted dark:hover:text-dark-text transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </span>
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Student results"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-xl overflow-hidden
                     bg-white border border-line shadow-xl
                     dark:bg-dark-surface dark:border-dark-border"
          style={{ maxHeight: "320px", overflowY: "auto" }}
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-xs text-slate dark:text-dark-muted text-center">
              No students found
            </li>
          ) : (
            results.map((s, idx) => (
              <li
                key={s.id}
                role="option"
                aria-selected={idx === activeIdx}
                onMouseDown={() => navigate(s)}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors
                  ${idx < results.length - 1 ? "border-b border-line/60 dark:border-dark-border/60" : ""}
                  ${idx === activeIdx ? "bg-teal/5 dark:bg-teal/10" : "hover:bg-paper dark:hover:bg-dark-border/40"}`}
              >
                {/* Initials avatar */}
                <div
                  className="flex items-center justify-center h-7 w-7 rounded-full shrink-0
                             bg-teal text-white text-[10px] font-bold select-none"
                  aria-hidden="true"
                >
                  {s.fullName.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink dark:text-dark-text truncate leading-tight">
                    {s.fullName}
                  </p>
                  <p className="text-[10px] text-slate dark:text-dark-muted font-mono leading-tight">
                    {s.admissionNumber} · {s.schoolClass.name}
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
