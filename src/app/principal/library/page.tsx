"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  BookOpen, Users, AlertTriangle, TrendingUp,
  Package, Clock, ArrowRight, Settings, BarChart3, Activity, DollarSign,
} from "lucide-react";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";

interface Summary {
  totalCatalogueEntries: number; totalCopies: number;
  copiesCurrentlyOut: number; copiesAvailable: number;
  totalCards: number; activeCards: number; suspendedCards: number;
  overdueCount: number; totalFinesOutstanding: number;
  totalFinesPaid: number; studentsWithFines: number;
  recentBorrows: {
    id: string; borrowedAt: string; dueAt: string; returnedAt: string | null;
    student?: { id: string; fullName: string; admissionNumber: string } | null;
    title: string; author: string | null; accession: string | null;
  }[];
}

interface StudentFine {
  id: string; fineBalance: number;
  student: { id: string; fullName: string; admissionNumber: string; schoolClass: { name: string } };
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(dueAt: string, returnedAt: string | null) {
  return !returnedAt && new Date(dueAt) < new Date();
}

function StatCard({
  label, value, sub, icon, highlight,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-5 flex gap-4 items-start ${
      highlight
        ? "border-danger/30 bg-danger-bg/40 dark:bg-danger/10"
        : "bg-card border-border"
    }`}>
      <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${
        highlight ? "bg-danger/10 text-danger" : "bg-teal/10 text-teal"
      }`}>{icon}</div>
      <div>
        <p className={`text-2xl font-semibold leading-none ${highlight ? "text-danger" : "text-foreground"}`}>{value}</p>
        <p className="text-slate text-sm mt-1.5">{label}</p>
        {sub && <p className="text-slate/60 text-xs mt-0.5/60">{sub}</p>}
      </div>
    </div>
  );
}

export default function PrincipalLibraryPage() {
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [fines, setFines]       = useState<StudentFine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");

  const load = useCallback(async () => {
    const [s, f] = await Promise.all([
      fetch("/api/library/summary").then(r => r.ok ? r.json() : null),
      fetch("/api/library/students/fines").then(r => r.ok ? r.json() : []),
    ]);
    setSummary(s); setFines(f ?? []); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredFines = fines.filter(f =>
    !search ||
    f.student.fullName.toLowerCase().includes(search.toLowerCase()) ||
    f.student.admissionNumber.toLowerCase().includes(search.toLowerCase())
  );

  const navItems = [
    { href: "/principal/departments", label: "Departments" },
    { href: "/principal/library",     label: "Library" },
  ];

  return (
    <div>
      <ContextNavigation items={navItems} />

      <PageHeader
        title="Library Overview"
        description="School-wide library statistics, catalogue health, and outstanding fines."
        action={
          <Link href="/principal/settings?tab=library"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-medium px-4 py-2.5 text-foreground hover:bg-background hover:border-slate-light transition-all duration-100">
            <Settings className="h-4 w-4" /> Library settings
          </Link>
        }
      />

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(8)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-line/40 animate-pulse" />)}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Catalogue entries"       value={summary.totalCatalogueEntries}   sub={`${summary.totalCopies} total copies`}       icon={<BookOpen className="h-5 w-5" />} />
          <StatCard label="Copies currently out"    value={summary.copiesCurrentlyOut}       sub={`${summary.copiesAvailable} available`}       icon={<Package className="h-5 w-5" />} />
          <StatCard label="Active library cards"    value={summary.activeCards}              sub={`of ${summary.totalCards} issued`}            icon={<Users className="h-5 w-5" />} />
          <StatCard label="Overdue borrows"         value={summary.overdueCount}             sub="past due date"                                icon={<Clock className="h-5 w-5" />}    highlight={summary.overdueCount > 0} />
          <StatCard label="Suspended cards"         value={summary.suspendedCards}           sub="students blocked"                             icon={<AlertTriangle className="h-5 w-5" />} highlight={summary.suspendedCards > 0} />
          <StatCard label="Students with fines"     value={summary.studentsWithFines}        sub={`KES ${summary.totalFinesOutstanding.toFixed(2)} outstanding`} icon={<TrendingUp className="h-5 w-5" />} highlight={summary.totalFinesOutstanding > 0} />
          <StatCard label="Fines collected (all time)" value={`KES ${summary.totalFinesPaid.toFixed(2)}`} icon={<TrendingUp className="h-5 w-5" />} />
          <StatCard label="Books available"         value={summary.copiesAvailable}          sub={`of ${summary.totalCopies} copies`}           icon={<BookOpen className="h-5 w-5" />} />
        </div>
      )}

      {/* Analytics quick-links — visible to Principal */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          { href: "/staff/library/analytics",           icon: <BarChart3 className="h-5 w-5" />,   label: "Executive Analytics",    desc: "Full KPI dashboard for the library" },
          { href: "/staff/library/analytics/borrowing", icon: <Activity className="h-5 w-5" />,    label: "Borrowing Analytics",    desc: "Trends, peak hours, top students" },
          { href: "/staff/library/analytics/reports",   icon: <DollarSign className="h-5 w-5" />, label: "Reports & Export",       desc: "Monthly/termly reports, CSV, print" },
        ].map(a => (
          <Link key={a.href} href={a.href}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:border-teal/40 hover:shadow-sm transition-all">
            <div className="h-9 w-9 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">{a.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{a.label}</p>
              <p className="text-xs text-slate mt-0.5">{a.desc}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate/40 mt-1 shrink-0" />
          </Link>
        ))}
      </div>

      {/* Fine balances table */}
      <WorkspaceToolbar>
        <WorkspaceToolbar.Search value={search} onChange={setSearch} placeholder="Search students with fines…" />
        <WorkspaceToolbar.Actions>
          {summary && <span className="text-sm text-slate">{summary.studentsWithFines} student{summary.studentsWithFines !== 1 ? "s" : ""} with outstanding fines</span>}
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {!loading && filteredFines.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-semibold text-foreground mb-3">Students with outstanding fines</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-border bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide/30">
                    <th className="px-5 py-3.5">Student</th>
                    <th className="px-5 py-3.5 w-[140px]">Admission</th>
                    <th className="px-5 py-3.5 w-[140px]">Class</th>
                    <th className="px-5 py-3.5 w-[160px] text-right">Fine balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFines.map(f => (
                    <tr key={f.id} className="border-b border-border last:border-0 hover:bg-slate-50/50 transition-colors/20">
                      <td className="px-5 py-3.5 font-medium text-foreground">{f.student.fullName}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono text-slate bg-slate-50 border border-border rounded px-1.5 py-0.5">{f.student.admissionNumber}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate text-sm">{f.student.schoolClass.name}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-danger-bg border border-danger/20 text-danger font-semibold text-sm tabular-nums">
                          <span className="text-xs font-normal">KES</span>{f.fineBalance.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Recent borrows */}
      {!loading && summary && summary.recentBorrows.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">Recent borrow activity</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-border bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide/30">
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
                      <tr key={b.id} className="border-b border-border last:border-0 hover:bg-slate-50/50 transition-colors/20">
                        <td className="px-5 py-3.5">
                          {b.student ? (
                            <><p className="font-medium text-foreground">{b.student.fullName}</p>
                            <p className="text-xs text-slate font-mono">{b.student.admissionNumber}</p></>
                          ) : <span className="text-slate text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3.5 max-w-[200px]">
                          <p className="truncate text-foreground">{b.title}</p>
                          {b.author && <p className="text-xs text-slate">{b.author}</p>}
                        </td>
                        <td className="px-5 py-3.5 text-slate text-xs">{fmt(b.borrowedAt)}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs ${overdue ? "text-danger font-semibold" : "text-slate"}`}>{fmt(b.dueAt)}</span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {b.returnedAt ? <Badge variant="success">Returned</Badge>
                            : overdue   ? <Badge variant="danger">Overdue</Badge>
                            :             <Badge variant="info">Out</Badge>}
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

      {!loading && fines.length === 0 && summary && summary.totalFinesOutstanding === 0 && (
        <EmptyState message="No outstanding fines — all clear." />
      )}
    </div>
  );
}
