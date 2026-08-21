"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  BookOpen, Users, AlertTriangle, TrendingUp,
  ArrowRight, Clock, QrCode, Package, Loader2,
} from "lucide-react";
import {
  PageHeader, Badge, EmptyState,
  primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";


// ── Types ──────────────────────────────────────────────────────────────────

interface Summary {
  totalCatalogueEntries: number;
  totalCopies:           number;
  copiesCurrentlyOut:    number;
  copiesAvailable:       number;
  totalCards:            number;
  activeCards:           number;
  suspendedCards:        number;
  overdueCount:          number;
  totalFinesOutstanding: number;
  totalFinesPaid:        number;
  studentsWithFines:     number;
  recentBorrows: {
    id:         string;
    borrowedAt: string;
    dueAt:      string;
    returnedAt: string | null;
    student?:   { id: string; fullName: string; admissionNumber: string } | null;
    title:      string;
    author:     string | null;
    accession:  string | null;
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function isOverdue(dueAt: string, returnedAt: string | null) {
  return !returnedAt && new Date(dueAt) < new Date();
}

function daysDiff(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, highlight, href,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; highlight?: boolean; href?: string;
}) {
  const inner = (
    <div className={`rounded-xl border p-5 flex gap-4 items-start transition-all ${
      highlight
        ? "border-danger/30 bg-danger-bg/40 dark:bg-danger/10"
        : "bg-white border-line hover:shadow-sm dark:bg-dark-surface dark:border-dark-border"
    } ${href ? "cursor-pointer hover:border-teal/40" : ""}`}>
      <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${
        highlight ? "bg-danger/10 text-danger" : "bg-teal/10 text-teal"
      }`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-2xl font-semibold leading-none ${
          highlight ? "text-danger" : "text-ink dark:text-dark-text"
        }`}>{value}</p>
        <p className="text-slate text-sm mt-1.5 dark:text-dark-muted">{label}</p>
        {sub && <p className="text-slate/60 text-xs mt-0.5 dark:text-dark-muted/60">{sub}</p>}
      </div>
      {href && <ArrowRight className="h-4 w-4 text-slate/40 shrink-0 ml-auto mt-1" />}
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function SkeletonCard() {
  return <div className="rounded-xl border border-line h-24 animate-pulse bg-line/40" />;
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function LibraryDashboard() {
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provMsg, setProvMsg]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/library/summary");
      if (!res.ok) throw new Error("Failed to load summary");
      setSummary(await res.json());
    } catch {
      setError("Could not load library summary. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleProvisionCards() {
    setProvisioning(true); setProvMsg(null);
    try {
      const res = await fetch("/api/library/cards", { method: "POST" });
      const data = await res.json();
      setProvMsg(
        data.provisioned > 0
          ? `${data.provisioned} new library card${data.provisioned === 1 ? "" : "s"} issued.`
          : "All eligible students already have library cards."
      );
      load();
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Library"
        description="Overview of the school library — catalogue, cards, borrows, and fines."
        action={
          <div className="flex items-center gap-2">
            <Link href="/staff/library/scan" className={primaryButtonClass}>
              <QrCode className="h-4 w-4" /> Scan Mode
            </Link>
            <button
              onClick={handleProvisionCards}
              disabled={provisioning}
              className={secondaryButtonClass}
            >
              {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Issue Cards
            </button>
          </div>
        }
      />

      {provMsg && (
        <div className="mb-5 rounded-lg bg-success-bg border border-success/20 text-success text-sm px-4 py-3">
          {provMsg}
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-lg bg-danger-bg border border-danger/20 text-danger text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* Stats grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Catalogue entries"
            value={summary.totalCatalogueEntries}
            sub={`${summary.totalCopies} total copies`}
            icon={<BookOpen className="h-5 w-5" />}
            href="/staff/library/inventory"
          />
          <StatCard
            label="Copies out"
            value={summary.copiesCurrentlyOut}
            sub={`${summary.copiesAvailable} available`}
            icon={<Package className="h-5 w-5" />}
          />
          <StatCard
            label="Active library cards"
            value={summary.activeCards}
            sub={`${summary.totalCards} total issued`}
            icon={<Users className="h-5 w-5" />}
            href="/staff/library/cards"
          />
          <StatCard
            label="Overdue borrows"
            value={summary.overdueCount}
            sub="books past due date"
            icon={<Clock className="h-5 w-5" />}
            highlight={summary.overdueCount > 0}
            href="/staff/library/cards"
          />
          <StatCard
            label="Suspended cards"
            value={summary.suspendedCards}
            sub="students blocked"
            icon={<AlertTriangle className="h-5 w-5" />}
            highlight={summary.suspendedCards > 0}
          />
          <StatCard
            label="Students with fines"
            value={summary.studentsWithFines}
            sub={`KES ${summary.totalFinesOutstanding.toFixed(2)} outstanding`}
            icon={<TrendingUp className="h-5 w-5" />}
            highlight={summary.totalFinesOutstanding > 0}
            href="/staff/library/cards?hasFine=true"
          />
          <StatCard
            label="Fines collected"
            value={`KES ${summary.totalFinesPaid.toFixed(2)}`}
            sub="all time"
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <StatCard
            label="Books available"
            value={summary.copiesAvailable}
            sub={`of ${summary.totalCopies} copies`}
            icon={<BookOpen className="h-5 w-5" />}
          />
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          { href: "/staff/library/circulate",    icon: <QrCode className="h-5 w-5" />,   label: "Circulation Desk", desc: "Borrow, return & renew with policy checks" },
          { href: "/staff/library/inventory",    icon: <BookOpen className="h-5 w-5" />, label: "Book Inventory",   desc: "Manage catalogue and copies" },
          { href: "/staff/library/analytics",    icon: <Users className="h-5 w-5" />,    label: "Analytics",        desc: "KPIs, trends, reports & exports" },
        ].map(a => (
          <Link key={a.href} href={a.href}
            className="flex items-start gap-3 rounded-xl border border-line bg-white p-4 hover:border-teal/40 hover:shadow-sm transition-all dark:bg-dark-surface dark:border-dark-border">
            <div className="h-10 w-10 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">
              {a.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink dark:text-dark-text">{a.label}</p>
              <p className="text-xs text-slate mt-0.5 dark:text-dark-muted">{a.desc}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate/40 ml-auto mt-1 shrink-0" />
          </Link>
        ))}
      </div>

      {/* Recent activity */}
      {!loading && summary && summary.recentBorrows.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-ink mb-3 dark:text-dark-text">Recent activity</h2>
          <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm dark:bg-dark-surface dark:border-dark-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide dark:bg-dark-border/30">
                    <th className="px-5 py-3.5">Student</th>
                    <th className="px-5 py-3.5">Book</th>
                    <th className="px-5 py-3.5 w-[130px]">Borrowed</th>
                    <th className="px-5 py-3.5 w-[110px]">Due</th>
                    <th className="px-5 py-3.5 w-[100px] text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentBorrows.map(b => {
                    const overdue = isOverdue(b.dueAt, b.returnedAt);
                    return (
                      <tr key={b.id} className="border-b border-line last:border-0 hover:bg-slate-50/40 transition-colors dark:hover:bg-dark-border/20">
                        <td className="px-5 py-3.5">
                          {b.student ? (
                            <>
                              <p className="text-sm font-medium text-ink dark:text-dark-text">{b.student.fullName}</p>
                              <p className="text-xs text-slate font-mono">{b.student.admissionNumber}</p>
                            </>
                          ) : <span className="text-slate text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-sm text-ink dark:text-dark-text truncate max-w-[220px]">{b.title}</p>
                          {b.author && <p className="text-xs text-slate">{b.author}</p>}
                        </td>
                        <td className="px-5 py-3.5 text-slate text-xs">{fmt(b.borrowedAt)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs ${overdue ? "text-danger font-semibold" : "text-slate"}`}>
                            {fmt(b.dueAt)}
                            {overdue && <span className="block text-[10px]">{daysDiff(b.dueAt)}d overdue</span>}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {b.returnedAt ? (
                            <Badge variant="success">Returned</Badge>
                          ) : overdue ? (
                            <Badge variant="danger">Overdue</Badge>
                          ) : (
                            <Badge variant="info">Out</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!loading && summary && summary.recentBorrows.length === 0 && (
        <EmptyState
          message="No borrowing activity yet."
          action={
            <Link href="/staff/library/inventory" className={primaryButtonClass}>
              <BookOpen className="h-4 w-4" /> Set up book inventory
            </Link>
          }
        />
      )}
    </div>
  );
}
