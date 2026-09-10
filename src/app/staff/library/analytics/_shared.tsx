"use client";
/**
 * Shared utilities for the Library Analytics section.
 * Imported by every analytics sub-page.
 */

import { ReactNode } from "react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ── Navigation items ───────────────────────────────────────────────────────

export const analyticsNavItems = [
  { href: "/staff/library",                   label: "← Library",     exact: true },
  { href: "/staff/library/analytics",         label: "Overview",      exact: true },
  { href: "/staff/library/analytics/borrowing", label: "Borrowing" },
  { href: "/staff/library/analytics/books",     label: "Books" },
  { href: "/staff/library/analytics/fines",     label: "Fines" },
  { href: "/staff/library/analytics/students",  label: "Students" },
  { href: "/staff/library/analytics/inventory", label: "Inventory" },
  { href: "/staff/library/analytics/reports",   label: "Reports" },
];

// ── Teal colour palette (matches Bidii design tokens) ─────────────────────

export const CHART_COLORS = {
  primary:   "#0d9488",  // teal
  secondary: "#6366f1",  // indigo
  success:   "#22c55e",
  warn:      "#f59e0b",
  danger:    "#ef4444",
  slate:     "#94a3b8",
  teal2:     "#5eead4",
  info:      "#3b82f6",
};

export const CONDITION_COLORS: Record<string, string> = {
  EXCELLENT: CHART_COLORS.success,
  GOOD:      CHART_COLORS.primary,
  FAIR:      CHART_COLORS.warn,
  DAMAGED:   CHART_COLORS.danger,
  LOST:      "#6b7280",
};

// ── KPI Card ──────────────────────────────────────────────────────────────

interface KpiProps {
  label:     string;
  value:     string | number;
  sub?:      string;
  icon:      ReactNode;
  variant?:  "default" | "success" | "warn" | "danger" | "info";
  trend?:    number; // positive = up, negative = down
}

export function KpiCard({ label, value, sub, icon, variant = "default", trend }: KpiProps) {
  const colorMap = {
    default: { bg: "bg-teal/10",    text: "text-teal",    border: "border-border" },
    success: { bg: "bg-success/10", text: "text-success", border: "border-success/20" },
    warn:    { bg: "bg-warn/10",    text: "text-warn",    border: "border-warn/20" },
    danger:  { bg: "bg-danger/10",  text: "text-danger",  border: "border-danger/20" },
    info:    { bg: "bg-info/10",    text: "text-info",    border: "border-info/20" },
  }[variant];

  return (
    <div className={`rounded-xl border ${colorMap.border} bg-card p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`h-10 w-10 rounded-lg ${colorMap.bg} ${colorMap.text} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        {trend !== undefined && trend !== 0 && (
          <span className={`text-xs font-semibold ${trend > 0 ? "text-success" : "text-danger"}`}>
            {trend > 0 ? "▲" : "▼"} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-foreground mt-3 leading-none">{value}</p>
      <p className="text-sm text-slate mt-1">{label}</p>
      {sub && <p className="text-xs text-slate/60 mt-0.5/60">{sub}</p>}
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────

export function Section({ title, description, children, action }: {
  title: string; description?: string; children: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="text-sm text-slate mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Chart card ─────────────────────────────────────────────────────────────

export function ChartCard({ title, children, className = "" }: {
  title: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <p className="text-sm font-semibold text-foreground mb-4">{title}</p>
      {children}
    </div>
  );
}

// ── Recharts wrappers ─────────────────────────────────────────────────────

export function TrendLineChart({ data, dataKey, color = CHART_COLORS.primary, height = 200 }: {
  data: { name: string; value: number }[];
  dataKey?: string;
  color?: string;
  height?: number;
}) {
  if (!data.length) return <p className="text-xs text-slate text-center py-8">No data</p>;

  // Read CSS variable values for dark-mode-aware chart chrome (Req 5.1, 12.2)
  const tooltipBg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-card').trim() || '#FFFFFF'
    : '#FFFFFF';
  const tooltipFg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-card-foreground').trim() || '#1F2933'
    : '#1F2933';
  const gridColor = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#E8EDF2')
    : '#E8EDF2';
  const tickColor = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--color-muted-foreground').trim() || '#667085')
    : '#667085';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: tickColor }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: tickColor }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, background: tooltipBg, border: '1px solid var(--color-border)' }}
          labelStyle={{ color: tooltipFg }}
          itemStyle={{ color: tooltipFg }}
        />
        <Line type="monotone" dataKey={dataKey ?? "value"} stroke={color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TrendBarChart({ data, bars, height = 200 }: {
  data: Record<string, string | number>[];
  bars: { key: string; color: string; label?: string }[];
  height?: number;
}) {
  if (!data.length) return <p className="text-xs text-slate text-center py-8">No data</p>;

  // Read CSS variable values for dark-mode-aware chart chrome (Req 5.1, 12.2, 12.5)
  const tooltipBg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-card').trim() || '#FFFFFF'
    : '#FFFFFF';
  const tooltipFg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-card-foreground').trim() || '#1F2933'
    : '#1F2933';
  const legendFg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-foreground').trim() || '#1F2933'
    : '#1F2933';
  const gridColor = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#E8EDF2')
    : '#E8EDF2';
  const tickColor = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--color-muted-foreground').trim() || '#667085')
    : '#667085';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: tickColor }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: tickColor }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, background: tooltipBg, border: '1px solid var(--color-border)' }}
          labelStyle={{ color: tooltipFg }}
          itemStyle={{ color: tooltipFg }}
        />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: legendFg }} />}
        {bars.map(b => <Bar key={b.key} dataKey={b.key} name={b.label ?? b.key} fill={b.color} radius={[3, 3, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 200 }: {
  data: { name: string; value: number; color: string }[];
  height?: number;
}) {
  if (!data.length) return <p className="text-xs text-slate text-center py-8">No data</p>;

  // Read CSS variable values for dark-mode-aware chart chrome (Req 5.1, 12.2, 12.5)
  const tooltipBg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-card').trim() || '#FFFFFF'
    : '#FFFFFF';
  const tooltipFg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-card-foreground').trim() || '#1F2933'
    : '#1F2933';
  const legendFg = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-foreground').trim() || '#1F2933'
    : '#1F2933';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius="55%" outerRadius="80%"
          dataKey="value" nameKey="name" paddingAngle={2}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, background: tooltipBg, border: '1px solid var(--color-border)' }}
          labelStyle={{ color: tooltipFg }}
          itemStyle={{ color: tooltipFg }}
          formatter={(value: number, name: string) => [value.toLocaleString(), name]}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: legendFg }} iconType="circle" iconSize={10} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Ranked table row ───────────────────────────────────────────────────────

export function RankRow({ rank, primary, secondary, value, valueLabel, highlight }: {
  rank: number; primary: string; secondary?: string;
  value: string | number; valueLabel?: string; highlight?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 ${highlight ? "bg-teal-50/30" : "hover:bg-slate-50/40"} transition-colors`}>
      <span className="text-xs font-bold text-slate w-5 shrink-0">#{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{primary}</p>
        {secondary && <p className="text-xs text-slate truncate">{secondary}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold ${highlight ? "text-teal" : "text-foreground"}`}>{value}</p>
        {valueLabel && <p className="text-[10px] text-slate">{valueLabel}</p>}
      </div>
    </div>
  );
}

// ── Window selector ────────────────────────────────────────────────────────

export function WindowSelector({ value, onChange }: {
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-background overflow-hidden">
      {[["30","30d"],["90","90d"],["180","6m"],["365","1y"]].map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${value === v ? "bg-teal text-white" : "text-slate hover:text-foreground"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

// ── Skeleton loader ────────────────────────────────────────────────────────

export function AnalyticsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-line/40 animate-pulse" />
      ))}
    </div>
  );
}

// ── Day-of-week labels ─────────────────────────────────────────────────────

export const DOW_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ── Export helpers ─────────────────────────────────────────────────────────

export function exportToCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function printSection(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<html><head><title>Library Report</title>
    <style>body{font-family:system-ui;padding:24px;font-size:13px;}table{width:100%;border-collapse:collapse;}td,th{border:1px solid #e2e8f0;padding:6px 10px;text-align:left;}th{background:#f8fafc;font-weight:600;}h1,h2{margin-bottom:8px;}</style>
    </head><body>${el.innerHTML}</body></html>`);
  win.document.close();
  win.print();
}
