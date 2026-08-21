"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Shield, Plus, AlertTriangle, CheckCircle2, Loader2, X, PauseCircle,
} from "lucide-react";
import {
  PageHeader, Badge, ErrorBanner, SuccessBanner, FormField,
  inputClass, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";

import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import Modal from "@/components/Modal";

// ── Types ──────────────────────────────────────────────────────────────────

interface Policy {
  id: string; patronType: string; label: string | null;
  maxBooksAllowed: number; borrowDays: number; gracePeriodDays: number;
  finePerDay: number; countWeekends: boolean; countHolidays: boolean;
  maxRenewals: number; fineBlockThreshold: number;
  lostBookMultiplier: number; lostBookFixedFee: number;
  damagedBookFineRate: number; reservationsAllowed: boolean; isActive: boolean;
}

interface FinePause {
  id: string; scope: string; label: string; reason: string | null;
  startDate: string; endDate: string | null; isActive: boolean; createdAt: string;
}

interface FineAuditRow {
  id: string; cardId: string; borrowId: string | null; eventType: string;
  amount: number; balanceAfter: number; reason: string | null; createdAt: string;
}

const ALL_PATRON_TYPES = ["DEFAULT","STUDENT","TEACHER","BOARDING","DAY_SCHOLAR","JUNIOR","SENIOR"];
const PATRON_LABELS: Record<string,string> = {
  DEFAULT: "Default (all students)", STUDENT: "Students", TEACHER: "Teachers",
  BOARDING: "Boarding Students", DAY_SCHOLAR: "Day Scholars",
  JUNIOR: "Junior Classes (Forms 1–2)", SENIOR: "Senior Classes (Forms 3–4)",
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

// ── PolicyForm ─────────────────────────────────────────────────────────────

function PolicyForm({ initial, onSave, onCancel, saving, error, availablePatronTypes }: {
  initial: Partial<Policy>; onSave: (d: Partial<Policy>) => void;
  onCancel: () => void; saving: boolean; error: string | null;
  availablePatronTypes: string[];
}) {
  const [f, setF] = useState({
    patronType:          initial.patronType          ?? "DEFAULT",
    label:               initial.label               ?? "",
    maxBooksAllowed:     String(initial.maxBooksAllowed    ?? 3),
    borrowDays:          String(initial.borrowDays         ?? 14),
    gracePeriodDays:     String(initial.gracePeriodDays    ?? 0),
    finePerDay:          String(initial.finePerDay         ?? 5),
    countWeekends:       initial.countWeekends        ?? true,
    countHolidays:       initial.countHolidays        ?? false,
    maxRenewals:         String(initial.maxRenewals        ?? 1),
    fineBlockThreshold:  String(initial.fineBlockThreshold ?? 0),
    lostBookMultiplier:  String(initial.lostBookMultiplier ?? 1),
    lostBookFixedFee:    String(initial.lostBookFixedFee   ?? 500),
    damagedBookFineRate: String(initial.damagedBookFineRate ?? 0.3),
    reservationsAllowed: initial.reservationsAllowed  ?? true,
    isActive:            initial.isActive             ?? true,
  });
  const set = (k: string, v: string | boolean) => setF(p => ({ ...p, [k]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSave({ ...f, maxBooksAllowed: Number(f.maxBooksAllowed), borrowDays: Number(f.borrowDays), gracePeriodDays: Number(f.gracePeriodDays), finePerDay: Number(f.finePerDay), maxRenewals: Number(f.maxRenewals), fineBlockThreshold: Number(f.fineBlockThreshold), lostBookMultiplier: Number(f.lostBookMultiplier), lostBookFixedFee: Number(f.lostBookFixedFee), damagedBookFineRate: Number(f.damagedBookFineRate) }); }} className="space-y-5">
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Patron type" required>
          <select className={inputClass} value={f.patronType} onChange={e => set("patronType", e.target.value)} disabled={!!initial.id}>
            {availablePatronTypes.map(t => <option key={t} value={t}>{PATRON_LABELS[t]}</option>)}
          </select>
        </FormField>
        <FormField label="Label (optional)">
          <input className={inputClass} placeholder="e.g. Science Library Members" value={f.label} onChange={e => set("label", e.target.value)} />
        </FormField>
      </div>

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="text-xs font-semibold text-slate px-1">Borrowing Limits</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { k: "maxBooksAllowed", l: "Max books out" },
            { k: "borrowDays",      l: "Borrow days" },
            { k: "gracePeriodDays", l: "Grace period (days)" },
            { k: "maxRenewals",     l: "Max renewals" },
          ].map(fi => (
            <FormField key={fi.k} label={fi.l}>
              <input type="number" min="0" className={inputClass} value={(f as Record<string, unknown>)[fi.k] as string} onChange={e => set(fi.k, e.target.value)} />
            </FormField>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="text-xs font-semibold text-slate px-1">Fine Configuration</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { k: "finePerDay",          l: "Fine / day (KES)" },
            { k: "fineBlockThreshold",  l: "Block threshold (KES)" },
            { k: "lostBookFixedFee",    l: "Lost book fee (KES)" },
            { k: "lostBookMultiplier",  l: "Lost × cost" },
            { k: "damagedBookFineRate", l: "Damaged rate (× cost)" },
          ].map(fi => (
            <FormField key={fi.k} label={fi.l}>
              <input type="number" min="0" step="0.01" className={inputClass} value={(f as Record<string, unknown>)[fi.k] as string} onChange={e => set(fi.k, e.target.value)} />
            </FormField>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 mt-3">
          {[
            { k: "countWeekends",  l: "Count weekends toward overdue" },
            { k: "countHolidays",  l: "Count holidays toward overdue" },
            { k: "reservationsAllowed", l: "Allow reservations" },
            { k: "isActive",       l: "Policy is active" },
          ].map(fi => (
            <label key={fi.k} className="flex items-center gap-2 cursor-pointer text-sm text-ink">
              <input type="checkbox" checked={!!(f as Record<string,unknown>)[fi.k]} onChange={e => set(fi.k, e.target.checked)} className="rounded border-line accent-teal" />
              {fi.l}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : <><Shield className="h-4 w-4" />Save Policy</>}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const [policies, setPolicies]   = useState<Policy[]>([]);
  const [pauses, setPauses]       = useState<FinePause[]>([]);
  const [auditRows, setAuditRows] = useState<FineAuditRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [boardingType, setBoardingType] = useState<string>("DAY_AND_BOARDING");
  const [tab, setTab]             = useState<"policies"|"pauses"|"audit">("policies");
  const [editPolicy, setEditPolicy] = useState<Policy | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveErr, setSaveErr]       = useState<string | null>(null);
  const [saveOk, setSaveOk]         = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseScope, setPauseScope]   = useState("SCHOOL_WIDE");
  const [pauseLabel, setPauseLabel]   = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [pauseStart, setPauseStart]   = useState(new Date().toISOString().slice(0,10));
  const [pauseEnd, setPauseEnd]       = useState("");
  const [pauseStudentId, setPauseStudentId] = useState("");
  const [savingPause, setSavingPause] = useState(false);
  const [pauseErr, setPauseErr]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, ps, au, school] = await Promise.all([
      fetch("/api/library/policies").then(r => r.ok ? r.json() : []),
      fetch("/api/library/fines/pause").then(r => r.ok ? r.json() : []),
      fetch("/api/library/fines/audit?take=50").then(r => r.ok ? r.json() : { items: [] }),
      fetch("/api/school/settings").then(r => r.ok ? r.json() : null),
    ]);
    setPolicies(p); setPauses(ps); setAuditRows(au.items ?? []);
    if (school?.boardingType) setBoardingType(school.boardingType);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSavePolicy(data: Partial<Policy>) {
    setSaving(true); setSaveErr(null);
    const res = await fetch("/api/library/policies", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    const json = await res.json(); setSaving(false);
    if (!res.ok) { setSaveErr(json.error ?? "Could not save policy."); return; }
    setSaveOk(true); setTimeout(() => setSaveOk(false), 3000);
    setEditPolicy(null); setShowCreate(false); load();
  }

  async function handleCreatePause() {
    setSavingPause(true); setPauseErr(null);
    const res = await fetch("/api/library/fines/pause", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: pauseScope, label: pauseLabel, reason: pauseReason, startDate: pauseStart, endDate: pauseEnd || undefined, studentId: pauseStudentId || undefined }),
    });
    const json = await res.json(); setSavingPause(false);
    if (!res.ok) { setPauseErr(json.error ?? "Failed."); return; }
    setShowPauseModal(false); setPauseLabel(""); setPauseReason(""); setPauseEnd(""); setPauseStudentId(""); load();
  }

  async function deactivatePause(id: string) {
    await fetch(`/api/library/fines/pause?id=${id}`, { method: "DELETE" }); load();
  }

  // Patron types available depend on school boarding configuration.
  // BOARDING and DAY_SCHOLAR are irrelevant (and confusing) for day-only schools.
  const availablePatronTypes = ALL_PATRON_TYPES.filter(t =>
    boardingType !== "DAY_ONLY" || (t !== "BOARDING" && t !== "DAY_SCHOLAR")
  );

  // existingTypes preserved for future use (patron type uniqueness check)

  return (
    <div>
      <PageHeader title="Library Policy Engine" description="Configure circulation rules per patron type, manage fine pauses, and view the audit log." />

      {saveOk && <SuccessBanner message="Policy saved successfully." />}

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-line mb-6 overflow-x-auto">
        {[["policies","Policies"],["pauses","Fine Pauses"],["audit","Audit Log"]].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v as typeof tab)}
            className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === v ? "border-teal text-teal" : "border-transparent text-slate hover:text-ink"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Policies tab ── */}
      {tab === "policies" && (
        <div>
          <WorkspaceToolbar>
            <WorkspaceToolbar.Actions>
              <button className={primaryButtonClass} onClick={() => { setShowCreate(true); setEditPolicy(null); }}>
                <Plus className="h-4 w-4" /> Add Policy
              </button>
            </WorkspaceToolbar.Actions>
          </WorkspaceToolbar>

          {loading && <div className="space-y-2">{[...Array(3)].map((_,i) => <div key={i} className="h-20 rounded-xl bg-line/40 animate-pulse" />)}</div>}

          {(showCreate || editPolicy) && (
            <div className="mb-6 rounded-xl border border-line bg-white p-5 dark:bg-dark-surface dark:border-dark-border animate-slide-down">
              <p className="text-sm font-semibold text-ink mb-4">{editPolicy ? `Edit — ${PATRON_LABELS[editPolicy.patronType]}` : "New Policy"}</p>
              <PolicyForm initial={editPolicy ?? {}} onSave={handleSavePolicy} onCancel={() => { setShowCreate(false); setEditPolicy(null); setSaveErr(null); }} saving={saving} error={saveErr} availablePatronTypes={availablePatronTypes} />
            </div>
          )}

          <div className="space-y-3">
            {policies.map(p => (
              <div key={p.id} className="rounded-xl border border-line bg-white p-4 dark:bg-dark-surface dark:border-dark-border">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-ink">{PATRON_LABELS[p.patronType]}</p>
                      {!p.isActive && <Badge variant="default">Inactive</Badge>}
                    </div>
                    {p.label && <p className="text-xs text-slate mt-0.5">{p.label}</p>}
                  </div>
                  <button onClick={() => { setEditPolicy(p); setShowCreate(false); }} className="text-xs text-teal hover:underline font-medium shrink-0">Edit</button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3 text-center">
                  {[
                    { l: "Max books",  v: p.maxBooksAllowed },
                    { l: "Days",       v: p.borrowDays },
                    { l: "Grace",      v: p.gracePeriodDays },
                    { l: "Fine/day",   v: `KES ${p.finePerDay}` },
                    { l: "Renewals",   v: p.maxRenewals },
                    { l: "Block at",   v: p.fineBlockThreshold > 0 ? `KES ${p.fineBlockThreshold}` : "Any fine" },
                  ].map(s => (
                    <div key={s.l} className="rounded-lg border border-line p-2">
                      <p className="text-sm font-bold text-ink">{s.v}</p>
                      <p className="text-[10px] text-slate">{s.l}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {!loading && policies.length === 0 && (
            <div className="text-center py-12">
              <p className="text-slate text-sm mb-3">No policies configured yet.</p>
              <button className={primaryButtonClass} onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Create Default Policy</button>
            </div>
          )}
        </div>
      )}

      {/* ── Fine Pauses tab ── */}
      {tab === "pauses" && (
        <div>
          <WorkspaceToolbar>
            <WorkspaceToolbar.Actions>
              <button className={primaryButtonClass} onClick={() => setShowPauseModal(true)}><PauseCircle className="h-4 w-4" />New Fine Pause</button>
            </WorkspaceToolbar.Actions>
          </WorkspaceToolbar>

          {pauses.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-slate text-sm mb-3">No fine pauses configured.</p>
              <button className={primaryButtonClass} onClick={() => setShowPauseModal(true)}><PauseCircle className="h-4 w-4" />Create Fine Pause</button>
            </div>
          )}

          <div className="space-y-2">
            {pauses.map(p => (
              <div key={p.id} className={`rounded-xl border p-4 flex items-center gap-4 ${p.isActive ? "border-warn/30 bg-warn-bg/20" : "border-line bg-paper opacity-70"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><p className="font-medium text-ink">{p.label}</p><Badge variant={p.isActive ? "warn" : "default"}>{p.isActive ? "Active" : "Ended"}</Badge></div>
                  <p className="text-xs text-slate mt-0.5">{p.scope} · {fmt(p.startDate)}{p.endDate ? ` → ${fmt(p.endDate)}` : " → open-ended"}</p>
                  {p.reason && <p className="text-xs text-slate/70 mt-0.5">{p.reason}</p>}
                </div>
                {p.isActive && <button onClick={() => deactivatePause(p.id)} className={secondaryButtonClass + " text-xs py-1.5 px-3"}><X className="h-3.5 w-3.5" />End Pause</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Audit Log tab ── */}
      {tab === "audit" && (
        <div>
          {auditRows.length === 0 && !loading && <p className="text-slate text-sm text-center py-12">No fine audit events yet.</p>}
          {auditRows.length > 0 && (
            <div className="bg-white border border-line rounded-xl overflow-hidden dark:bg-dark-surface dark:border-dark-border">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-line bg-slate-50/80 text-left text-[10px] font-semibold text-slate uppercase tracking-wide">
                  <th className="px-4 py-3">Event</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Balance after</th><th className="px-4 py-3 hidden sm:table-cell">Reason</th><th className="px-4 py-3">Date</th>
                </tr></thead>
                <tbody>
                  {auditRows.map(r => (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-slate-50/40">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 font-medium ${r.eventType === "CLEAR" ? "text-success" : r.eventType === "CHARGE" ? "text-danger" : "text-slate"}`}>
                          {r.eventType === "CLEAR" ? <CheckCircle2 className="h-3.5 w-3.5" /> : r.eventType === "CHARGE" ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                          {r.eventType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={r.amount < 0 ? "text-success" : r.amount > 0 ? "text-danger" : "text-slate"}>
                          {r.amount > 0 ? "+" : ""}{r.amount.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate">{r.balanceAfter.toFixed(2)}</td>
                      <td className="px-4 py-3 hidden sm:table-cell text-slate max-w-[200px] truncate">{r.reason ?? "—"}</td>
                      <td className="px-4 py-3 text-slate">{fmt(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pause modal */}
      {showPauseModal && (
        <Modal title="New Fine Pause" onClose={() => setShowPauseModal(false)} size="md"
          footer={
            <div className="flex justify-between gap-3">
              <button className={secondaryButtonClass} onClick={() => setShowPauseModal(false)}>Cancel</button>
              <button className={primaryButtonClass} disabled={savingPause || !pauseLabel.trim()} onClick={handleCreatePause}>
                {savingPause ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : <><PauseCircle className="h-4 w-4" />Create Pause</>}
              </button>
            </div>
          }>
          <div className="space-y-4">
            {pauseErr && <ErrorBanner message={pauseErr} />}
            <FormField label="Scope">
              <select className={inputClass} value={pauseScope} onChange={e => setPauseScope(e.target.value)}>
                {["SCHOOL_WIDE","STUDENT","EXAM_PERIOD","HOLIDAY","SPECIAL_EVENT"].map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
              </select>
            </FormField>
            {pauseScope === "STUDENT" && (
              <FormField label="Student ID" helper="Enter the student's system ID">
                <input className={inputClass} value={pauseStudentId} onChange={e => setPauseStudentId(e.target.value)} />
              </FormField>
            )}
            <FormField label="Label" required><input className={inputClass} placeholder="e.g. Mid-term break 2026" value={pauseLabel} onChange={e => setPauseLabel(e.target.value)} /></FormField>
            <FormField label="Reason"><input className={inputClass} value={pauseReason} onChange={e => setPauseReason(e.target.value)} /></FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Start date"><input type="date" className={inputClass} value={pauseStart} onChange={e => setPauseStart(e.target.value)} /></FormField>
              <FormField label="End date" helper="Leave blank = open-ended"><input type="date" className={inputClass} value={pauseEnd} onChange={e => setPauseEnd(e.target.value)} /></FormField>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
