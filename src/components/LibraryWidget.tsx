"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export interface LibrarySummary {
  totalBooks: number;
  booksCurrentlyOut: number;
  totalFinesOutstanding: number;
  totalFinesPaid: number;
  studentsWithFines: number;
  activeCards: number;
}

type Props = {
  /**
   * Pre-fetched summary data. When provided the component renders immediately
   * with no client-side network request — eliminates the duplicate
   * /api/library/summary fetch that would otherwise fire after SSR.
   */
  initialData?: LibrarySummary;
};

export default function LibraryWidget({ initialData }: Props) {
  const [summary, setSummary] = useState<LibrarySummary | null>(initialData ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Skip the fetch entirely when data was already loaded server-side.
    if (initialData) return;

    fetch("/api/library/summary")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setSummary)
      .catch(() => setError(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return null; // widget silently hidden if library not used yet

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-foreground">Library</h2>
        <Link href="/principal/library" className="text-sm text-teal hover:text-teal-dark hover:underline transition-colors">
          View details →
        </Link>
      </div>

      {!summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-line/40 animate-pulse/40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Books in catalogue", value: summary.totalBooks, sub: `${summary.booksCurrentlyOut} currently out` },
            { label: "Active library cards", value: summary.activeCards, sub: "registered students" },
            {
              label: "Outstanding fines",
              value: `KES ${summary.totalFinesOutstanding.toFixed(2)}`,
              sub: `${summary.studentsWithFines} student${summary.studentsWithFines === 1 ? "" : "s"}`,
              highlight: summary.totalFinesOutstanding > 0,
            },
            { label: "Total fines paid", value: `KES ${summary.totalFinesPaid.toFixed(2)}`, sub: "all time" },
          ].map(c => (
            <div
              key={c.label}
              className={`rounded-xl border p-4 shadow-sm ${
                c.highlight
                  ? "border-danger/30 bg-danger-bg/40 dark:bg-danger/10 dark:border-danger/20"
                  : "bg-card border-border"
              }`}
            >
              <p className={`text-xl font-semibold ${c.highlight ? "text-danger" : "text-foreground"}`}>
                {c.value}
              </p>
              <p className="text-slate text-xs mt-1">{c.label}</p>
              <p className="text-slate/70 text-xs/70">{c.sub}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
