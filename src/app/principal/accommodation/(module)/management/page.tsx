"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import Link from "next/link";
import {
  Wrench, AlertTriangle, Building2,
  Users, UserMinus, CheckCircle2, Shuffle, Lock,
  Unlock,
} from "lucide-react";
import {
  PageHeader, ErrorBanner, SuccessBanner,
  inputClass, primaryButtonClass, secondaryButtonClass, FormField,
} from "@/components/ui";
import Modal from "@/components/Modal";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";

const NAV_ITEMS = [
  { href: "/principal/accommodation/overview",      label: "Overview",    exact: true },
  { href: "/principal/accommodation/dormitories",  label: "Dormitories" },
  { href: "/principal/accommodation/allocations",  label: "Allocations" },
  { href: "/principal/accommodation/management",   label: "Management" },
  { href: "/principal/accommodation/analytics",    label: "Analytics" },
  { href: "/principal/accommodation/inspections",  label: "Inspections" },
  { href: "/principal/accommodation/reports",      label: "Reports" },
  { href: "/principal/accommodation/settings",     label: "Settings" },
];

interface DormRow {
  id: string; name: string; status: string; genderPolicy: string; structure: string;
  totalCapacity: number; occupiedCount: number; availableCount: number;
  boardingMaster: { id: string; fullName: string } | null;
  permittedForms: number[];
}
interface StudentRow {
  id: string; fullName: string; admissionNumber: string; className: string; form: number;
  currentAllocation: { dormId: string; dorm: { name: string }; cubicle: { name: string } | null } | null;
}

const STATUS_META: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  ACTIVE:            { label: "Active",      color: "text-success", icon: CheckCircle2 },
  UNDER_MAINTENANCE: { label: "Maintenance", color: "text-warn",    icon: Wrench },
  CLOSED:            { label: "Closed",      color: "text-slate",   icon: Lock },
};

// ── OccupancyBar ──────────────────────────────────────────────────────────────
function OccupancyBar({ pct }: { pct: number }) {
  const c = pct >= 100 ? "bg-danger" : pct >= 90 ? "bg-warn" : "bg-teal";
  return (
    <div className="w-full h-1.5 rounded-full bg-line overflow-hidden">
      <div className={`h-full rounded-full ${c}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ── TransferStudentModal ──────────────────────────────────────────────────────
function TransferStudentModal({ dorms, onClose, onDone }: {
  dorms: DormRow[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [search, setSearch]     = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toDormId, setToDormId] = useState("");
  const [reason, setReason]     = useState("");
  const [notes, setNotes]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const debounce = useCallback(() => {}, []);
  void debounce;

  useEffect(() => {
    if (search.length < 2) { setStudents([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/accommodation/students?q=${encodeURIComponent(search)}&boardingOnly=true`)
        .then((r) => r.ok ? r.json() : []).then(setStudents).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const selected = students.find((s) => s.id === selectedId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !toDormId) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/accommodation/dorm-management", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "TRANSFER_STUDENT", studentId: selectedId, toDormId, reason, notes }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      onDone(`${selected?.fullName} transferred to ${dorms.find((d) => d.id === toDormId)?.name}.`);
    } catch { setError("Network error."); } finally { setSaving(false); }
  }

  const activeDorms = dorms.filter((d) => d.status === "ACTIVE" && d.availableCount > 0);

  return (
    <Modal title="Transfer Student" description="Move a student from their current dormitory to a new one."
      onClose={onClose} size="md">
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Search student (boarding only)">
          <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Type name or admission number…" />
        </FormField>
        {loading && <div className="h-10 rounded-lg bg-line/40 animate-pulse" />}
        {students.length > 0 && (
          <div className="space-y-1 max-h-36 overflow-y-auto border border-border rounded-lg">
            {students.map((s) => (
              <button key={s.id} type="button" onClick={() => setSelectedId(s.id)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${selectedId === s.id ? "bg-teal text-white" : "hover:bg-background"}`}>
                <span className={selectedId === s.id ? "font-semibold" : "text-foreground"}>{s.fullName}</span>
                <span className={`text-xs ${selectedId === s.id ? "opacity-80" : "text-slate"}`}>
                  {s.currentAllocation?.dorm.name ?? "—"}
                </span>
              </button>
            ))}
          </div>
        )}
        {selected && (
          <div className="rounded-lg bg-teal/5 border border-teal/20 px-3 py-2 text-sm">
            <span className="font-medium text-teal">{selected.fullName}</span>
            <span className="text-slate ml-2">
              currently in {selected.currentAllocation?.dorm.name ?? "no dorm"}
              {selected.currentAllocation?.cubicle ? ` · ${selected.currentAllocation.cubicle.name}` : ""}
            </span>
          </div>
        )}
        <FormField label="Transfer to" required>
          <select className={inputClass} value={toDormId} onChange={(e) => setToDormId(e.target.value)}>
            <option value="">— Select destination dormitory —</option>
            {activeDorms.filter((d) => d.id !== selected?.currentAllocation?.dormId).map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.availableCount} spaces free)</option>
            ))}
          </select>
        </FormField>
        <FormField label="Reason" helper="Why is this student being transferred?">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Disciplinary reassignment, room consolidation…" />
        </FormField>
        <FormField label="Notes (optional)">
          <textarea className={`${inputClass} resize-none`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving || !selectedId || !toDormId}
            className={`${primaryButtonClass} disabled:opacity-40`}>
            {saving ? "Transferring…" : "Transfer student"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── MaintenanceModal ──────────────────────────────────────────────────────────
function MaintenanceModal({ dorm, dorms, onClose, onDone }: {
  dorm: DormRow; dorms: DormRow[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const isClosing = dorm.status === "ACTIVE";
  const [reason, setReason]     = useState("");
  const [notes, setNotes]       = useState("");
  const [relocate, setRelocate] = useState(false);
  const [toDormId, setToDormId] = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const action = isClosing ? "MAINTENANCE_CLOSE" : "MAINTENANCE_REOPEN";
      const body = isClosing
        ? { action, dormId: dorm.id, reason, notes, relocateStudents: relocate, toDormId: relocate ? toDormId : null }
        : { action, dormId: dorm.id, notes };
      const res = await fetch("/api/accommodation/dorm-management", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }

      if (isClosing) {
        const extra = relocate ? `, ${json.relocated} student(s) temporarily relocated` : `, ${json.snapshotted} student(s) held for restore`;
        onDone(`${dorm.name} set to maintenance${extra}.`);
      } else {
        const restoredMsg = json.restored > 0 ? `${json.restored} student(s) restored to their original beds` : "No students to restore";
        const skippedMsg  = json.skipped > 0 ? `, ${json.skipped} skipped (left school or reallocated)` : "";
        onDone(`${dorm.name} reopened. ${restoredMsg}${skippedMsg}.`);
      }
    } catch { setError("Network error."); } finally { setSaving(false); }
  }

  return (
    <Modal
      title={isClosing ? `Maintenance: ${dorm.name}` : `Reopen: ${dorm.name}`}
      description={
        isClosing
          ? "Close this dorm for maintenance. Student bed assignments are saved and restored when you reopen."
          : "Set this dorm back to Active. Students who were here will be restored to their original beds."
      }
      onClose={onClose} size="md">
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Reopen info banner */}
      {!isClosing && (
        <div className="mb-4 rounded-lg border border-teal/20 bg-teal/5 px-3 py-2.5 text-sm text-teal flex items-start gap-2">
          <Unlock className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Students who were in <strong>{dorm.name}</strong> when it closed will be automatically
            restored to their original beds. Students who have since graduated, been expelled, or
            transferred will be skipped and their beds left free.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {isClosing && (
          <>
            <FormField label="Reason for maintenance" required>
              <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Roof repair, plumbing works, renovation…" />
            </FormField>

            {/* Snapshot info — replaces the old misleading warning */}
            {dorm.occupiedCount > 0 && (
              <div className="rounded-lg border border-teal/20 bg-teal/5 px-3 py-2.5 text-sm text-teal flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <strong>{dorm.occupiedCount} student(s)</strong> will be held in a snapshot.
                  They appear as <em>unallocated</em> while the dorm is closed and are
                  automatically restored to their exact beds when you reopen.
                </span>
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-border p-3">
              <input type="checkbox" checked={relocate} onChange={(e) => setRelocate(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-teal" />
              <div>
                <p className="text-sm font-medium text-foreground">Also give temporary accommodation</p>
                <p className="text-xs text-slate">
                  Move all {dorm.occupiedCount} student(s) to another dorm while this one is closed.
                  Their snapshot is still saved for the restore.
                </p>
              </div>
            </label>

            {relocate && (
              <FormField label="Temporary dorm" required>
                <select className={inputClass} value={toDormId} onChange={(e) => setToDormId(e.target.value)}>
                  <option value="">— Select destination —</option>
                  {dorms
                    .filter((d) => d.id !== dorm.id && d.status === "ACTIVE" && d.availableCount >= dorm.occupiedCount)
                    .map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.availableCount} spaces free)</option>
                    ))}
                </select>
              </FormField>
            )}
          </>
        )}

        <FormField label="Notes (optional)">
          <textarea className={`${inputClass} resize-none`} rows={2} value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isClosing ? "Additional details about the maintenance work…" : "Notes on reopening…"} />
        </FormField>

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving || (isClosing && !reason) || (relocate && !toDormId)}
            className={`${isClosing ? "bg-warn text-white hover:bg-amber-600" : primaryButtonClass} inline-flex items-center gap-2 rounded-lg text-sm font-medium px-4 py-2.5 disabled:opacity-40 transition-all`}>
            {saving ? "Saving…" : isClosing ? "Close for maintenance" : "Reopen & restore students"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── BulkRemoveModal ───────────────────────────────────────────────────────────
function BulkRemoveModal({ dorm, onClose, onDone }: {
  dorm: DormRow; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [notes, setNotes]   = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const res = await fetch("/api/accommodation/dorm-management", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "BULK_REMOVE", dormId: dorm.id, reason, notes }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      onDone(`${json.removed} allocation(s) removed from ${dorm.name}.`);
    } catch { setError("Network error."); } finally { setSaving(false); }
  }

  return (
    <Modal title={`Remove All Allocations — ${dorm.name}`}
      description={`This will vacate all ${dorm.occupiedCount} current allocation(s) from this dorm. This cannot be undone.`}
      onClose={onClose} size="sm">
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Reason" required helper="Required — this will be recorded in all affected allocation histories.">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. End of term, Dorm closure…" />
        </FormField>
        <FormField label="Notes (optional)">
          <textarea className={`${inputClass} resize-none`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving || !reason}
            className="inline-flex items-center gap-2 rounded-lg bg-danger text-white text-sm font-medium px-4 py-2.5 hover:bg-red-600 transition-all disabled:opacity-40">
            {saving ? "Removing…" : "Remove all allocations"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── EmergencyRelocationModal ──────────────────────────────────────────────────
function EmergencyRelocationModal({ dorm, dorms, onClose, onDone }: {
  dorm: DormRow; dorms: DormRow[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [toDormId, setToDormId] = useState("");
  const [reason, setReason]     = useState("");
  const [notes, setNotes]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const res = await fetch("/api/accommodation/dorm-management", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "EMERGENCY_RELOCATION", fromDormId: dorm.id, toDormId: toDormId || null, reason, notes }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      onDone(`Emergency relocation complete. ${json.relocated} student(s) moved. ${dorm.name} set to maintenance.`);
    } catch { setError("Network error."); } finally { setSaving(false); }
  }

  return (
    <Modal title={`Emergency Relocation — ${dorm.name}`}
      description="Immediately vacate all students and mark dorm as under maintenance."
      onClose={onClose} size="md">
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      <div className="mb-4 rounded-lg border border-danger/20 bg-danger/5 dark:bg-danger/10 px-3 py-2.5 text-sm text-danger flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>This will immediately vacate all <strong>{dorm.occupiedCount}</strong> student(s) and set the dorm to <strong>Under Maintenance</strong>.</span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Reason for emergency relocation" required>
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Fire alarm, structural damage, flooding…" />
        </FormField>
        <FormField label="Relocate to (optional)" helper="Leave blank if students are being sent home or another arrangement.">
          <select className={inputClass} value={toDormId} onChange={(e) => setToDormId(e.target.value)}>
            <option value="">— No specific destination —</option>
            {dorms.filter((d) => d.id !== dorm.id && d.status === "ACTIVE").map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.availableCount} spaces free)</option>
            ))}
          </select>
        </FormField>
        <FormField label="Additional notes (optional)">
          <textarea className={`${inputClass} resize-none`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving || !reason}
            className="inline-flex items-center gap-2 rounded-lg bg-danger text-white text-sm font-medium px-4 py-2.5 hover:bg-red-600 transition-all disabled:opacity-40">
            <AlertTriangle className="h-4 w-4" /> {saving ? "Relocating…" : "Emergency relocate"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DormManagementPage() {
  const [dorms, setDorms]           = useState<DormRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Modal state
  const [transferDorms, setTransferDorms]       = useState<DormRow[] | null>(null);
  const [maintenanceDorm, setMaintenanceDorm]   = useState<DormRow | null>(null);
  const [emergencyDorm, setEmergencyDorm]       = useState<DormRow | null>(null);
  const [bulkRemoveDorm, setBulkRemoveDorm]     = useState<DormRow | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch("/api/accommodation/dormitories");
      if (res.ok) setDorms(await res.json());
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function flash(msg: string) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 4500); }

  const filtered = dorms.filter((d) => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && d.status !== statusFilter) return false;
    return true;
  });

  const maintenanceCount = dorms.filter((d) => d.status === "UNDER_MAINTENANCE").length;
  const closedCount      = dorms.filter((d) => d.status === "CLOSED").length;
  const totalOccupied    = dorms.reduce((s, d) => s + (d.occupiedCount ?? 0), 0);

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />
      <PageHeader
        title="Dorm Management"
        description="Transfers, maintenance closures, emergency relocations, and bulk operations."
        action={
          <button onClick={() => setTransferDorms(dorms)}
            className={primaryButtonClass}>
            <Shuffle className="h-4 w-4" /> Transfer Student
          </button>
        }
      />

      {successMsg && <div className="mb-4"><SuccessBanner message={successMsg} onDismiss={() => setSuccessMsg(null)} /></div>}
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Summary stats */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total dorms", value: dorms.length, icon: Building2, color: "text-teal", bg: "bg-teal/10" },
            { label: "Under maintenance", value: maintenanceCount, icon: Wrench, color: maintenanceCount > 0 ? "text-warn" : "text-slate", bg: maintenanceCount > 0 ? "bg-warn/10" : "bg-slate/10" },
            { label: "Closed", value: closedCount, icon: Lock, color: closedCount > 0 ? "text-slate" : "text-slate", bg: "bg-slate/10" },
            { label: "Total occupied", value: totalOccupied, icon: Users, color: "text-teal", bg: "bg-teal/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
                  <p className="text-xs text-slate mt-0.5">{label}</p>
                </div>
                <div className={`rounded-lg p-2 ${bg}`}><Icon className={`h-5 w-5 ${color}`} /></div>
              </div>
            </div>
          ))}
        </div>
      )}

      <WorkspaceToolbar>
        <WorkspaceToolbar.Search value={search} onChange={setSearch} placeholder="Search dormitories…" />
        <WorkspaceToolbar.Actions>
          <select value={statusFilter} onChange={(e) => setStatus(e.target.value)}
            className="text-xs border border-border rounded-lg px-2.5 py-2 bg-card">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="UNDER_MAINTENANCE">Maintenance</option>
            <option value="CLOSED">Closed</option>
          </select>
          <WorkspaceToolbar.RefreshButton onClick={() => load(true)} loading={refreshing} />
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-line/40/40 animate-pulse" />)}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Building2 className="h-10 w-10 text-slate/50" />
          <p className="text-foreground font-medium">No dormitories found</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((dorm) => {
          const meta = STATUS_META[dorm.status];
          const StatusIcon = meta.icon;
          const pct = dorm.totalCapacity > 0 ? Math.round(((dorm.occupiedCount ?? 0) / dorm.totalCapacity) * 100) : 0;
          return (
            <div key={dorm.id} className={`rounded-xl border bg-card p-5 ${dorm.status === "UNDER_MAINTENANCE" ? "border-warn/30 dark:border-warn/20" : dorm.status === "CLOSED" ? "border-border/50 opacity-80" : "border-border"}`}>
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Link href={`/principal/accommodation/dormitories/${dorm.id}`}
                      className="text-sm font-semibold text-foreground hover:text-teal transition-colors dark:hover:text-teal">
                      {dorm.name}
                    </Link>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${meta.color}`}>
                      <StatusIcon className="h-3 w-3" /> {meta.label}
                    </span>
                  </div>
                  {dorm.boardingMaster && (
                    <p className="text-xs text-slate mb-2">
                      <Link href={`/principal/staff/${dorm.boardingMaster.id}`}
                        className="hover:text-teal transition-colors">
                        {dorm.boardingMaster.fullName}
                      </Link>
                      {" · Boarding master"}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-slate mb-3">
                    <span>{dorm.occupiedCount ?? 0} occupied</span>
                    <span>{dorm.availableCount} available</span>
                    <span>{dorm.totalCapacity} total</span>
                    <span className="font-semibold text-foreground">{pct}%</span>
                  </div>
                  <OccupancyBar pct={pct} />
                </div>
                {/* Actions */}
                <div className="flex flex-wrap gap-2 shrink-0">
                  {dorm.status === "ACTIVE" && (
                    <>
                      <button onClick={() => setMaintenanceDorm(dorm)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-warn/30 text-warn bg-warn-bg/40 hover:bg-warn/10 text-xs font-medium transition-all dark:bg-warn/10">
                        <Wrench className="h-3.5 w-3.5" /> Maintenance
                      </button>
                      <button onClick={() => setEmergencyDorm(dorm)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-danger/30 text-danger bg-danger/5 hover:bg-danger/10 text-xs font-medium transition-all">
                        <AlertTriangle className="h-3.5 w-3.5" /> Emergency
                      </button>
                      {(dorm.occupiedCount ?? 0) > 0 && (
                        <button onClick={() => setBulkRemoveDorm(dorm)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-slate hover:border-danger/30 hover:text-danger hover:bg-danger/5 text-xs font-medium transition-all">
                          <UserMinus className="h-3.5 w-3.5" /> Clear allocations
                        </button>
                      )}
                    </>
                  )}
                  {dorm.status === "UNDER_MAINTENANCE" && (
                    <button onClick={() => setMaintenanceDorm(dorm)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal text-white hover:bg-teal-dark text-xs font-medium transition-all">
                      <Unlock className="h-3.5 w-3.5" /> Reopen
                    </button>
                  )}
                  {dorm.status === "CLOSED" && (
                    <button onClick={() => setMaintenanceDorm(dorm)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal text-white hover:bg-teal-dark text-xs font-medium transition-all">
                      <Unlock className="h-3.5 w-3.5" /> Reactivate
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {transferDorms && (
        <TransferStudentModal dorms={dorms} onClose={() => setTransferDorms(null)}
          onDone={(msg) => { setTransferDorms(null); flash(msg); load(true); }} />
      )}
      {maintenanceDorm && (
        <MaintenanceModal dorm={maintenanceDorm} dorms={dorms} onClose={() => setMaintenanceDorm(null)}
          onDone={(msg) => { setMaintenanceDorm(null); flash(msg); load(true); }} />
      )}
      {emergencyDorm && (
        <EmergencyRelocationModal dorm={emergencyDorm} dorms={dorms} onClose={() => setEmergencyDorm(null)}
          onDone={(msg) => { setEmergencyDorm(null); flash(msg); load(true); }} />
      )}
      {bulkRemoveDorm && (
        <BulkRemoveModal dorm={bulkRemoveDorm} onClose={() => setBulkRemoveDorm(null)}
          onDone={(msg) => { setBulkRemoveDorm(null); flash(msg); load(true); }} />
      )}
    </div>
  );
}
