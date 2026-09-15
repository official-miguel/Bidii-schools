"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  BedDouble, LayoutGrid, Plus,
  UserCheck, ChevronDown, ChevronUp, Pencil, Info, Trash2,
} from "lucide-react";
import {
  ErrorBanner, SuccessBanner,
  inputClass, primaryButtonClass, secondaryButtonClass, FormField,
} from "@/components/ui";
import Modal from "@/components/Modal";
import ContextNavigation from "@/components/ContextNavigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position {
  id: string; position: "UPPER" | "LOWER" | null; customLabel: string | null;
  isOccupied: boolean;
  allocations: {
    id: string; status: string;
    student: { id: string; fullName: string; admissionNumber: string; schoolClass: { name: string } };
  }[];
}
interface BedDetail { id: string; label: string; bedType: string; positions: Position[]; }
interface CubicleDetail {
  id: string; name: string; capacity: number; allocationPolicy: string | null;
  permittedForms: { form: number }[];
  _count: { beds: number; sleepingPositions: number; allocations: number };
}
interface DormDetail {
  id: string; name: string; genderPolicy: string; structure: string;
  status: string; totalCapacity: number; allocationPolicy: string;
  cubiclesInheritPolicy: boolean; description: string | null;
  boardingMaster: { id: string; fullName: string; staffId: string } | null;
  dormCaptain: { id: string; fullName: string; admissionNumber: string; schoolClass: { name: string } } | null;
  permittedForms: { form: number }[];
  cubicles: CubicleDetail[];
  beds: BedDetail[];
  _count: { allocations: number; sleepingPositions: number };
}

const NAV_ITEMS = [
  { href: "/principal/accommodation/overview",    label: "Overview", exact: true },
  { href: "/principal/accommodation/dormitories", label: "Dormitories" },
  { href: "/principal/accommodation/allocations", label: "Allocations" },
  { href: "/principal/accommodation/settings",    label: "Settings" },
];

const GENDER_LABEL: Record<string, string> = { BOYS_ONLY: "Boys", GIRLS_ONLY: "Girls", MIXED: "Mixed" };
const STATUS_META: Record<string, { label: string; color: string }> = {
  ACTIVE:            { label: "Active",      color: "text-success" },
  UNDER_MAINTENANCE: { label: "Maintenance", color: "text-warn" },
  CLOSED:            { label: "Closed",      color: "text-slate" },
};

// ── OccupancyBar ──────────────────────────────────────────────────────────────

function OccupancyBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-danger" : pct >= 90 ? "bg-warn" : "bg-teal";
  return (
    <div className="w-full h-2 rounded-full bg-line overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ── BedCard ───────────────────────────────────────────────────────────────────

function BedCard({
  bed, dormId, onDeleted,
}: {
  bed: BedDetail;
  dormId: string;
  onDeleted: (bedId: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const isOccupied = bed.positions.some((p) => p.isOccupied);

  async function handleDelete() {
    if (!confirm(`Remove "${bed.label}"? This cannot be undone.`)) return;
    setDeleting(true); setError(null);
    try {
      const res = await fetch(
        `/api/accommodation/dormitories/${dormId}/beds/${bed.id}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to delete bed."); return; }
      onDeleted(bed.id);
    } catch { setError("Network error."); }
    finally { setDeleting(false); }
  }

  const positionLabel = (p: Position) => {
    if (p.position === "UPPER") return "Upper";
    if (p.position === "LOWER") return "Lower";
    if (p.customLabel) return p.customLabel;
    return "Space";
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2 gap-1">
        <span className="text-xs font-semibold text-foreground truncate">{bed.label}</span>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] uppercase tracking-wide text-slate font-medium">
            {bed.bedType === "DOUBLE_DECKER" ? "Bunk" : bed.bedType === "CUSTOM" ? "Custom" : "Single"}
          </span>
          <button
            onClick={handleDelete}
            disabled={deleting || isOccupied}
            title={isOccupied ? "Cannot delete — bed is occupied" : "Remove this bed"}
            className="ml-1 p-1 rounded text-slate/50 hover:text-danger hover:bg-danger/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {deleting
              ? <span className="inline-block h-3 w-3 border border-danger border-t-transparent rounded-full animate-spin" />
              : <Trash2 className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Error inline */}
      {error && (
        <p className="text-[10px] text-danger mb-1.5 leading-tight">{error}</p>
      )}

      {/* Sleeping positions */}
      <div className="space-y-1">
        {bed.positions.map((pos) => {
          const alloc = pos.allocations[0];
          return (
            <div key={pos.id}
              className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                pos.isOccupied
                  ? "bg-teal/8 border border-teal/20 dark:bg-teal/10"
                  : "bg-slate-50 border border-border/50/30/50"
              }`}
            >
              <span className={`font-medium shrink-0 ${pos.isOccupied ? "text-teal" : "text-slate"}`}>
                {positionLabel(pos)}
              </span>
              {alloc ? (
                <Link href={`/principal/students/${alloc.student.id}`}
                  className="text-foreground hover:text-teal transition-colors truncate min-w-0 dark:hover:text-teal">
                  {alloc.student.fullName}
                  <span className="text-slate ml-1">· {alloc.student.schoolClass.name}</span>
                </Link>
              ) : (
                <span className="text-slate/60">Available space</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AddBedsModal ──────────────────────────────────────────────────────────────

function AddBedsModal({
  dormId, cubicleId, onClose, onAdded,
}: { dormId: string; cubicleId?: string; onClose: () => void; onAdded: () => void }) {
  const [mode, setMode] = useState<"single" | "auto">("auto");
  const [bedType, setBedType] = useState("SINGLE");
  const [count, setCount] = useState("10");
  const [prefix, setPrefix] = useState("Bed ");
  const [singleLabel, setSingleLabel] = useState("");
  const [customOccupancy, setCustomOccupancy] = useState("3");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const payload = mode === "auto"
        ? { mode: "auto", count: parseInt(count), prefix: prefix.trim() || "Bed ", bedType,
            customOccupancy: bedType === "CUSTOM" ? parseInt(customOccupancy) : null,
            cubicleId: cubicleId ?? null }
        : { label: singleLabel.trim(), bedType,
            customOccupancy: bedType === "CUSTOM" ? parseInt(customOccupancy) : null,
            cubicleId: cubicleId ?? null };
      const res = await fetch(`/api/accommodation/dormitories/${dormId}/beds`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      onAdded();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Add Beds" description="Configure beds and their sleeping positions."
      onClose={onClose} size="sm">
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["auto", "single"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === m ? "bg-teal text-white" : "bg-card text-slate hover:bg-background"
              }`}>
              {m === "auto" ? "Auto-generate" : "Single bed"}
            </button>
          ))}
        </div>
        {mode === "auto" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Number of beds" required>
                <input className={inputClass} type="number" min="1" max="500" value={count}
                  onChange={(e) => setCount(e.target.value)} />
              </FormField>
              <FormField label="Label prefix">
                <input className={inputClass} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="Bed " />
              </FormField>
            </div>
          </>
        ) : (
          <FormField label="Bed label" required>
            <input className={inputClass} value={singleLabel} onChange={(e) => setSingleLabel(e.target.value)} placeholder="e.g. Bed 1" />
          </FormField>
        )}
        <FormField label="Bed type" required>
          <select className={inputClass} value={bedType} onChange={(e) => setBedType(e.target.value)}>
            <option value="SINGLE">Single (1 sleeping space)</option>
            <option value="DOUBLE_DECKER">Double-decker / Bunk (Upper + Lower)</option>
            <option value="CUSTOM">Custom occupancy</option>
          </select>
        </FormField>
        {bedType === "CUSTOM" && (
          <FormField label="Sleeping spaces per bed" helper="Each bed creates this many independent sleeping positions.">
            <input className={inputClass} type="number" min="1" max="20" value={customOccupancy}
              onChange={(e) => setCustomOccupancy(e.target.value)} />
          </FormField>
        )}
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving} className={`${primaryButtonClass} disabled:opacity-40`}>
            {saving ? "Adding…" : mode === "auto" ? `Add ${count || "?"} beds` : "Add bed"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Number of sleeping positions one bed of the given type provides. */
function positionsPerBed(bedType: string, customOccupancy: number) {
  if (bedType === "DOUBLE_DECKER") return 2;
  if (bedType === "CUSTOM") return customOccupancy;
  return 1; // SINGLE
}

// ── AddCubiclesModal ──────────────────────────────────────────────────────────
//
// "Auto-generate" mode  — create N uniform cubicles, each with the same bed
//   count and bed type.  A live capacity pill shows total sleeping positions.
//
// "Single cubicle" mode — create one cubicle whose name and bed count can be
//   set independently, useful when dorm sections vary in size.

function AddCubiclesModal({ dormId, onClose, onAdded }: { dormId: string; onClose: () => void; onAdded: () => void }) {
  const [mode,            setMode]            = useState<"auto" | "single">("auto");
  // ── auto fields
  const [count,           setCount]           = useState("8");
  const [prefix,          setPrefix]          = useState("Cubicle ");
  const [bedsEach,        setBedsEach]        = useState("4");
  const [bedType,         setBedType]         = useState("SINGLE");
  const [customOccupancy, setCustomOccupancy] = useState("3");
  // ── single fields
  const [singleName,      setSingleName]      = useState("");
  const [singleBeds,      setSingleBeds]      = useState("4");
  const [singleBedType,   setSingleBedType]   = useState("SINGLE");
  const [singleCustomOcc, setSingleCustomOcc] = useState("3");

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // ── live capacity derived values ──────────────────────────────────────────
  const cubicleCount  = Math.max(1, parseInt(count)    || 0);
  const bedsPerCubicle = Math.max(1, parseInt(bedsEach) || 0);
  const posPerBed      = positionsPerBed(bedType, Math.max(1, parseInt(customOccupancy) || 1));
  const totalCapacity  = cubicleCount * bedsPerCubicle * posPerBed;

  const singleBedsNum    = Math.max(1, parseInt(singleBeds)  || 0);
  const singlePosPerBed  = positionsPerBed(singleBedType, Math.max(1, parseInt(singleCustomOcc) || 1));
  const singleCapacity   = singleBedsNum * singlePosPerBed;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const payload = mode === "auto"
        ? {
            mode: "auto",
            count:           parseInt(count),
            prefix:          prefix.trim() || "Cubicle ",
            capacityEach:    parseInt(bedsEach),
            bedType,
            customOccupancy: bedType === "CUSTOM" ? parseInt(customOccupancy) : undefined,
          }
        : {
            name:            singleName.trim(),
            capacity:        parseInt(singleBeds),
            bedType:         singleBedType,
            customOccupancy: singleBedType === "CUSTOM" ? parseInt(singleCustomOcc) : undefined,
          };
      const res = await fetch(`/api/accommodation/dormitories/${dormId}/cubicles`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      onAdded();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  return (
    <Modal
      title="Add Cubicles"
      description="Create one or more cubicles for this dormitory."
      onClose={onClose}
      size="sm"
    >
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Mode toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden mb-4">
        {(["auto", "single"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-teal text-white"
                : "bg-card text-slate hover:bg-background"
            }`}>
            {m === "auto" ? "Auto-generate" : "Single cubicle"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "auto" ? (
          <>
            {/* Row 1 — count + prefix */}
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Number of cubicles" required>
                <input className={inputClass} type="number" min="1" max="200" value={count}
                  onChange={(e) => setCount(e.target.value)} />
              </FormField>
              <FormField label="Name prefix">
                <input className={inputClass} value={prefix}
                  onChange={(e) => setPrefix(e.target.value)} placeholder="Cubicle " />
              </FormField>
            </div>

            {/* Row 2 — beds per cubicle + bed type */}
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Beds per cubicle" required helper="How many beds each cubicle gets.">
                <input className={inputClass} type="number" min="1" max="100" value={bedsEach}
                  onChange={(e) => setBedsEach(e.target.value)} />
              </FormField>
              <FormField label="Bed type" required>
                <select className={inputClass} value={bedType} onChange={(e) => setBedType(e.target.value)}>
                  <option value="SINGLE">Single  (1 space)</option>
                  <option value="DOUBLE_DECKER">Bunk  (2 spaces)</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </FormField>
            </div>

            {bedType === "CUSTOM" && (
              <FormField label="Spaces per bed" helper="Each bed creates this many sleeping positions.">
                <input className={inputClass} type="number" min="1" max="20" value={customOccupancy}
                  onChange={(e) => setCustomOccupancy(e.target.value)} />
              </FormField>
            )}

            {/* Live capacity breakdown */}
            <div className="rounded-lg border border-border bg-background p-3 space-y-2">
              <p className="text-xs font-semibold text-slate uppercase tracking-wide">Capacity preview</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Cubicles",       value: cubicleCount },
                  { label: `Beds / cubicle`, value: bedsPerCubicle },
                  { label: `Spaces / bed`,   value: posPerBed },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-md bg-card border border-border py-2 px-1">
                    <p className="text-base font-semibold text-foreground tabular-nums">{value}</p>
                    <p className="text-[10px] text-slate leading-tight">{label}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <span className="text-xs text-slate">Total sleeping positions</span>
                <span className="text-sm font-semibold text-teal tabular-nums">{totalCapacity}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Single cubicle */}
            <FormField label="Cubicle name" required>
              <input className={inputClass} value={singleName}
                onChange={(e) => setSingleName(e.target.value)} placeholder="e.g. Room A, Bay 3" autoFocus />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Number of beds" required helper="Beds in this cubicle.">
                <input className={inputClass} type="number" min="1" max="100" value={singleBeds}
                  onChange={(e) => setSingleBeds(e.target.value)} />
              </FormField>
              <FormField label="Bed type" required>
                <select className={inputClass} value={singleBedType} onChange={(e) => setSingleBedType(e.target.value)}>
                  <option value="SINGLE">Single  (1 space)</option>
                  <option value="DOUBLE_DECKER">Bunk  (2 spaces)</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </FormField>
            </div>

            {singleBedType === "CUSTOM" && (
              <FormField label="Spaces per bed" helper="Each bed creates this many sleeping positions.">
                <input className={inputClass} type="number" min="1" max="20" value={singleCustomOcc}
                  onChange={(e) => setSingleCustomOcc(e.target.value)} />
              </FormField>
            )}

            {/* Capacity summary for single mode */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-slate">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>{singleBedsNum} bed{singleBedsNum !== 1 ? "s" : ""} × {singlePosPerBed} space{singlePosPerBed !== 1 ? "s" : ""}</span>
              </div>
              <span className="text-sm font-semibold text-teal tabular-nums">{singleCapacity} positions</span>
            </div>
          </>
        )}
        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 rounded-lg bg-teal/8 border border-teal/20 px-3 py-1.5">
            <BedDouble className="h-3.5 w-3.5 text-teal shrink-0" />
            <span className="text-xs font-medium text-teal tabular-nums">
              {mode === "auto" ? totalCapacity : singleCapacity} sleeping position{(mode === "auto" ? totalCapacity : singleCapacity) !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
            <button type="submit" disabled={saving} className={`${primaryButtonClass} disabled:opacity-40`}>
              {saving ? "Adding…" : mode === "auto" ? `Add ${count || "?"} cubicles` : "Add cubicle"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ── EditCubicleModal ──────────────────────────────────────────────────────────
//
// Lets the user rename a cubicle and/or adjust its target bed count (capacity).
// The capacity field here is the Cubicle.capacity informational field that
// drives the preview — it does not create/delete beds automatically.

function EditCubicleModal({
  cubicle, dormId, onClose, onSaved,
}: {
  cubicle: CubicleDetail;
  dormId: string;
  onClose: () => void;
  onSaved: (updated: CubicleDetail) => void;
}) {
  const [name,     setName]     = useState(cubicle.name);
  const [capacity, setCapacity] = useState(String(cubicle.capacity));
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const hasChanges =
    name.trim() !== cubicle.name ||
    parseInt(capacity) !== cubicle.capacity;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasChanges) { onClose(); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(
        `/api/accommodation/dormitories/${dormId}/cubicles/${cubicle.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name:     name.trim(),
            capacity: parseInt(capacity),
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
      onSaved(json);
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  return (
    <Modal
      title="Edit cubicle"
      description={`Adjust the name or bed capacity for ${cubicle.name}.`}
      onClose={onClose}
      size="sm"
    >
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Cubicle name" required>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </FormField>
        <FormField
          label="Bed capacity"
          helper="Target number of beds for this cubicle. Adjust beds independently via Add Beds."
        >
          <input
            className={inputClass}
            type="number"
            min="1"
            max="500"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </FormField>
        {/* Show current actual vs target */}
        <div className="rounded-lg border border-border bg-background px-4 py-3 space-y-1.5">
          <p className="text-xs font-semibold text-slate uppercase tracking-wide">Current status</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate">Beds added</span>
            <span className="font-medium text-foreground tabular-nums">{cubicle._count.beds}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate">Sleeping positions</span>
            <span className="font-medium text-foreground tabular-nums">{cubicle._count.sleepingPositions}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate">Currently occupied</span>
            <span className={`font-medium tabular-nums ${cubicle._count.allocations > 0 ? "text-teal" : "text-slate"}`}>
              {cubicle._count.allocations}
            </span>
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving || !name.trim()}
            className={`${primaryButtonClass} disabled:opacity-40`}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── CubicleSection ────────────────────────────────────────────────────────────

function CubicleSection({
  cubicle: initialCubicle, dormId, onAddBeds: _onAddBeds, onBedDeleted,
}: {
  cubicle: CubicleDetail;
  dormId: string;
  onAddBeds: (cubicleId: string) => void;
  onBedDeleted: () => void;
}) {
  const [cubicle,      setCubicle]      = useState<CubicleDetail>(initialCubicle);
  const [expanded,     setExpanded]     = useState(false);
  const [beds,         setBeds]         = useState<BedDetail[]>([]);
  const [loadingBeds,  setLoadingBeds]  = useState(false);
  const [showEdit,     setShowEdit]     = useState(false);

  async function fetchBeds() {
    if (beds.length > 0) { setExpanded((e) => !e); return; }
    setExpanded(true); setLoadingBeds(true);
    const res = await fetch(`/api/accommodation/dormitories/${dormId}/beds?cubicleId=${cubicle.id}`);
    const data = await res.json();
    if (res.ok) setBeds(data);
    setLoadingBeds(false);
  }

  function refreshBeds() {
    setBeds([]);
    setLoadingBeds(true);
    fetch(`/api/accommodation/dormitories/${dormId}/beds?cubicleId=${cubicle.id}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        setBeds(data);
      })
      .finally(() => setLoadingBeds(false));
  }

  const pct = cubicle._count.sleepingPositions > 0
    ? Math.round((cubicle._count.allocations / cubicle._count.sleepingPositions) * 100) : 0;

  const bedsVsTarget = cubicle._count.beds < cubicle.capacity
    ? `${cubicle._count.beds}/${cubicle.capacity} beds`
    : `${cubicle._count.beds} bed${cubicle._count.beds !== 1 ? "s" : ""}`;

  return (
    <>
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-card">
          {/* Expand / collapse trigger */}
          <button className="flex items-center gap-3 flex-1 text-left min-w-0" onClick={fetchBeds}>
            <div className="rounded-md bg-teal/10 p-1.5 shrink-0">
              <LayoutGrid className="h-3.5 w-3.5 text-teal" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{cubicle.name}</p>
              <p className="text-xs text-slate">
                {bedsVsTarget} · {cubicle._count.allocations}/{cubicle._count.sleepingPositions} occupied
              </p>
            </div>
            <div className="w-24 shrink-0">
              <div className="flex items-center gap-1.5">
                <OccupancyBar pct={pct} />
                <span className="text-xs tabular-nums text-slate">{pct}%</span>
              </div>
            </div>
            {expanded
              ? <ChevronUp   className="h-4 w-4 text-slate shrink-0" />
              : <ChevronDown className="h-4 w-4 text-slate shrink-0" />}
          </button>

          {/* Action buttons */}
          <button onClick={() => setShowEdit(true)}
            className="p-1.5 rounded-md text-slate hover:text-teal hover:bg-teal/10 transition-all shrink-0"
            aria-label="Edit cubicle">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        {expanded && (
          <div className="border-t border-border bg-background/50/30 p-4">
            {loadingBeds && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-line/40 animate-pulse" />)}
              </div>
            )}
            {!loadingBeds && beds.length === 0 && cubicle._count.beds > 0 && (
              <div className="text-center py-6">
                <p className="text-slate text-sm">
                  {cubicle._count.beds} bed{cubicle._count.beds !== 1 ? 's' : ''} created but details unavailable. This cubicle has {cubicle._count.sleepingPositions} sleeping position{cubicle._count.sleepingPositions !== 1 ? 's' : ''}.
                </p>
              </div>
            )}
            {!loadingBeds && beds.length === 0 && cubicle._count.beds === 0 && (
              <div className="text-center py-6">
                <p className="text-slate text-sm">No beds in this cubicle yet.</p>
              </div>
            )}
            {!loadingBeds && beds.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {beds.map((bed) => (
                  <BedCard key={bed.id} bed={bed} dormId={dormId}
                    onDeleted={(bedId) => {
                      setBeds((prev) => prev.filter((b) => b.id !== bedId));
                      setCubicle((prev) => ({
                        ...prev,
                        _count: {
                          ...prev._count,
                          beds: Math.max(0, prev._count.beds - 1),
                          sleepingPositions: Math.max(
                            0,
                            prev._count.sleepingPositions -
                              (beds.find((b) => b.id === bedId)?.positions.length ?? 1)
                          ),
                        },
                      }));
                      onBedDeleted();
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showEdit && (
        <EditCubicleModal
          cubicle={cubicle}
          dormId={dormId}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setCubicle(updated);
            setShowEdit(false);
            // If beds are visible, refresh them in case names changed
            if (expanded) refreshBeds();
          }}
        />
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DormDetailPage() {
  const { dormId } = useParams<{ dormId: string }>();
  const [dorm, setDorm] = useState<DormDetail | null>(null);
  const [beds, setBeds] = useState<BedDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showAddBeds, setShowAddBeds] = useState(false);
  const [addBedsCubicleId, setAddBedsCubicleId] = useState<string | undefined>();
  const [showAddCubicles, setShowAddCubicles] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/accommodation/dormitories/${dormId}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setDorm(data);
    setBeds(data.beds ?? []);
    setLoading(false);
  }, [dormId]);

  useEffect(() => { load(); }, [load]);

  function flash(msg: string) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); }

  if (loading) {
    return (
      <div>
        <ContextNavigation items={NAV_ITEMS} />
        <div className="space-y-4 mt-6">
          <div className="h-8 w-48 rounded bg-line/40 animate-pulse" />
          <div className="h-32 rounded-xl bg-line/40 animate-pulse" />
          <div className="h-48 rounded-xl bg-line/40 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!dorm) {
    return (
      <div>
        <ContextNavigation items={NAV_ITEMS} />
        <div className="py-20 text-center">
          <p className="text-slate">Dormitory not found.</p>
          <Link href="/principal/accommodation/dormitories" className="text-teal text-sm mt-2 inline-block hover:underline">
            Back to dormitories
          </Link>
        </div>
      </div>
    );
  }

  const isCubicleBased = dorm.structure === "CUBICLE_BASED";
  // For cubicle-based dorms derive capacity from the sum of each cubicle's
  // target capacity (set at generation time) so the number is non-zero as soon
  // as cubicles exist — even before individual beds have been added.
  const displayCapacity = isCubicleBased
    ? dorm.cubicles.reduce((sum, c) => sum + c.capacity, 0)
    : dorm.totalCapacity;
  const occupancyPct = displayCapacity > 0
    ? Math.round((dorm._count.allocations / displayCapacity) * 100) : 0;
  const available = Math.max(0, displayCapacity - dorm._count.allocations);
  const statusMeta = STATUS_META[dorm.status];

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />

      {successMsg && <div className="mb-4"><SuccessBanner message={successMsg} onDismiss={() => setSuccessMsg(null)} /></div>}
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="rounded-xl bg-teal/10 p-3 shrink-0 self-start">
            <BedDouble className="h-7 w-7 text-teal" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-semibold text-foreground">{dorm.name}</h1>
              <span className={`text-xs font-medium ${statusMeta.color}`}>{statusMeta.label}</span>
              <span className="text-xs text-slate border border-border rounded-full px-2 py-0.5">
                {GENDER_LABEL[dorm.genderPolicy]}
              </span>
              <span className="text-xs text-slate border border-border rounded-full px-2 py-0.5">
                {isCubicleBased ? "Cubicle-based" : "Open hall"}
              </span>
            </div>
            {dorm.description && <p className="text-sm text-slate mb-2">{dorm.description}</p>}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate">
              {dorm.boardingMaster && (
                <span>
                  <Link href={`/principal/staff/${dorm.boardingMaster.id}`}
                    className="font-medium text-foreground hover:text-teal transition-colors dark:hover:text-teal">
                    {dorm.boardingMaster.fullName}
                  </Link>
                  {" · Boarding master"}
                </span>
              )}
              {dorm.dormCaptain && (
                <span>
                  <Link href={`/principal/students/${dorm.dormCaptain.id}`}
                    className="font-medium text-foreground hover:text-teal transition-colors dark:hover:text-teal">
                    {dorm.dormCaptain.fullName}
                  </Link>
                  {" · Dorm captain"}
                </span>
              )}
            </div>
          </div>
          <Link href="/principal/accommodation/allocations"
            className="inline-flex items-center gap-2 rounded-lg border border-teal/30 bg-teal/5 text-teal text-sm font-medium px-4 py-2 hover:bg-teal/10 transition-all shrink-0">
            <UserCheck className="h-4 w-4" /> Allocate students
          </Link>
        </div>

        {/* Occupancy summary row */}
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total capacity", value: displayCapacity },
            { label: "Occupied", value: dorm._count.allocations, highlight: dorm._count.allocations === displayCapacity && displayCapacity > 0 },
            { label: "Available", value: available, highlight: available === 0 && displayCapacity > 0 },
            { label: "Occupancy", value: `${occupancyPct}%`, highlight: occupancyPct >= 90 },
          ].map(({ label, value, highlight }) => (
            <div key={label}>
              <p className={`text-xl font-semibold tabular-nums ${highlight ? "text-warn" : "text-foreground"}`}>{value}</p>
              <p className="text-xs text-slate">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <OccupancyBar pct={occupancyPct} />
        </div>
      </div>

      {/* Structure section */}
      {isCubicleBased ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">
              Cubicles <span className="text-slate font-normal ml-1 text-sm">({dorm.cubicles.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => { setAddBedsCubicleId(undefined); setShowAddCubicles(true); }}
                className={secondaryButtonClass + " !py-2 !text-xs"}>
                <Plus className="h-3.5 w-3.5" /> Add cubicles
              </button>
            </div>
          </div>

          {dorm.cubicles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl border border-dashed border-border">
              <LayoutGrid className="h-8 w-8 text-slate/50" />
              <p className="text-slate text-sm">No cubicles yet. Add cubicles to start organising this dorm.</p>
              <button onClick={() => setShowAddCubicles(true)} className={primaryButtonClass + " !text-xs"}>
                <Plus className="h-3.5 w-3.5" /> Add cubicles
              </button>
            </div>
          )}

          <div className="space-y-3">
            {dorm.cubicles.map((c) => (
              <CubicleSection key={c.id} cubicle={c} dormId={dormId}
                onAddBeds={(cId) => { setAddBedsCubicleId(cId); setShowAddBeds(true); }}
                onBedDeleted={load} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">
              Beds <span className="text-slate font-normal ml-1 text-sm">({beds.length})</span>
            </h2>
            <button onClick={() => { setAddBedsCubicleId(undefined); setShowAddBeds(true); }}
              className={secondaryButtonClass + " !py-2 !text-xs"}>
              <Plus className="h-3.5 w-3.5" /> Add beds
            </button>
          </div>

          {beds.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center rounded-xl border border-dashed border-border">
              <BedDouble className="h-8 w-8 text-slate/50" />
              <p className="text-slate text-sm">No beds yet. Add beds to configure sleeping positions.</p>
              <button onClick={() => setShowAddBeds(true)} className={primaryButtonClass + " !text-xs"}>
                <Plus className="h-3.5 w-3.5" /> Add beds
              </button>
            </div>
          )}

          {beds.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {beds.map((bed) => (
                <BedCard key={bed.id} bed={bed} dormId={dormId}
                  onDeleted={(bedId) => {
                    setBeds((prev) => prev.filter((b) => b.id !== bedId));
                    // Reload the dorm header so totalCapacity / occupancy numbers update
                    load();
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAddBeds && (
        <AddBedsModal dormId={dormId} cubicleId={addBedsCubicleId}
          onClose={() => setShowAddBeds(false)}
          onAdded={() => { setShowAddBeds(false); load(); flash("Beds added successfully."); }} />
      )}
      {showAddCubicles && (
        <AddCubiclesModal dormId={dormId}
          onClose={() => setShowAddCubicles(false)}
          onAdded={() => { setShowAddCubicles(false); load(); flash("Cubicles added successfully."); }} />
      )}
    </div>
  );
}
