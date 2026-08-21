"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, UserX, Search, X } from "lucide-react";
import {
  PageHeader, Badge, EmptyState, Spinner, ErrorBanner, primaryButtonClass,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface AttachedStudent {
  studentId:     string;
  attachedAt:    string;
  student: {
    fullName:        string;
    admissionNumber: string;
    className:       string;
  };
}

interface ExpenseItemDetail {
  id:           string;
  name:         string;
  description:  string | null;
  currentPrice: string;
  isActive:     boolean;
  category:     { name: string };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ExpenseItemDetailPage() {
  const { itemId } = useParams<{ itemId: string }>();

  const [item,       setItem]       = useState<ExpenseItemDetail | null>(null);
  const [students,   setStudents]   = useState<AttachedStudent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemRes, attachRes] = await Promise.all([
        fetch(`/api/finance/expense-items/${itemId}`),
        fetch(`/api/finance/expense-attachments?expenseItemId=${itemId}`),
      ]);

      if (!itemRes.ok) throw new Error("Expense item not found.");

      const itemData   = await itemRes.json();
      const attachData = attachRes.ok ? await attachRes.json() : { attachments: [] };

      setItem(itemData.item);
      setStudents(attachData.attachments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? students.filter(a => {
        const q = search.trim().toLowerCase();
        return (
          a.student.fullName.toLowerCase().includes(q) ||
          a.student.admissionNumber.toLowerCase().includes(q) ||
          a.student.className.toLowerCase().includes(q)
        );
      })
    : students;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/staff/finance/expenses"
        className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink mb-4 transition-colors dark:text-dark-muted dark:hover:text-dark-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to expenses
      </Link>

      <PageHeader
        title={loading ? "Loading…" : (item?.name ?? "Expense item")}
        description={
          item
            ? `${item.category.name} · ${formatKES(item.currentPrice)}${item.description ? ` · ${item.description}` : ""}`
            : ""
        }
        action={
          item ? (
            <Link
              href="/staff/finance/expenses"
              className={primaryButtonClass}
              onClick={() => {
                // The expenses page will open the attach modal for this item.
                // We pass itemId via sessionStorage so the expenses page can
                // auto-open the attach modal.
                if (typeof window !== "undefined") {
                  sessionStorage.setItem("finance:openAttach", itemId);
                }
              }}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              Attach more students
            </Link>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Stats */}
      {!loading && item && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {[
            {
              label: "Students attached",
              value: String(students.length),
              icon:  <Users className="h-5 w-5" aria-hidden="true" />,
              highlight: false,
            },
            {
              label: "Price per term",
              value: formatKES(item.currentPrice),
              icon:  <span className="text-sm font-bold">KES</span>,
              highlight: false,
            },
            {
              label: "Status",
              value: item.isActive ? "Active" : "Inactive",
              icon:  <span className="h-2 w-2 rounded-full inline-block" style={{ background: item.isActive ? "var(--color-success, #22c55e)" : "var(--color-slate, #94a3b8)" }} />,
              highlight: false,
            },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-line bg-white p-4 flex gap-3 items-start dark:bg-dark-surface dark:border-dark-border">
              <div className="h-9 w-9 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">
                {c.icon}
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums leading-none text-ink dark:text-dark-text">{c.value}</p>
                <p className="text-xs text-slate mt-1 dark:text-dark-muted">{c.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search bar */}
      {!loading && students.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, admission no. or class…"
              className={
                "w-full rounded-lg border border-line bg-white px-3 py-2 pl-9 text-sm text-ink " +
                "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
                "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
              }
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink dark:text-dark-muted transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {search.trim() && (
            <p className="text-xs text-slate dark:text-dark-muted shrink-0">
              {filtered.length} of {students.length} shown
            </p>
          )}
        </div>
      )}

      {/* Students table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl border border-line bg-paper animate-pulse" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          message="No students attached to this expense yet."
          icon={<UserX className="h-6 w-6" />}
          action={
            <Link
              href="/staff/finance/expenses"
              className={primaryButtonClass}
              onClick={() => {
                if (typeof window !== "undefined") {
                  sessionStorage.setItem("finance:openAttach", itemId);
                }
              }}
            >
              <Users className="h-4 w-4" />
              Attach students
            </Link>
          }
        />
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Student</th>
                  <th className={premiumThClass}>Class</th>
                  <th className={premiumThClass}>Attached on</th>
                  <th className={premiumThClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-sm text-slate dark:text-dark-muted">
                      No students match &ldquo;{search}&rdquo;.{" "}
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="text-teal font-medium hover:underline"
                      >
                        Clear search
                      </button>
                    </td>
                  </tr>
                ) : filtered.map(a => (
                  <tr key={a.studentId} className={premiumTrClass}>
                    <td className={premiumTdClass}>
                      <p className="font-medium text-ink dark:text-dark-text">{a.student.fullName}</p>
                      <p className="text-xs font-mono text-slate dark:text-dark-muted">{a.student.admissionNumber}</p>
                    </td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>
                      {a.student.className}
                    </td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted text-xs`}>
                      {formatDate(a.attachedAt)}
                    </td>
                    <td className={premiumTdClass}>
                      <Badge variant="teal">Attached</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
