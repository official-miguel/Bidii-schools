"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  BookOpen, TrendingUp, Users, Clock, RefreshCw, AlertTriangle,
  ChevronDown, ChevronRight, Lightbulb, BarChart3,
} from "lucide-react";
import { Badge, PageHeader, Spinner } from "@/components/ui";


// ── Types ──────────────────────────────────────────────────────────────────

interface CopyDetail { id: string; accessionNumber: string; status: string; condition: string; totalBorrows: number; activeBorrows: number; borrows: BorrowRecord[]; }
interface BorrowRecord { id: string; borrowedAt: string; dueAt: string; returnedAt: string | null; renewalCount: number; fineAmount: number; returnCondition?: string | null; card: { student: { id: string; fullName: string; admissionNumber: string; schoolClass: { name: string } } | null }; }
interface Reservation  { id: string; status: string; reservationType: string; queuePosition: number | null; createdAt: string; }
interface IntelData {
  catalogue: { id: string; title: string; author: string | null; bookNumber: string | null; subject: string | null; form: number | null; category: string; shelf: string | null; costPerCopy: number | null };
  copies: CopyDetail[];
  reservations: Reservation[];
  recentEvents: { id: string; eventType: string; createdAt: string; studentId: string | null; payload: unknown }[];
  statistics: { totalBorrows: number; activeBorrows: number; overdueCount: number; totalRenewals: number; avgRenewals: number; avgHoldDays: number | null; totalFinesCharged: number; conditionDistribution: Record<string,number>; frequentlyRenewed: boolean; overdueRate: number };
  topBorrowers: { student: { id: string; fullName: string; admissionNumber: string; schoolClass: { name: string } }; count: number }[];
  recommendations: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

function statCard(label: string, value: string | number, icon: React.ReactNode, hi = false) {
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${hi ? "border-warn/30 bg-warn-bg/30" : "border-line bg-white dark:bg-dark-surface dark:border-dark-border"}`}>
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${hi ? "bg-warn/10 text-warn" : "bg-teal/10 text-teal"}`}>{icon}</div>
      <div><p className={`text-xl font-bold leading-none ${hi ? "text-warn" : "text-ink dark:text-dark-text"}`}>{value}</p><p className="text-xs text-slate mt-1 dark:text-dark-muted">{label}</p></div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function BookIntelligencePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData]       = useState<IntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await fetch(`/api/library/intelligence/${id}`);
    if (!r.ok) { setError((await r.json()).error ?? "Failed to load."); setLoading(false); return; }
    setData(await r.json()); setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const toggle = (copyId: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(copyId)) { n.delete(copyId); } else { n.add(copyId); } return n; });

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>;
  if (error)   return <div className="text-danger text-sm p-4">{error}</div>;
  if (!data)   return null;

  const { catalogue, copies, reservations, statistics, topBorrowers, recommendations } = data;

  return (
    <div>
      <PageHeader title={catalogue.title} description={[catalogue.author, catalogue.subject, catalogue.form ? `Form ${catalogue.form}` : null, catalogue.bookNumber].filter(Boolean).join(" · ")} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {statCard("Total borrows",    statistics.totalBorrows,                   <BookOpen className="h-5 w-5" />)}
        {statCard("Active borrows",   statistics.activeBorrows,                  <Users className="h-5 w-5" />)}
        {statCard("Overdue",          statistics.overdueCount,                   <AlertTriangle className="h-5 w-5" />, statistics.overdueCount > 0)}
        {statCard("Avg hold (days)",  statistics.avgHoldDays?.toFixed(1) ?? "—", <Clock className="h-5 w-5" />)}
        {statCard("Total renewals",   statistics.totalRenewals,                  <RefreshCw className="h-5 w-5" />, statistics.frequentlyRenewed)}
        {statCard("Overdue rate",     `${(statistics.overdueRate * 100).toFixed(0)}%`, <TrendingUp className="h-5 w-5" />, statistics.overdueRate > 0.3)}
        {statCard("Fines charged",    `KES ${statistics.totalFinesCharged.toFixed(2)}`, <TrendingUp className="h-5 w-5" />)}
        {statCard("Total copies",     copies.length,                             <BarChart3 className="h-5 w-5" />)}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="rounded-xl border border-teal/30 bg-teal-50/30 p-4 mb-6">
          <p className="text-sm font-semibold text-teal flex items-center gap-2 mb-3"><Lightbulb className="h-4 w-4" />Smart Recommendations</p>
          <ul className="space-y-1.5">
            {recommendations.map((r, i) => <li key={i} className="text-sm text-ink flex items-start gap-2"><span className="text-teal mt-0.5">•</span>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Condition distribution */}
      {Object.keys(statistics.conditionDistribution).length > 0 && (
        <div className="rounded-xl border border-line bg-white p-4 mb-6 dark:bg-dark-surface dark:border-dark-border">
          <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">Return condition distribution</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(statistics.conditionDistribution).map(([cond, count]) => (
              <div key={cond} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm">
                <span className="font-medium text-ink">{count}</span>
                <span className="text-slate">{cond}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top borrowers */}
      {topBorrowers.length > 0 && (
        <div className="rounded-xl border border-line bg-white p-4 mb-6 dark:bg-dark-surface dark:border-dark-border">
          <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">Top borrowers</p>
          <div className="space-y-2">
            {topBorrowers.map((b, i) => (
              <div key={b.student.id} className="flex items-center gap-3">
                <span className="text-xs text-slate w-4 shrink-0">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{b.student.fullName}</p>
                  <p className="text-xs text-slate">{b.student.admissionNumber} · {b.student.schoolClass.name}</p>
                </div>
                <span className="text-sm font-bold text-teal shrink-0">{b.count}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reservations */}
      {reservations.length > 0 && (
        <div className="rounded-xl border border-line bg-white p-4 mb-6 dark:bg-dark-surface dark:border-dark-border">
          <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">Active reservations ({reservations.length})</p>
          <div className="space-y-2">
            {reservations.map(r => (
              <div key={r.id} className="flex items-center gap-3 text-sm">
                <Badge variant={r.status === "ACTIVE" ? "success" : "warn"}>{r.status}</Badge>
                <span className="text-slate">{r.reservationType}</span>
                {r.queuePosition && <span className="text-xs text-slate">#{r.queuePosition}</span>}
                <span className="text-xs text-slate ml-auto">{fmt(r.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Physical copies */}
      <div>
        <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">Physical copies ({copies.length})</p>
        <div className="bg-white border border-line rounded-xl overflow-hidden dark:bg-dark-surface dark:border-dark-border">
          {copies.map((copy, idx) => (
            <div key={copy.id} className={idx > 0 ? "border-t border-line" : ""}>
              <button onClick={() => toggle(copy.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50/40 transition-colors text-left">
                {expanded.has(copy.id) ? <ChevronDown className="h-4 w-4 text-slate shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate shrink-0" />}
                <span className="font-mono text-sm font-medium text-ink">{copy.accessionNumber}</span>
                <Badge variant={copy.status === "AVAILABLE" ? "success" : copy.status === "BORROWED" ? "info" : "warn"}>{copy.status}</Badge>
                <Badge variant={copy.condition === "EXCELLENT" || copy.condition === "GOOD" ? "success" : copy.condition === "FAIR" ? "warn" : "danger"}>{copy.condition}</Badge>
                <span className="text-xs text-slate ml-auto">{copy.totalBorrows} borrow{copy.totalBorrows !== 1 ? "s" : ""}</span>
              </button>

              {expanded.has(copy.id) && (
                <div className="px-10 pb-4">
                  {copy.borrows.length === 0 ? (
                    <p className="text-xs text-slate">Never borrowed.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate uppercase tracking-wide border-b border-line">
                          <th className="pb-1.5">Student</th>
                          <th className="pb-1.5">Borrowed</th>
                          <th className="pb-1.5">Returned</th>
                          <th className="pb-1.5">Condition</th>
                          <th className="pb-1.5 text-right">Fine</th>
                        </tr>
                      </thead>
                      <tbody>
                        {copy.borrows.map(b => (
                          <tr key={b.id} className="border-b border-line/50 last:border-0">
                            <td className="py-2">{b.card.student?.fullName ?? "—"}<br/><span className="text-slate">{b.card.student?.admissionNumber}</span></td>
                            <td className="py-2 text-slate">{fmt(b.borrowedAt)}</td>
                            <td className="py-2 text-slate">{b.returnedAt ? fmt(b.returnedAt) : <span className="text-teal font-medium">Active</span>}</td>
                            <td className="py-2 text-slate">{(b as { returnCondition?: string | null }).returnCondition ?? "—"}</td>
                            <td className="py-2 text-right">{b.fineAmount > 0 ? <span className="text-danger">{b.fineAmount.toFixed(2)}</span> : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
