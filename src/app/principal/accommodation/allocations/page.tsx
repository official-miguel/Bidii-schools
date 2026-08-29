"use client";

import { useEffect, useState, useCallback, FormEvent, useRef } from "react";
import Link from "next/link";
import {
  UserCheck, X, BedDouble, Building2,
  AlertTriangle, CheckCircle2, UserMinus, Plus,
  Zap, Users, Check, Shuffle, ArrowRight,
  ClipboardList, Clock, Sparkles,
} from "lucide-react";
import {
  PageHeader, ErrorBanner, SuccessBanner,
  inputClass, primaryButtonClass, secondaryButtonClass, FormField,
} from "@/components/ui";
import SearchableSelect from "@/components/SearchableSelect";
import Modal from "@/components/Modal";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CurrentAllocation {
  id: string; dormId: string;
  dorm: { name: string };
  cubicle: { name: string } | null;
  bed: { label: string; bedType: string } | null;
  sleepingPosition: { position: string | null; customLabel: string | null } | null;
  allocationDate: string;
}
interface StudentRow {
  id: string; fullName: string; admissionNumber: string;
  className: string; form: number;
  currentAllocation: CurrentAllocation | null;
}
interface DormOption {
  id: string; name: string; genderPolicy: string; structure: string;
  totalCapacity: number; occupiedCount: number; availableCount: number;
  allocationPolicy: string; permittedForms: number[];
}
interface CubicleOption {
  id: string; name: string;
  _count: { allocations: number; sleepingPositions: number };
}
interface PositionOption {
  id: string; position: string | null; customLabel: string | null; isOccupied: boolean;
  bed: { label: string; bedType: string };
}
interface AllocRecord {
  id: string; status: string; allocationDate: string; vacatedDate: string | null;
  notes: string | null;
  dorm: { id: string; name: string };
  cubicle: { id: string; name: string } | null;
  bed: { id: string; label: string; bedType: string } | null;
  sleepingPosition: { id: string; position: string | null; customLabel: string | null } | null;
  allocatedBy: { email: string } | null;
}
interface SchoolClass { id: string; name: string; form: number; }

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

const positionDisplay = (p: { position: string | null; customLabel: string | null } | null) => {
  if (!p) return "";
  if (p.position === "UPPER") return " · Upper";
  if (p.position === "LOWER") return " · Lower";
  if (p.customLabel) return ` · ${p.customLabel}`;
  return "";
};

const GENDER_COLOR: Record<string, string> = {
  BOYS_ONLY:  "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  GIRLS_ONLY: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800",
  MIXED:      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800",
};
const GENDER_LABEL: Record<string, string> = { BOYS_ONLY: "Boys", GIRLS_ONLY: "Girls", MIXED: "Mixed" };

// ── OccupancyBar ──────────────────────────────────────────────────────────────
function OccupancyBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-danger" : pct >= 90 ? "bg-warn" : pct >= 70 ? "bg-amber-400" : "bg-teal";
  return (
    <div className="w-full h-1.5 rounded-full bg-line dark:bg-dark-border overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ── DormCard — visual dorm picker ─────────────────────────────────────────────
function DormCard({
  dorm, selected, onSelect,
}: { dorm: DormOption; selected: boolean; onSelect: () => void }) {
  const pct = dorm.totalCapacity > 0
    ? Math.round((dorm.occupiedCount / dorm.totalCapacity) * 100) : 0;
  const isFull = dorm.availableCount === 0 && dorm.totalCapacity > 0;
  return (
    <button
      type="button" onClick={onSelect}
      disabled={isFull}
      className={`w-full text-left rounded-xl border-2 p-3.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
        selected
          ? "border-teal bg-teal/5 dark:bg-teal/10"
          : "border-line hover:border-teal/40 dark:border-dark-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className={`text-sm font-semibold truncate ${selected ? "text-teal" : "text-ink dark:text-dark-text"}`}>
            {dorm.name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${GENDER_COLOR[dorm.genderPolicy]}`}>
              {GENDER_LABEL[dorm.genderPolicy]}
            </span>
            {dorm.allocationPolicy === "RESTRICTED_BY_FORM" && dorm.permittedForms.length > 0 && (
              <span className="text-[10px] text-slate dark:text-dark-muted">
                F{dorm.permittedForms.join(",")}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-semibold tabular-nums ${isFull ? "text-danger" : "text-ink dark:text-dark-text"}`}>
            {dorm.availableCount}
          </p>
          <p className="text-[10px] text-slate dark:text-dark-muted">free</p>
        </div>
      </div>
      <OccupancyBar pct={pct} />
      <p className="text-[10px] text-slate mt-1 dark:text-dark-muted text-right tabular-nums">
        {dorm.occupiedCount}/{dorm.totalCapacity} · {pct}%
      </p>
    </button>
  );
}

// ── AllocateModal — single student ────────────────────────────────────────────
function AllocateModal({
  student, dorms, onClose, onSaved,
}: { student: StudentRow; dorms: DormOption[]; onClose: () => void; onSaved: () => void }) {
  const [dormId, setDormId]         = useState(student.currentAllocation?.dormId ?? "");
  const [cubicles, setCubicles]     = useState<CubicleOption[]>([]);
  const [cubicleId, setCubicleId]   = useState("");
  const [positions, setPositions]   = useState<PositionOption[]>([]);
  const [positionId, setPositionId] = useState("");
  const [notes, setNotes]           = useState("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [loadingCubicles, setLoadingCubicles] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);

  const selectedDorm = dorms.find((d) => d.id === dormId);

  useEffect(() => {
    if (!dormId || selectedDorm?.structure !== "CUBICLE_BASED") {
      setCubicles([]); setCubicleId(""); return;
    }
    setLoadingCubicles(true);
    fetch(`/api/accommodation/dormitories/${dormId}/cubicles`)
      .then((r) => r.ok ? r.json() : []).then(setCubicles)
      .finally(() => setLoadingCubicles(false));
  }, [dormId, selectedDorm?.structure]);

  useEffect(() => {
    if (!dormId) { setPositions([]); setPositionId(""); return; }
    const url = cubicleId
      ? `/api/accommodation/dormitories/${dormId}/beds?cubicleId=${cubicleId}`
      : `/api/accommodation/dormitories/${dormId}/beds`;
    setLoadingPositions(true);
    fetch(url).then((r) => r.ok ? r.json() : [])
      .then((beds: { id: string; label: string; bedType: string; positions: PositionOption[] }[]) => {
        setPositions(beds.flatMap((b) => b.positions.map((p) => ({ ...p, bed: { label: b.label, bedType: b.bedType } }))));
        setPositionId("");
      }).finally(() => setLoadingPositions(false));
  }, [dormId, cubicleId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dormId) { setError("Please select a dormitory."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/accommodation/allocations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, dormId,
          cubicleId: cubicleId || null, sleepingPositionId: positionId || null,
          notes: notes.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to allocate."); return; }
      onSaved();
    } catch { setError("Network error."); } finally { setSaving(false); }
  }

  const availablePositions = positions.filter((p) => !p.isOccupied);
  const bedLabel = (p: PositionOption) => {
    let label = p.bed.label;
    if (p.position === "UPPER") label += " (Upper)";
    else if (p.position === "LOWER") label += " (Lower)";
    else if (p.customLabel) label += ` (${p.customLabel})`;
    return label;
  };

  return (
    <Modal
      title={`Allocate ${student.fullName}`}
      description={`${student.admissionNumber} · ${student.className}${student.currentAllocation ? " — currently allocated, will be transferred" : ""}`}
      onClose={onClose} size="md"
    >
      {student.currentAllocation && (
        <div className="mb-4 rounded-lg border border-warn/20 bg-warn-bg/40 dark:bg-warn/10 px-4 py-3 text-sm text-warn flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Currently in <strong>{student.currentAllocation.dorm.name}</strong>. Selecting a new dorm will transfer them.</span>
        </div>
      )}
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-sm font-medium text-ink mb-2 dark:text-dark-text">Select dormitory</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
            {dorms.map((d) => (
              <DormCard key={d.id} dorm={d} selected={dormId === d.id}
                onSelect={() => { setDormId(d.id); setCubicleId(""); setPositionId(""); }} />
            ))}
          </div>
        </div>
        {selectedDorm?.structure === "CUBICLE_BASED" && (
          <FormField label="Cubicle / Room" helper="Optional — assign to a specific cubicle.">
            {loadingCubicles ? <div className="h-10 rounded-lg bg-line/40 animate-pulse" /> : (
              <select className={inputClass} value={cubicleId}
                onChange={(e) => { setCubicleId(e.target.value); setPositionId(""); }}>
                <option value="">— Dorm-level (no specific cubicle) —</option>
                {cubicles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c._count.allocations}/{c._count.sleepingPositions} occupied)
                  </option>
                ))}
              </select>
            )}
          </FormField>
        )}
        {dormId && (
          <FormField label="Sleeping position" helper="Optional — leave blank for dorm-level allocation.">
            {loadingPositions ? <div className="h-10 rounded-lg bg-line/40 animate-pulse" /> : (
              <select className={inputClass} value={positionId} onChange={(e) => setPositionId(e.target.value)}>
                <option value="">— No specific position —</option>
                {availablePositions.length === 0 && <option disabled>No available positions</option>}
                {availablePositions.map((p) => <option key={p.id} value={p.id}>{bedLabel(p)}</option>)}
              </select>
            )}
          </FormField>
        )}
        <FormField label="Notes" helper="Optional notes about this allocation.">
          <textarea className={`${inputClass} resize-none`} rows={2} value={notes}
            onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Transferred from Girls Block A…" />
        </FormField>
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving || !dormId}
            className={`${primaryButtonClass} disabled:opacity-40`}>
            {saving ? "Allocating…" : student.currentAllocation ? "Transfer" : "Allocate"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── DeallocateModal ───────────────────────────────────────────────────────────
function DeallocateModal({ student, onClose, onSaved }: { student: StudentRow; onClose: () => void; onSaved: () => void }) {
  const [transferStatus, setTransferStatus] = useState<"VACATED" | "TRANSFERRED">("VACATED");
  const [notes, setNotes]   = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/accommodation/allocations/${student.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferStatus, notes: notes.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      onSaved();
    } catch { setError("Network error."); } finally { setSaving(false); }
  }
  return (
    <Modal title="Remove Allocation" description={`${student.fullName} — ${student.currentAllocation?.dorm.name}`}
      onClose={onClose} size="sm">
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Reason">
          <select className={inputClass} value={transferStatus} onChange={(e) => setTransferStatus(e.target.value as "VACATED" | "TRANSFERRED")}>
            <option value="VACATED">Vacated — student leaving boarding</option>
            <option value="TRANSFERRED">Transferred — moving to another dorm</option>
          </select>
        </FormField>
        <FormField label="Notes" helper="Optional reason for this removal.">
          <textarea className={`${inputClass} resize-none`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-danger text-white text-sm font-medium px-4 py-2.5 hover:bg-red-600 transition-all disabled:opacity-40">
            {saving ? "Removing…" : "Remove"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── HistoryModal ──────────────────────────────────────────────────────────────
function HistoryModal({ student, onClose }: { student: StudentRow; onClose: () => void }) {
  const [records, setRecords] = useState<AllocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`/api/accommodation/allocations/${student.id}`)
      .then((r) => r.ok ? r.json() : []).then(setRecords).finally(() => setLoading(false));
  }, [student.id]);
  const statusColor = (s: string) => ({
    CURRENT: "text-success bg-success/10 border-success/20",
    VACATED: "text-slate bg-slate-50 border-line dark:bg-dark-surface dark:border-dark-border",
    TRANSFERRED: "text-teal bg-teal/8 border-teal/20",
  }[s] ?? "text-slate");
  return (
    <Modal title="Accommodation History" description={`${student.fullName} · ${student.admissionNumber}`}
      onClose={onClose} size="lg">
      {loading && <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-line/40 animate-pulse" />)}</div>}
      {!loading && records.length === 0 && <p className="text-slate text-sm py-6 text-center dark:text-dark-muted">No accommodation history found.</p>}
      {!loading && records.length > 0 && (
        <div className="space-y-3">
          {records.map((r) => (
            <div key={r.id} className="rounded-lg border border-line dark:border-dark-border p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-ink dark:text-dark-text">{r.dorm.name}</p>
                    {r.cubicle && <span className="text-xs text-slate dark:text-dark-muted">· {r.cubicle.name}</span>}
                    {r.bed && <span className="text-xs text-slate dark:text-dark-muted">· {r.bed.label}{positionDisplay(r.sleepingPosition)}</span>}
                  </div>
                  <p className="text-xs text-slate mt-1 dark:text-dark-muted">
                    Allocated {new Date(r.allocationDate).toLocaleDateString()}
                    {r.vacatedDate ? ` → vacated ${new Date(r.vacatedDate).toLocaleDateString()}` : ""}
                    {r.allocatedBy ? ` by ${r.allocatedBy.email}` : ""}
                  </p>
                  {r.notes && <p className="text-xs text-slate mt-1 italic dark:text-dark-muted">{r.notes}</p>}
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusColor(r.status)}`}>
                  {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ── BulkAllocateModal ─────────────────────────────────────────────────────────
function BulkAllocateModal({
  dorms, classes, onClose, onSaved,
}: { dorms: DormOption[]; classes: SchoolClass[]; onClose: () => void; onSaved: (count: number) => void }) {
  const [mode, setMode] = useState<"form" | "class" | "unallocated">("unallocated");
  const [dormId, setDormId]     = useState("");
  const [forms, setForms]       = useState<number[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [notes, setNotes]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [preview, setPreview]   = useState<{ studentId: string; studentName: string; className: string }[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Derive distinct sorted form numbers from the classes the school has registered
  const schoolForms = [...new Set(classes.map((c) => c.form))].sort((a, b) => a - b);

  async function handlePreview() {
    if (!dormId) { setError("Select a dormitory first."); return; }
    setPreviewing(true); setError(null);
    try {
      const filter = buildFilter();
      const res = await fetch("/api/accommodation/auto-allocate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dormIds: [dormId], filter, strategy: "FILL_FIRST", dryRun: true, notes: notes || null }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to preview."); return; }
      setPreview(json.plan ?? []);
    } catch { setError("Network error."); } finally { setPreviewing(false); }
  }

  function buildFilter() {
    if (mode === "unallocated") return { unallocatedOnly: true };
    if (mode === "form") return { forms, unallocatedOnly: false };
    if (mode === "class") return { classIds, unallocatedOnly: false };
    return {};
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dormId) { setError("Select a dormitory."); return; }
    setSaving(true); setError(null);
    try {
      const filter = buildFilter();
      const res = await fetch("/api/accommodation/bulk-allocate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dormId, filter, notes: notes || null }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      onSaved(json.allocated ?? 0);
    } catch { setError("Network error."); } finally { setSaving(false); }
  }

  const selectedDorm = dorms.find((d) => d.id === dormId);

  return (
    <Modal title="Bulk Allocation" description="Allocate multiple students to a dormitory at once."
      onClose={onClose} size="lg">
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Mode tabs */}
        <div className="flex rounded-lg border border-line overflow-hidden dark:border-dark-border">
          {([["unallocated","Unallocated students"],["form","By form"],["class","By class"]] as [typeof mode, string][]).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${mode === m ? "bg-teal text-white" : "bg-white text-slate hover:bg-paper dark:bg-dark-surface dark:text-dark-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        {/* Filter */}
        {mode === "form" && (
          <FormField label="Select forms">
            <div className="flex flex-wrap gap-2 mt-1">
              {schoolForms.map((f) => (
                <button key={f} type="button" onClick={() => setForms((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f])}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${forms.includes(f) ? "bg-teal text-white border-teal" : "border-line text-slate hover:border-teal/40 dark:border-dark-border"}`}>
                  Form {f}
                </button>
              ))}
            </div>
          </FormField>
        )}
        {mode === "class" && (
          <FormField label="Select classes">
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
              {classes.map((c) => (
                <button key={c.id} type="button" onClick={() => setClassIds((prev) => prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all text-left ${classIds.includes(c.id) ? "bg-teal text-white border-teal" : "border-line text-ink hover:border-teal/40 dark:border-dark-border dark:text-dark-text"}`}>
                  {c.name}
                </button>
              ))}
            </div>
          </FormField>
        )}
        {/* Dorm selection */}
        <div>
          <p className="text-sm font-medium text-ink mb-2 dark:text-dark-text">Destination dormitory</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {dorms.filter((d) => d.availableCount > 0).map((d) => (
              <DormCard key={d.id} dorm={d} selected={dormId === d.id} onSelect={() => setDormId(d.id)} />
            ))}
          </div>
          {selectedDorm && (
            <p className="text-xs text-teal mt-2">
              {selectedDorm.availableCount} spaces available in {selectedDorm.name}
            </p>
          )}
        </div>
        <FormField label="Notes (optional)">
          <textarea className={`${inputClass} resize-none`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        {/* Preview results */}
        {preview !== null && (
          <div className="rounded-lg border border-teal/20 bg-teal/5 dark:bg-teal/10 p-3">
            <p className="text-sm font-semibold text-teal mb-2">{preview.length} students will be allocated</p>
            {preview.length > 0 && (
              <div className="max-h-36 overflow-y-auto space-y-1">
                {preview.slice(0, 20).map((p) => (
                  <div key={p.studentId} className="flex items-center gap-2 text-xs">
                    <Check className="h-3 w-3 text-teal shrink-0" />
                    <span className="text-ink dark:text-dark-text">{p.studentName}</span>
                    <span className="text-slate dark:text-dark-muted">· {p.className}</span>
                  </div>
                ))}
                {preview.length > 20 && <p className="text-xs text-slate dark:text-dark-muted">…and {preview.length - 20} more</p>}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <div className="flex gap-2">
            <button type="button" onClick={handlePreview} disabled={!dormId || previewing}
              className={`${secondaryButtonClass} disabled:opacity-40`}>
              {previewing ? "Previewing…" : "Preview"}
            </button>
            <button type="submit" disabled={saving || !dormId}
              className={`${primaryButtonClass} disabled:opacity-40`}>
              {saving ? "Allocating…" : "Allocate"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ── AutoAllocateModal ─────────────────────────────────────────────────────────
function AutoAllocateModal({
  dorms, onClose, onSaved,
}: { dorms: DormOption[]; onClose: () => void; onSaved: (count: number) => void }) {
  const [strategy, setStrategy] = useState<"DISTRIBUTE_EVENLY" | "FILL_FIRST">("DISTRIBUTE_EVENLY");
  const [unallocatedOnly, setUnallocatedOnly] = useState(true);
  const [selectedDormIds, setSelectedDormIds] = useState<string[]>([]);
  const [notes, setNotes]   = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [dryResult, setDryResult] = useState<{ toAllocate: number; unplaceable: number; plan: { studentName: string; dormName: string }[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const activeDorms = dorms.filter((d) => d.availableCount > 0);

  async function runDryRun() {
    setPreviewing(true); setError(null);
    try {
      const res = await fetch("/api/accommodation/auto-allocate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dormIds: selectedDormIds.length ? selectedDormIds : undefined,
          filter: { unallocatedOnly }, strategy, dryRun: true }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      setDryResult(json);
    } catch { setError("Network error."); } finally { setPreviewing(false); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const res = await fetch("/api/accommodation/auto-allocate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dormIds: selectedDormIds.length ? selectedDormIds : undefined,
          filter: { unallocatedOnly }, strategy, dryRun: false, notes: notes || null }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      onSaved(json.allocated ?? 0);
    } catch { setError("Network error."); } finally { setSaving(false); }
  }

  return (
    <Modal title="Auto-Allocate Students" description="Distribute students across dormitories automatically according to dorm rules."
      onClose={onClose} size="lg">
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Strategy */}
        <div>
          <p className="text-sm font-medium text-ink mb-2 dark:text-dark-text">Distribution strategy</p>
          <div className="grid grid-cols-2 gap-3">
            {([["DISTRIBUTE_EVENLY","Distribute evenly","Spread students across all dorms, keeping occupancy balanced."],
              ["FILL_FIRST","Fill first","Fill each dorm to capacity before moving to the next."]] as [typeof strategy, string, string][]).map(([v, label, desc]) => (
              <button key={v} type="button" onClick={() => setStrategy(v)}
                className={`text-left rounded-xl border-2 p-3 transition-all ${strategy === v ? "border-teal bg-teal/5 dark:bg-teal/10" : "border-line hover:border-teal/40 dark:border-dark-border"}`}>
                <p className={`text-sm font-semibold ${strategy === v ? "text-teal" : "text-ink dark:text-dark-text"}`}>{label}</p>
                <p className="text-xs text-slate mt-0.5 dark:text-dark-muted">{desc}</p>
              </button>
            ))}
          </div>
        </div>
        {/* Scope */}
        <label className="flex items-center gap-3 cursor-pointer py-2 border-b border-line dark:border-dark-border">
          <input type="checkbox" checked={unallocatedOnly} onChange={(e) => setUnallocatedOnly(e.target.checked)}
            className="h-4 w-4 rounded border-line text-teal focus:ring-teal/30" />
          <div>
            <p className="text-sm font-medium text-ink dark:text-dark-text">Unallocated students only</p>
            <p className="text-xs text-slate dark:text-dark-muted">Skip students who already have a current allocation.</p>
          </div>
        </label>
        {/* Dorm filter */}
        <div>
          <p className="text-sm font-medium text-ink mb-1 dark:text-dark-text">
            Dormitories to use <span className="text-slate font-normal">(leave blank for all active)</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
            {activeDorms.map((d) => (
              <button key={d.id} type="button"
                onClick={() => setSelectedDormIds((prev) => prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id])}
                className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-all text-left ${selectedDormIds.includes(d.id) ? "bg-teal text-white border-teal" : "border-line text-ink hover:border-teal/40 dark:border-dark-border dark:text-dark-text"}`}>
                {d.name} <span className="opacity-70">({d.availableCount} free)</span>
              </button>
            ))}
          </div>
        </div>
        <FormField label="Notes (optional)">
          <textarea className={`${inputClass} resize-none`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        {/* Dry run result */}
        {dryResult && (
          <div className="rounded-lg border border-teal/20 bg-teal/5 dark:bg-teal/10 p-3 space-y-2">
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold text-teal">{dryResult.toAllocate} will be allocated</span>
              {dryResult.unplaceable > 0 && (
                <span className="text-sm text-warn">{dryResult.unplaceable} cannot be placed</span>
              )}
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {dryResult.plan.slice(0, 15).map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <ArrowRight className="h-3 w-3 text-teal shrink-0" />
                  <span className="text-ink dark:text-dark-text truncate">{p.studentName}</span>
                  <span className="text-slate dark:text-dark-muted shrink-0">→ {p.dormName}</span>
                </div>
              ))}
              {dryResult.plan.length > 15 && <p className="text-xs text-slate dark:text-dark-muted">…and {dryResult.plan.length - 15} more</p>}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <div className="flex gap-2">
            <button type="button" onClick={runDryRun} disabled={previewing}
              className={`${secondaryButtonClass} disabled:opacity-40`}>
              {previewing ? "Previewing…" : "Preview plan"}
            </button>
            <button type="submit" disabled={saving}
              className={`${primaryButtonClass} disabled:opacity-40`}>
              <Sparkles className="h-4 w-4" />
              {saving ? "Allocating…" : "Run auto-allocation"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ── QuickAssignRow ────────────────────────────────────────────────────────────
function QuickAssignRow({ student, dorms, onAssigned }: {
  student: StudentRow; dorms: DormOption[]; onAssigned: () => void;
}) {
  const [dormId, setDormId] = useState("");
  const [saving, setSaving] = useState(false);

  async function assign() {
    if (!dormId) return;
    setSaving(true);
    await fetch("/api/accommodation/allocations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: student.id, dormId }),
    });
    setSaving(false);
    onAssigned();
  }

  return (
    <div className="flex items-center gap-2">
      <SearchableSelect
        size="sm"
        value={dormId}
        onChange={setDormId}
        options={dorms
          .filter((d) => d.availableCount > 0)
          .map((d) => ({ id: d.id, label: d.name, sub: `${d.availableCount} free` }))}
        placeholder="— Quick assign —"
        searchPlaceholder="Search dormitories…"
        className="min-w-[180px]"
      />
      <button onClick={assign} disabled={!dormId || saving}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal-dark transition-all disabled:opacity-40 shrink-0">
        <Zap className="h-3 w-3" /> {saving ? "…" : "Assign"}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AllocationsPage() {
  const [students, setStudents]       = useState<StudentRow[]>([]);
  const [dorms, setDorms]             = useState<DormOption[]>([]);
  const [classes, setClasses]         = useState<SchoolClass[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [filter, setFilter]           = useState<"all" | "allocated" | "unallocated">("all");
  const [formFilter, setFormFilter]   = useState("");
  const [viewMode, setViewMode]       = useState<"table" | "list">("table");
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [quickAssign, setQuickAssign] = useState<string | null>(null);

  const [allocatingStudent, setAllocatingStudent]     = useState<StudentRow | null>(null);
  const [deallocatingStudent, setDeallocatingStudent] = useState<StudentRow | null>(null);
  const [historyStudent, setHistoryStudent]           = useState<StudentRow | null>(null);
  const [showBulk, setShowBulk]       = useState(false);
  const [showAuto, setShowAuto]       = useState(false);

  const [successMsg, setSuccessMsg]   = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDorms = useCallback(async () => {
    const res = await fetch("/api/accommodation/dormitories");
    if (res.ok) setDorms(await res.json());
  }, []);

  const loadStudents = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (filter === "allocated")   params.set("boardingOnly", "true");
      if (filter === "unallocated") params.set("unallocatedOnly", "true");
      const res = await fetch(`/api/accommodation/students?${params}`);
      if (res.ok) setStudents(await res.json());
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => {
    loadDorms();
    fetch("/api/classes").then((r) => r.ok ? r.json() : []).then((d) => setClasses(Array.isArray(d) ? d : []));
  }, [loadDorms]);

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => loadStudents(search), 300);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [search, filter, loadStudents]);

  function flash(msg: string) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 4000); }

  const filteredStudents = students.filter((s) => !formFilter || String(s.form) === formFilter);

  const allocatedCount   = filteredStudents.filter((s) => s.currentAllocation).length;
  const unallocatedCount = filteredStudents.filter((s) => !s.currentAllocation).length;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }
  function selectAll() { setSelected(new Set(filteredStudents.map((s) => s.id))); }
  function clearSelected() { setSelected(new Set()); }

  async function bulkRemove() {
    if (!selected.size) return;
    if (!confirm(`Remove ${selected.size} allocation(s)?`)) return;
    let removed = 0;
    for (const id of selected) {
      const s = students.find((x) => x.id === id);
      if (s?.currentAllocation) {
        await fetch(`/api/accommodation/allocations/${id}`, {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transferStatus: "VACATED" }),
        });
        removed++;
      }
    }
    flash(`${removed} allocation(s) removed.`);
    clearSelected();
    loadStudents(search);
    loadDorms();
  }

  const dormOptions = dorms.map((d) => ({
    id: d.id, name: d.name, genderPolicy: d.genderPolicy, structure: d.structure,
    totalCapacity: d.totalCapacity, occupiedCount: d.occupiedCount ?? (d.totalCapacity - d.availableCount),
    availableCount: d.availableCount, allocationPolicy: d.allocationPolicy,
    permittedForms: d.permittedForms ?? [],
  }));

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />
      <PageHeader
        title="Student Allocations"
        description="Allocate, transfer, and manage student boarding accommodation assignments."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowBulk(true)} className={secondaryButtonClass}>
              <ClipboardList className="h-4 w-4" /> Bulk Allocate
            </button>
            <button onClick={() => setShowAuto(true)} className={primaryButtonClass}>
              <Sparkles className="h-4 w-4" /> Auto-Allocate
            </button>
          </div>
        }
      />

      {successMsg && <div className="mb-4"><SuccessBanner message={successMsg} onDismiss={() => setSuccessMsg(null)} /></div>}
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Stats row */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total students", value: filteredStudents.length, icon: Users, color: "text-teal", bg: "bg-teal/10" },
            { label: "Allocated", value: allocatedCount, icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
            { label: "Unallocated", value: unallocatedCount, icon: UserMinus, color: unallocatedCount > 0 ? "text-warn" : "text-slate", bg: unallocatedCount > 0 ? "bg-warn/10" : "bg-slate/10" },
            { label: "Dorms", value: dorms.length, icon: Building2, color: "text-teal", bg: "bg-teal/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="rounded-xl border border-line bg-card p-4 dark:bg-dark-surface dark:border-dark-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
                  <p className="text-xs text-slate dark:text-dark-muted mt-0.5">{label}</p>
                </div>
                <div className={`rounded-lg p-2 ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <WorkspaceToolbar>
        <WorkspaceToolbar.Search value={search} onChange={setSearch} placeholder="Search students by name or admission number…" />
        <WorkspaceToolbar.Actions>
          <div className="flex rounded-lg border border-line overflow-hidden dark:border-dark-border">
            {(["all","allocated","unallocated"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${filter === f ? "bg-teal text-white" : "bg-white text-slate hover:bg-paper dark:bg-dark-surface dark:text-dark-muted"}`}>
                {f}
              </button>
            ))}
          </div>
          <select className="text-xs border border-line rounded-lg px-2 py-1.5 bg-white dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
            value={formFilter} onChange={(e) => setFormFilter(e.target.value)}>
            <option value="">All forms</option>
            {[...new Set(classes.map((c) => c.form))].sort((a, b) => a - b).map((f) => <option key={f} value={String(f)}>Form {f}</option>)}
          </select>
          <WorkspaceToolbar.ViewSwitcher value={viewMode} onChange={(m) => setViewMode(m as "table" | "list")} modes={["table","list"]} />
          <WorkspaceToolbar.RefreshButton onClick={() => { loadStudents(search); loadDorms(); }} />
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {/* Bulk action bar */}
      <WorkspaceToolbar.BulkActionBar count={selected.size} onClear={clearSelected}>
        <button onClick={bulkRemove}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger text-white text-xs font-medium hover:bg-red-600 transition-all">
          <UserMinus className="h-3.5 w-3.5" /> Remove allocations
        </button>
      </WorkspaceToolbar.BulkActionBar>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-line/40 dark:bg-dark-border/40 animate-pulse" />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredStudents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="rounded-full bg-slate-100 dark:bg-dark-surface p-4">
            <UserCheck className="h-8 w-8 text-slate" />
          </div>
          <p className="text-ink font-medium dark:text-dark-text">
            {search ? `No students match "${search}"` : "No students found"}
          </p>
          {!search && filter === "unallocated" && (
            <button onClick={() => setShowAuto(true)} className={primaryButtonClass}>
              <Sparkles className="h-4 w-4" /> Auto-allocate all
            </button>
          )}
        </div>
      )}

      {/* Table view */}
      {!loading && filteredStudents.length > 0 && viewMode === "table" && (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm dark:bg-dark-surface dark:border-dark-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-line bg-slate-50/80 dark:bg-dark-border/30 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                  <th className="px-4 py-3 w-9">
                    <input type="checkbox" checked={selected.size === filteredStudents.length && filteredStudents.length > 0}
                      onChange={(e) => e.target.checked ? selectAll() : clearSelected()}
                      className="h-4 w-4 rounded border-line text-teal" />
                  </th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3 w-[90px]">Form</th>
                  <th className="px-4 py-3">Current accommodation</th>
                  <th className="px-4 py-3 w-[180px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 dark:divide-dark-border/60">
                {filteredStudents.map((s) => (
                  <tr key={s.id} className={`hover:bg-slate-50/50 transition-colors dark:hover:bg-dark-border/20 ${selected.has(s.id) ? "bg-teal/5 dark:bg-teal/10" : ""}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)}
                        className="h-4 w-4 rounded border-line text-teal" />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/principal/students/${s.id}`}
                        className="font-medium text-ink hover:text-teal transition-colors dark:text-dark-text dark:hover:text-teal">
                        {s.fullName}
                      </Link>
                      <p className="text-xs text-slate dark:text-dark-muted">{s.admissionNumber} · {s.className}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate dark:text-dark-muted">Form {s.form}</td>
                    <td className="px-4 py-3">
                      {s.currentAllocation ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <BedDouble className="h-3.5 w-3.5 text-teal shrink-0" />
                            <Link href={`/principal/accommodation/dormitories/${s.currentAllocation.dormId}`}
                              className="text-sm font-medium text-ink hover:text-teal transition-colors dark:text-dark-text dark:hover:text-teal">
                              {s.currentAllocation.dorm.name}
                            </Link>
                            {s.currentAllocation.cubicle && (
                              <span className="text-xs text-slate dark:text-dark-muted">· {s.currentAllocation.cubicle.name}</span>
                            )}
                            {s.currentAllocation.bed && (
                              <span className="text-xs text-slate dark:text-dark-muted">
                                · {s.currentAllocation.bed.label}{positionDisplay(s.currentAllocation.sleepingPosition)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate mt-0.5 dark:text-dark-muted">
                            Since {new Date(s.currentAllocation.allocationDate).toLocaleDateString()}
                          </p>
                        </div>
                      ) : (
                        quickAssign === s.id ? (
                          <QuickAssignRow student={s} dorms={dormOptions} onAssigned={() => {
                            setQuickAssign(null); flash(`${s.fullName} allocated.`); loadStudents(search); loadDorms();
                          }} />
                        ) : (
                          <button onClick={() => setQuickAssign(s.id)}
                            className="inline-flex items-center gap-1.5 text-xs text-teal hover:underline">
                            <Zap className="h-3 w-3" /> Quick assign
                          </button>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setHistoryStudent(s)}
                          className="p-1.5 rounded-md text-slate hover:text-teal hover:bg-teal/10 transition-all" title="View history">
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setAllocatingStudent(s)}
                          className="p-1.5 rounded-md text-slate hover:text-teal hover:bg-teal/10 transition-all"
                          title={s.currentAllocation ? "Transfer" : "Allocate"}>
                          {s.currentAllocation ? <Shuffle className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </button>
                        {s.currentAllocation && (
                          <button onClick={() => setDeallocatingStudent(s)}
                            className="p-1.5 rounded-md text-slate hover:text-danger hover:bg-danger/10 transition-all" title="Remove">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* List / card view */}
      {!loading && filteredStudents.length > 0 && viewMode === "list" && (
        <div className="space-y-2">
          {filteredStudents.map((s) => (
            <div key={s.id} className={`rounded-xl border border-line bg-card p-4 flex items-center gap-4 dark:bg-dark-surface dark:border-dark-border hover:border-teal/30 transition-colors ${selected.has(s.id) ? "bg-teal/5 border-teal/30 dark:bg-teal/10" : ""}`}>
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)}
                className="h-4 w-4 rounded border-line text-teal shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/principal/students/${s.id}`}
                    className="text-sm font-semibold text-ink hover:text-teal transition-colors dark:text-dark-text dark:hover:text-teal">
                    {s.fullName}
                  </Link>
                  <span className="text-xs text-slate dark:text-dark-muted">{s.admissionNumber} · {s.className}</span>
                </div>
                {s.currentAllocation ? (
                  <p className="text-xs text-teal mt-0.5">
                    <BedDouble className="inline h-3 w-3 mr-1" />
                    <Link href={`/principal/accommodation/dormitories/${s.currentAllocation.dormId}`}
                      className="hover:underline">
                      {s.currentAllocation.dorm.name}
                    </Link>
                    {s.currentAllocation.cubicle ? ` · ${s.currentAllocation.cubicle.name}` : ""}
                  </p>
                ) : (
                  <p className="text-xs text-slate dark:text-dark-muted mt-0.5">Not allocated</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => setHistoryStudent(s)} className="p-1.5 rounded-md text-slate hover:text-teal hover:bg-teal/10 transition-all"><Clock className="h-4 w-4" /></button>
                <button onClick={() => setAllocatingStudent(s)} className="p-1.5 rounded-md text-slate hover:text-teal hover:bg-teal/10 transition-all">
                  {s.currentAllocation ? <Shuffle className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </button>
                {s.currentAllocation && (
                  <button onClick={() => setDeallocatingStudent(s)} className="p-1.5 rounded-md text-slate hover:text-danger hover:bg-danger/10 transition-all"><X className="h-4 w-4" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {allocatingStudent && (
        <AllocateModal student={allocatingStudent} dorms={dormOptions} onClose={() => setAllocatingStudent(null)}
          onSaved={() => { setAllocatingStudent(null); flash(`${allocatingStudent.fullName} allocated successfully.`); loadStudents(search); loadDorms(); }} />
      )}
      {deallocatingStudent && (
        <DeallocateModal student={deallocatingStudent} onClose={() => setDeallocatingStudent(null)}
          onSaved={() => { setDeallocatingStudent(null); flash("Allocation removed."); loadStudents(search); loadDorms(); }} />
      )}
      {historyStudent && <HistoryModal student={historyStudent} onClose={() => setHistoryStudent(null)} />}
      {showBulk && (
        <BulkAllocateModal dorms={dormOptions} classes={classes} onClose={() => setShowBulk(false)}
          onSaved={(count) => { setShowBulk(false); flash(`${count} student(s) allocated.`); loadStudents(search); loadDorms(); }} />
      )}
      {showAuto && (
        <AutoAllocateModal dorms={dormOptions} onClose={() => setShowAuto(false)}
          onSaved={(count) => { setShowAuto(false); flash(`Auto-allocated ${count} student(s).`); loadStudents(search); loadDorms(); }} />
      )}
    </div>
  );
}
