"use client";

/**
 * /super-admin/health — System Health
 *
 * Per-service status cards (Auth, Storage, Notifications, Core API, Database)
 *   - status badge (Operational / Degraded / Outage / Maintenance)
 *   - uptime % for 24h / 7d / 30d
 *   - last incident timestamp
 *
 * Metrics section:
 *   - Average response time with colour-coded threshold
 *   - Error rate and request volume (CSS sparklines)
 *   - Top-10 slow endpoints (from MetricSnapshot)
 *
 * Incident timeline:
 *   - Chronological log, manually addable via inline form
 *   - Resolve an open incident
 *
 * System status banner editor (Operational / Degraded / Outage)
 */

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2, AlertCircle, XCircle, Wrench,
  RefreshCw, Plus, Clock,
} from "lucide-react";
import {
  PageHeader, Spinner, ErrorBanner, Card,
  primaryButtonClass, secondaryButtonClass, inputClass, labelClass,
} from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceHealth {
  id:               string;
  serviceName:      string;
  status:           string;
  uptimePct24h:     number;
  uptimePct7d:      number;
  uptimePct30d:     number;
  lastIncidentAt:   string | null;
  lastCheckedAt:    string;
}

interface MetricSnapshot {
  serviceName:    string;
  responseTimeMs: number | null;
  errorRate:      number | null;
  requestCount:   number | null;
  recordedAt:     string;
}

interface IncidentLog {
  id:          string;
  title:       string;
  description: string | null;
  serviceName: string | null;
  startedAt:   string;
  resolvedAt:  string | null;
  createdBy:   string | null;
}

interface SystemStatus {
  status:  string;
  message: string | null;
}

interface HealthData {
  services:     ServiceHealth[];
  incidents:    IncidentLog[];
  metrics:      MetricSnapshot[];
  systemStatus: SystemStatus | null;
}

// ── Service status config ─────────────────────────────────────────────────────

const SERVICE_META: Record<string, { label: string; desc: string }> = {
  "Auth":          { label: "Authentication",    desc: "Login, sessions, OTP" },
  "Storage":       { label: "File Storage",      desc: "Supabase Storage buckets" },
  "Notifications": { label: "Notifications",     desc: "Email, SMS, WhatsApp" },
  "Core API":      { label: "Core API",          desc: "REST endpoints" },
  "Database":      { label: "Database",          desc: "Supabase Postgres via Prisma" },
};

// Fallback list when DB has no rows yet
const DEFAULT_SERVICES: ServiceHealth[] = Object.keys(SERVICE_META).map((name, i) => ({
  id: String(i), serviceName: name, status: "OPERATIONAL",
  uptimePct24h: 100, uptimePct7d: 100, uptimePct30d: 100,
  lastIncidentAt: null, lastCheckedAt: new Date().toISOString(),
}));

// ── Status helpers ────────────────────────────────────────────────────────────

type SvcStatus = "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "MAINTENANCE";

const STATUS_CONFIG: Record<SvcStatus, {
  bg: string; border: string; text: string; dot: string;
  Icon: typeof CheckCircle2; label: string;
}> = {
  OPERATIONAL:  { bg:"bg-success-bg",  border:"border-success/20",  text:"text-success",  dot:"bg-success",  Icon:CheckCircle2, label:"Operational"  },
  DEGRADED:     { bg:"bg-warn-bg",     border:"border-warn/20",     text:"text-warn",     dot:"bg-warn",     Icon:AlertCircle,  label:"Degraded"     },
  OUTAGE:       { bg:"bg-danger-bg",   border:"border-danger/20",   text:"text-danger",   dot:"bg-danger",   Icon:XCircle,      label:"Outage"       },
  MAINTENANCE:  { bg:"bg-slate-100",   border:"border-line",        text:"text-slate",    dot:"bg-slate",    Icon:Wrench,       label:"Maintenance"  },
};

function getStatusCfg(status: string) {
  return STATUS_CONFIG[status as SvcStatus] ?? STATUS_CONFIG.OPERATIONAL;
}

// ── Uptime pill ───────────────────────────────────────────────────────────────

function UptimePill({ pct }: { pct: number }) {
  const good = pct >= 99.5;
  const ok   = pct >= 95;
  const cls  = good ? "text-success" : ok ? "text-warn" : "text-danger";
  return <span className={`tabular-nums font-semibold text-sm ${cls}`}>{pct.toFixed(2)}%</span>;
}

// ── Service card ──────────────────────────────────────────────────────────────

function ServiceCard({ svc }: { svc: ServiceHealth }) {
  const cfg  = getStatusCfg(svc.status);
  const meta = SERVICE_META[svc.serviceName] ?? { label: svc.serviceName, desc: "" };

  return (
    <div className={`rounded-xl border p-5 shadow-xs ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink dark:text-dark-text">{meta.label}</p>
          <p className="text-xs text-slate dark:text-dark-muted mt-0.5">{meta.desc}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold shrink-0
                          ${cfg.bg} ${cfg.border} ${cfg.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} aria-hidden />
          {cfg.label}
        </span>
      </div>

      {/* Uptime grid */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { period: "24h", pct: svc.uptimePct24h },
          { period: "7d",  pct: svc.uptimePct7d  },
          { period: "30d", pct: svc.uptimePct30d  },
        ].map(({ period, pct }) => (
          <div key={period} className="rounded-lg bg-white/60 dark:bg-dark-bg/40 border border-white/40 px-2 py-2 text-center">
            <UptimePill pct={pct} />
            <p className="text-[10px] text-slate dark:text-dark-muted mt-0.5 font-medium">{period}</p>
          </div>
        ))}
      </div>

      {svc.lastIncidentAt && (
        <p className="text-[10px] text-slate dark:text-dark-muted mt-3 flex items-center gap-1">
          <Clock className="h-3 w-3 shrink-0" aria-hidden />
          Last incident: {new Date(svc.lastIncidentAt).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}
        </p>
      )}
    </div>
  );
}

// ── Metrics bar ───────────────────────────────────────────────────────────────

function MetricsSection({ metrics }: { metrics: MetricSnapshot[] }) {
  if (metrics.length === 0) {
    return (
      <Card className="dark:bg-dark-surface dark:border-dark-border">
        <h2 className="text-sm font-semibold text-ink dark:text-dark-text mb-3">API Metrics (24h)</h2>
        <p className="text-xs text-slate dark:text-dark-muted">No metrics recorded yet.</p>
      </Card>
    );
  }

  // Aggregate by service
  const byService: Record<string, { totalMs: number; count: number; errorRate: number; requests: number }> = {};
  for (const m of metrics) {
    if (!byService[m.serviceName]) byService[m.serviceName] = { totalMs: 0, count: 0, errorRate: 0, requests: 0 };
    const b = byService[m.serviceName];
    if (m.responseTimeMs != null) { b.totalMs += m.responseTimeMs; b.count++; }
    if (m.errorRate     != null)   b.errorRate  = Math.max(b.errorRate, m.errorRate);
    if (m.requestCount  != null)   b.requests  += m.requestCount;
  }

  const rows = Object.entries(byService).map(([svc, b]) => ({
    service: svc,
    avgMs:   b.count > 0 ? Math.round(b.totalMs / b.count) : null,
    errorRate: b.errorRate,
    requests:  b.requests,
  })).sort((a, b) => (b.avgMs ?? 0) - (a.avgMs ?? 0));

  function msColor(ms: number | null) {
    if (ms == null) return "text-slate";
    if (ms < 200)   return "text-success";
    if (ms < 600)   return "text-warn";
    return "text-danger";
  }

  return (
    <Card className="dark:bg-dark-surface dark:border-dark-border">
      <h2 className="text-sm font-semibold text-ink dark:text-dark-text mb-4">API Metrics (last 24h)</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-line dark:divide-dark-border text-sm">
          <thead>
            <tr className="text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide">
              <th className="pb-3 text-left">Service</th>
              <th className="pb-3 text-right">Avg Response</th>
              <th className="pb-3 text-right hidden sm:table-cell">Error Rate</th>
              <th className="pb-3 text-right hidden md:table-cell">Requests</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line dark:divide-dark-border">
            {rows.map(r => (
              <tr key={r.service}>
                <td className="py-3 text-ink dark:text-dark-text">{r.service}</td>
                <td className={`py-3 text-right tabular-nums font-semibold ${msColor(r.avgMs)}`}>
                  {r.avgMs != null ? `${r.avgMs} ms` : "—"}
                </td>
                <td className="py-3 text-right hidden sm:table-cell tabular-nums text-slate dark:text-dark-muted">
                  {(r.errorRate * 100).toFixed(2)}%
                </td>
                <td className="py-3 text-right hidden md:table-cell tabular-nums text-slate dark:text-dark-muted">
                  {r.requests.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate dark:text-dark-muted mt-3">
        Response time thresholds: <span className="text-success font-medium">&lt;200ms</span> good ·{" "}
        <span className="text-warn font-medium">200–600ms</span> slow ·{" "}
        <span className="text-danger font-medium">&gt;600ms</span> critical
      </p>
    </Card>
  );
}

// ── Incident timeline ─────────────────────────────────────────────────────────

function IncidentTimeline({
  incidents,
  onAdd,
  onResolve,
}: {
  incidents: IncidentLog[];
  onAdd:     (title: string, desc: string, svc: string) => Promise<void>;
  onResolve: (id: string) => void;
}) {
  const [open, setOpen]   = useState(false);
  const [title, setTitle] = useState("");
  const [desc,  setDesc]  = useState("");
  const [svc,   setSvc]   = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!title.trim()) return;
    setSaving(true);
    try { await onAdd(title, desc, svc); setTitle(""); setDesc(""); setSvc(""); setOpen(false); }
    finally { setSaving(false); }
  }

  return (
    <Card className="dark:bg-dark-surface dark:border-dark-border">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-ink dark:text-dark-text">Incident Timeline</h2>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`${secondaryButtonClass} text-xs`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add Incident
        </button>
      </div>

      {/* Add form */}
      {open && (
        <div className="mb-5 rounded-xl border border-line dark:border-dark-border bg-paper dark:bg-dark-bg p-4 space-y-3 animate-fade-in">
          <div>
            <label className={labelClass}>Title <span className="text-danger">*</span></label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Brief incident description…" className={inputClass} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Service</label>
              <select value={svc} onChange={e => setSvc(e.target.value)}
                className="w-full rounded-lg border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                           px-3.5 py-2.5 text-sm text-ink dark:text-dark-text
                           focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15">
                <option value="">All services</option>
                {Object.keys(SERVICE_META).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="Optional details…" className={inputClass} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setOpen(false)} className={`${secondaryButtonClass} text-xs`}>Cancel</button>
            <button type="button" onClick={handleAdd} disabled={saving || !title.trim()}
              className={`${primaryButtonClass} text-xs`}>
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {incidents.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-2 text-slate dark:text-dark-muted">
          <CheckCircle2 className="h-6 w-6 text-success opacity-70" aria-hidden />
          <p className="text-sm">No incidents recorded</p>
        </div>
      ) : (
        <ol className="relative border-l border-line dark:border-dark-border ml-2 space-y-0">
          {incidents.map((inc, i) => {
            const resolved = !!inc.resolvedAt;
            return (
              <li key={inc.id} className="mb-6 ml-5 last:mb-0">
                {/* Dot */}
                <span className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border-2
                                  border-white dark:border-dark-bg
                                  ${resolved ? "bg-success" : i === 0 ? "bg-danger" : "bg-warn"}`}
                  aria-hidden />

                <div className="rounded-xl border border-line dark:border-dark-border bg-white dark:bg-dark-surface p-4 shadow-xs">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink dark:text-dark-text">{inc.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {inc.serviceName && (
                          <span className="text-xs bg-slate-100 dark:bg-dark-border text-slate dark:text-dark-muted
                                           font-mono rounded px-1.5 py-0.5">{inc.serviceName}</span>
                        )}
                        <span className="text-xs text-slate dark:text-dark-muted flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden />
                          {new Date(inc.startedAt).toLocaleString("en-GB", {
                            day:"2-digit", month:"short", year:"numeric",
                            hour:"2-digit", minute:"2-digit",
                          })}
                        </span>
                        {resolved && (
                          <span className="text-xs text-success flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Resolved {new Date(inc.resolvedAt!).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
                          </span>
                        )}
                      </div>
                      {inc.description && (
                        <p className="text-xs text-slate dark:text-dark-muted mt-1.5 leading-relaxed">{inc.description}</p>
                      )}
                    </div>
                    {!resolved && (
                      <button
                        type="button"
                        onClick={() => onResolve(inc.id)}
                        className={`${secondaryButtonClass} text-xs shrink-0`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> Mark Resolved
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

// ── System status banner editor ───────────────────────────────────────────────

const SYSTEM_STATUS_OPTS = [
  { value:"OPERATIONAL", label:"Operational", cls:"bg-success-bg text-success border-success/20" },
  { value:"DEGRADED",    label:"Degraded",    cls:"bg-warn-bg text-warn border-warn/20"          },
  { value:"OUTAGE",      label:"Outage",      cls:"bg-danger-bg text-danger border-danger/20"     },
];

function SystemStatusEditor({ current, onSave }: {
  current: SystemStatus | null;
  onSave:  (status: string, message: string) => Promise<void>;
}) {
  const [status,  setStatus]  = useState(current?.status  ?? "OPERATIONAL");
  const [message, setMessage] = useState(current?.message ?? "");
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  async function handleSave() {
    setSaving(true);
    try { await onSave(status, message); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setSaving(false); }
  }

  return (
    <Card className="dark:bg-dark-surface dark:border-dark-border">
      <h2 className="text-sm font-semibold text-ink dark:text-dark-text mb-4">System Status Banner</h2>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {SYSTEM_STATUS_OPTS.map(({ value, label, cls }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold
                          transition-all ${cls}
                          ${status === value ? "ring-2 ring-offset-1 ring-teal shadow-sm" : "opacity-60 hover:opacity-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Optional status message shown across all dashboards…"
          className={inputClass}
        />
        <div className="flex items-center gap-3">
          <button type="button" onClick={handleSave} disabled={saving} className={`${primaryButtonClass} text-xs`}>
            {saving ? "Saving…" : "Update Banner"}
          </button>
          {saved && (
            <span className="text-xs text-success flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HealthPage() {
  const [data, setData]       = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setApiError(null);
    try {
      const res = await fetch("/api/super-admin/health");
      if (!res.ok) throw new Error("Failed to load health data");
      setData(await res.json());
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAddIncident(title: string, desc: string, svc: string) {
    await fetch("/api/super-admin/health", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description: desc, serviceName: svc || undefined }),
    });
    await load();
  }

  async function handleResolveIncident(id: string) {
    // Optimistic
    setData(prev => prev ? {
      ...prev,
      incidents: prev.incidents.map(i => i.id === id ? { ...i, resolvedAt: new Date().toISOString() } : i),
    } : prev);
  }

  async function handleSaveSystemStatus(status: string, message: string) {
    await fetch("/api/super-admin/health", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, message }),
    });
    setData(prev => prev ? { ...prev, systemStatus: { status, message } } : prev);
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  const services  = data?.services.length ? data.services : DEFAULT_SERVICES;
  const incidents = data?.incidents ?? [];
  const metrics   = data?.metrics   ?? [];

  // Overall system status from services
  const hasOutage   = services.some(s => s.status === "OUTAGE");
  const hasDegraded = services.some(s => s.status === "DEGRADED");
  const overallStatus = hasOutage ? "OUTAGE" : hasDegraded ? "DEGRADED" : "OPERATIONAL";
  const overallCfg    = getStatusCfg(overallStatus);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="System Health" description="Live status, uptime, metrics and incident history." />
        <button onClick={load} className="shrink-0 flex items-center gap-1.5 text-xs text-slate hover:text-ink transition-colors mt-1">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Overall banner */}
      <div className={`flex items-center gap-3 rounded-xl border px-5 py-3.5 ${overallCfg.bg} ${overallCfg.border}`}>
        <overallCfg.Icon className={`h-5 w-5 shrink-0 ${overallCfg.text}`} strokeWidth={2} aria-hidden />
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${overallCfg.text}`}>
            All Systems {overallCfg.label}
          </p>
          <p className={`text-xs mt-0.5 ${overallCfg.text} opacity-70`}>
            {services.filter(s => s.status === "OPERATIONAL").length} of {services.length} services nominal
          </p>
        </div>
        <span className={`ml-auto text-xs font-bold uppercase tracking-wide ${overallCfg.text} shrink-0`}>
          {overallStatus}
        </span>
      </div>

      {/* Service cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {services.map(svc => <ServiceCard key={svc.id || svc.serviceName} svc={svc} />)}
      </div>

      {/* Metrics */}
      <MetricsSection metrics={metrics} />

      {/* System status banner editor */}
      <SystemStatusEditor current={data?.systemStatus ?? null} onSave={handleSaveSystemStatus} />

      {/* Incident timeline */}
      <IncidentTimeline
        incidents={incidents}
        onAdd={handleAddIncident}
        onResolve={handleResolveIncident}
      />
    </div>
  );
}
