"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart2, TrendingUp, TrendingDown, Users, AlertTriangle,
  RefreshCw, Calendar,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  PageHeader, Spinner, EmptyState, ErrorBanner,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass, secondaryButtonClass,
} from "@/components/ui";

interface Summary {
  totalInvoiced: string;
  totalCollected: string;
  totalOutstanding: string;
  collectionRate: number;
  debtorCount: number;
}

interface AgingRow {
  studentId: string;
  fullName: string;
  admissionNumber: string;
  className: string;
  totalInvoiced: string;
  totalPaid: string;
  balance: string;
  daysOverdue: number;
  bucket: string;
}

interface VolumePoint { date: string; total: number; }
interface ClassPoint   { className: string; collectionRate: number; totalInvoiced: string; }

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function bucketVariant(b: string) {
  if (b === "0-30")  return "text-warn";
  if (b === "31-60") return "text-warn";
  if (b === "61-90") return "text-danger";
  return "text-danger font-semibold";
}

type ReportTab = "summary" | "aging" | "volume" | "classes";

export default function ReportsPage() {
  const [tab,      setTab]      = useState<ReportTab>("summary");
  const [summary,  setSummary]  = useState<Summary | null>(null);
  const [aging,    setAging]    = useState<AgingRow[]>([]);
  const [volume,   setVolume]   = useState<VolumePoint[]>([]);
  const [classes,  setClasses]  = useState<ClassPoint[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, a, v, c] = await Promise.all([
        fetch("/api/finance/reports/summary").then(r => r.ok ? r.json() : null),
        fetch("/api/finance/reports/aging").then(r => r.ok ? r.json() : { rows: [] }),
        fetch("/api/finance/reports/payment-volume?from=" +
          new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).then(r => r.ok ? r.json() : { data: [] }),
        fetch("/api/finance/reports/class-collection").then(r => r.ok ? r.json() : { data: [] }),
      ]);
      setSummary(s);
      setAging(a?.rows ?? []);
      setVolume(v?.data ?? []);
      setClasses(c?.data ?? []);
    } catch {
      setError("Could not load reports. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabs: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
    { id: "summary", label: "Summary",          icon: <BarChart2 className="h-3.5 w-3.5" /> },
    { id: "aging",   label: "Aging Report",     icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    { id: "volume",  label: "Payment Volume",   icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { id: "classes", label: "Class Collection", icon: <Users className="h-3.5 w-3.5" /> },
  ];

  return (
    <div>
      <PageHeader
        title="Finance Reports"
        description="Analytics, aging report, payment trends, and class-level collection rates."
        action={
          <button onClick={load} disabled={loading} className={secondaryButtonClass}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-line mb-6 dark:border-dark-border">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id ? "border-teal text-teal" : "border-transparent text-slate hover:text-ink dark:text-dark-muted"
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : tab === "summary" && summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total invoiced",    value: formatKES(summary.totalInvoiced),    icon: <BarChart2 className="h-5 w-5" />, highlight: false },
            { label: "Total collected",   value: formatKES(summary.totalCollected),   icon: <TrendingUp className="h-5 w-5" />, sub: `${summary.collectionRate.toFixed(1)}% rate`, highlight: false },
            { label: "Outstanding",       value: formatKES(summary.totalOutstanding), icon: <TrendingDown className="h-5 w-5" />, highlight: parseFloat(summary.totalOutstanding) > 0 },
            { label: "Active debtors",    value: String(summary.debtorCount),         icon: <AlertTriangle className="h-5 w-5" />, highlight: summary.debtorCount > 0 },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border p-5 flex gap-4 items-start ${
              c.highlight ? "border-danger/30 bg-danger-bg/40" : "bg-white border-line dark:bg-dark-surface dark:border-dark-border"
            }`}>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                c.highlight ? "bg-danger/10 text-danger" : "bg-teal/10 text-teal"
              }`} aria-hidden="true">{c.icon}</div>
              <div className="min-w-0 overflow-hidden">
                <p className={`font-semibold tabular-nums leading-tight break-words ${
                  c.value.length > 14 ? "text-base" : c.value.length > 10 ? "text-lg" : "text-2xl"
                } ${c.highlight ? "text-danger" : "text-ink dark:text-dark-text"}`}>{c.value}</p>
                <p className="text-slate text-sm mt-1.5 dark:text-dark-muted">{c.label}</p>
                {"sub" in c && c.sub && <p className="text-slate/60 text-xs mt-0.5">{c.sub}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : tab === "aging" ? (
        aging.length === 0 ? (
          <EmptyState message="No students with outstanding balances." icon={<AlertTriangle className="h-6 w-6" />} />
        ) : (
          <div className={premiumTableContainerClass}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className={premiumTheadClass}>
                  <tr>
                    <th className={premiumThClass}>Student</th>
                    <th className={premiumThClass}>Class</th>
                    <th className={`${premiumThClass} text-right`}>Invoiced</th>
                    <th className={`${premiumThClass} text-right`}>Paid</th>
                    <th className={`${premiumThClass} text-right`}>Balance</th>
                    <th className={`${premiumThClass} text-right`}>Days Overdue</th>
                    <th className={premiumThClass}>Bucket</th>
                  </tr>
                </thead>
                <tbody>
                  {aging.map(row => (
                    <tr key={row.studentId} className={premiumTrClass}>
                      <td className={premiumTdClass}>
                        <p className="font-medium text-ink dark:text-dark-text">{row.fullName}</p>
                        <p className="text-xs font-mono text-slate dark:text-dark-muted">{row.admissionNumber}</p>
                      </td>
                      <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>{row.className ?? "—"}</td>
                      <td className={`${premiumTdClass} text-right tabular-nums`}>{formatKES(row.totalInvoiced)}</td>
                      <td className={`${premiumTdClass} text-right tabular-nums text-success`}>{formatKES(row.totalPaid)}</td>
                      <td className={`${premiumTdClass} text-right tabular-nums text-danger font-semibold`}>{formatKES(row.balance)}</td>
                      <td className={`${premiumTdClass} text-right tabular-nums ${bucketVariant(row.bucket)}`}>{row.daysOverdue}d</td>
                      <td className={premiumTdClass}>
                        <span className={`text-xs font-semibold rounded-full px-2 py-1 ${
                          row.bucket === "0-30"  ? "bg-warn-bg text-warn" :
                          row.bucket === "31-60" ? "bg-warn-bg text-warn" :
                          "bg-danger-bg text-danger"
                        }`}>{row.bucket}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : tab === "volume" ? (
        volume.length === 0 ? (
          <EmptyState message="No payment data for the selected period." icon={<Calendar className="h-6 w-6" />} />
        ) : (
          <div className="bg-white border border-line rounded-xl p-6 dark:bg-dark-surface dark:border-dark-border">
            <h3 className="text-sm font-semibold text-ink mb-4 dark:text-dark-text">Daily payment volume (last 30 days)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={volume} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number) => [`KES ${v.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`, "Amount"]}
                  labelFormatter={l => `Date: ${l}`}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {volume.map((_, i) => <Cell key={i} fill="#0d9488" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      ) : (
        classes.length === 0 ? (
          <EmptyState message="No class collection data available." icon={<Users className="h-6 w-6" />} />
        ) : (
          <div className="bg-white border border-line rounded-xl p-6 dark:bg-dark-surface dark:border-dark-border">
            <h3 className="text-sm font-semibold text-ink mb-4 dark:text-dark-text">Collection rate by class (%)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={classes} layout="vertical" margin={{ top: 4, right: 16, left: 70, bottom: 4 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="className" tick={{ fontSize: 11 }} width={64} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, "Collection rate"]} />
                <Bar dataKey="collectionRate" radius={[0, 4, 4, 0]}>
                  {classes.map((c, i) => (
                    <Cell key={i} fill={c.collectionRate >= 80 ? "#16a34a" : c.collectionRate >= 50 ? "#d97706" : "#dc2626"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      )}
    </div>
  );
}
