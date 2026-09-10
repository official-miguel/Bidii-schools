"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import {
  ClipboardList, Plus, CheckCircle2, Calendar,
  Star, ChevronDown, ChevronUp, Pencil, Trash2,
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

type Rating = "EXCELLENT" | "GOOD" | "SATISFACTORY" | "NEEDS_IMPROVEMENT" | "POOR";
type InspStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

interface InspectionItem { id?: string; category: string; item: string; rating: Rating; score: number | null; notes: string | null; }
interface Inspection {
  id: string; dormId: string; inspectionDate: string; status: InspStatus;
  overallRating: Rating | null; overallScore: number | null;
  notes: string | null; recommendations: string | null; nextInspectionDate: string | null;
  dorm: { id: string; name: string }; inspectedBy: { email: string } | null;
  items: InspectionItem[];
}
interface DormOption { id: string; name: string; }

const RATING_COLOR: Record<Rating, string> = {
  EXCELLENT:         "text-success bg-success/10 border-success/20",
  GOOD:              "text-teal bg-teal/10 border-teal/20",
  SATISFACTORY:      "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20",
  NEEDS_IMPROVEMENT: "text-warn bg-warn-bg/50 border-warn/20",
  POOR:              "text-danger bg-danger/10 border-danger/20",
};
const STATUS_COLOR: Record<InspStatus, string> = {
  SCHEDULED:   "text-teal bg-teal/10 border-teal/20",
  IN_PROGRESS: "text-warn bg-warn/10 border-warn/20",
  COMPLETED:   "text-success bg-success/10 border-success/20",
  CANCELLED:   "text-slate bg-slate/10 border-border",
};

const DEFAULT_CATEGORIES = [
  { category: "Cleanliness", items: ["Floors & surfaces", "Bathrooms & toilets", "Windows & walls", "Common areas"] },
  { category: "Safety",      items: ["Fire extinguishers present", "Emergency exits clear", "Electrical safety", "Lighting"] },
  { category: "Order",       items: ["Beds made & tidy", "Personal items stored", "Notice boards updated", "Rules posted"] },
  { category: "Maintenance", items: ["Plumbing functional", "Doors & locks", "Roof & ceiling", "General repairs needed"] },
];

// ── RatingSelector ────────────────────────────────────────────────────────────
function RatingSelector({ value, onChange }: { value: Rating; onChange: (r: Rating) => void }) {
  const options: Rating[] = ["EXCELLENT","GOOD","SATISFACTORY","NEEDS_IMPROVEMENT","POOR"];
  const labels: Record<Rating, string> = { EXCELLENT:"Excellent", GOOD:"Good", SATISFACTORY:"Satisfactory", NEEDS_IMPROVEMENT:"Needs Improvement", POOR:"Poor" };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((r) => (
        <button key={r} type="button" onClick={() => onChange(r)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${value === r ? RATING_COLOR[r] : "border-border text-slate hover:border-teal/30"}`}>
          {labels[r]}
        </button>
      ))}
    </div>
  );
}

// ── InspectionFormModal ───────────────────────────────────────────────────────
function InspectionFormModal({ dorms, editing, onClose, onSaved }: {
  dorms: DormOption[]; editing?: Inspection | null; onClose: () => void; onSaved: () => void;
}) {
  const [dormId, setDormId]             = useState(editing?.dormId ?? "");
  const [inspDate, setInspDate]         = useState(editing?.inspectionDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [status, setStatus]             = useState<InspStatus>(editing?.status ?? "COMPLETED");
  const [overallRating, setOverall]     = useState<Rating | "">(editing?.overallRating ?? "");
  const [overallScore, setScore]        = useState<string>(editing?.overallScore?.toString() ?? "");
  const [notes, setNotes]               = useState(editing?.notes ?? "");
  const [recommendations, setRecs]     = useState(editing?.recommendations ?? "");
  const [nextDate, setNextDate]         = useState(editing?.nextInspectionDate?.slice(0, 10) ?? "");
  const [items, setItems]               = useState<InspectionItem[]>(
    editing?.items?.length
      ? editing.items
      : DEFAULT_CATEGORIES.flatMap((cat) => cat.items.map((item) => ({ category: cat.category, item, rating: "SATISFACTORY" as Rating, score: null, notes: null })))
  );
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<"details" | "checklist">("checklist");

  function updateItem(i: number, patch: Partial<InspectionItem>) {
    setItems((prev) => { const next = [...prev]; next[i] = { ...next[i], ...patch }; return next; });
  }

  // Auto-compute overall score from item scores
  const computedScore = (() => {
    const withScores = items.filter((it) => it.score !== null);
    if (!withScores.length) return null;
    return Math.round(withScores.reduce((s, it) => s + (it.score ?? 0), 0) / withScores.length);
  })();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dormId) { setError("Select a dormitory."); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        dormId, inspectionDate: inspDate, status,
        overallRating: overallRating || null,
        overallScore: overallScore ? parseFloat(overallScore) : computedScore,
        notes: notes || null, recommendations: recommendations || null,
        nextInspectionDate: nextDate || null,
        items,
      };
      const url = editing ? `/api/accommodation/inspections/${editing.id}` : "/api/accommodation/inspections";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      onSaved();
    } catch { setError("Network error."); } finally { setSaving(false); }
  }

  const grouped = items.reduce((acc, item, idx) => {
    const grp = acc[item.category] ?? [];
    grp.push({ ...item, _idx: idx });
    acc[item.category] = grp;
    return acc;
  }, {} as Record<string, (InspectionItem & { _idx: number })[]>);

  return (
    <Modal title={editing ? "Edit Inspection" : "New Inspection"}
      description={editing ? `Editing inspection for ${editing.dorm.name}` : "Record a dormitory inspection with checklist items."}
      onClose={onClose} size="xl">
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Tabs */}
      <div className="flex border-b border-border mb-4 -mx-1">
        {(["checklist","details"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? "border-teal text-teal" : "border-transparent text-slate hover:text-foreground"}`}>
            {t === "checklist" ? "Inspection Checklist" : "Details & Summary"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {tab === "details" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Dormitory" required>
                <select className={inputClass} value={dormId} onChange={(e) => setDormId(e.target.value)}>
                  <option value="">— Select dormitory —</option>
                  {dorms.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </FormField>
              <FormField label="Inspection date" required>
                <input type="date" className={inputClass} value={inspDate} onChange={(e) => setInspDate(e.target.value)} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Status">
                <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as InspStatus)}>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </FormField>
              <FormField label="Next inspection date">
                <input type="date" className={inputClass} value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
              </FormField>
            </div>
            <FormField label="Overall rating">
              <RatingSelector value={(overallRating as Rating) || "SATISFACTORY"} onChange={setOverall} />
            </FormField>
            <FormField label="Overall score (0–100)" helper={computedScore ? `Auto-computed from checklist: ${computedScore}` : "Leave blank to auto-compute from checklist"}>
              <input type="number" min="0" max="100" className={inputClass} value={overallScore}
                onChange={(e) => setScore(e.target.value)} placeholder={computedScore?.toString() ?? "0–100"} />
            </FormField>
            <FormField label="Notes">
              <textarea className={`${inputClass} resize-none`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
            <FormField label="Recommendations">
              <textarea className={`${inputClass} resize-none`} rows={3} value={recommendations} onChange={(e) => setRecs(e.target.value)} placeholder="Action items for improvement…" />
            </FormField>
          </div>
        )}

        {tab === "checklist" && (
          <div className="space-y-4">
            {!dormId && <div className="rounded-lg bg-warn/10 border border-warn/20 px-3 py-2.5 text-sm text-warn">Select a dormitory in the Details tab first.</div>}
            {Object.entries(grouped).map(([cat, catItems]) => (
              <div key={cat} className="rounded-xl border border-border overflow-hidden">
                <div className="bg-slate-50/80/30 px-4 py-2.5">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">{cat}</p>
                </div>
                <div className="divide-y divide-border/50 /50">
                  {catItems.map(({ _idx, ...it }) => (
                    <div key={_idx} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-sm text-foreground">{it.item}</p>
                        <input type="number" min="0" max="100" placeholder="Score"
                          className="w-16 text-xs border border-border rounded-md px-2 py-1 text-center"
                          value={items[_idx].score ?? ""} onChange={(e) => updateItem(_idx, { score: e.target.value ? parseInt(e.target.value) : null })} />
                      </div>
                      <RatingSelector value={items[_idx].rating} onChange={(r) => updateItem(_idx, { rating: r })} />
                      <input type="text" placeholder="Notes (optional)"
                        className="mt-2 w-full text-xs border border-border/50 rounded-md px-2.5 py-1.5/50"
                        value={items[_idx].notes ?? ""} onChange={(e) => updateItem(_idx, { notes: e.target.value || null })} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Form actions — inside the form so they work on mobile */}
        <div className="flex gap-3 justify-end pt-4 mt-2 border-t border-border">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving || !dormId}
            className={`${primaryButtonClass} disabled:opacity-40`}>
            {saving ? "Saving…" : editing ? "Save changes" : "Save inspection"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function InspectionCard({
  inspection, onEdit, onDelete,
}: { inspection: Inspection; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const grouped = inspection.items.reduce((acc, it) => {
    const grp = acc[it.category] ?? [];
    grp.push(it);
    acc[it.category] = grp;
    return acc;
  }, {} as Record<string, InspectionItem[]>);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-semibold text-foreground">{inspection.dorm.name}</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_COLOR[inspection.status]}`}>
                {inspection.status.replace("_", " ")}
              </span>
              {inspection.overallRating && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${RATING_COLOR[inspection.overallRating]}`}>
                  {inspection.overallRating.replace("_", " ")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate flex-wrap">
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(inspection.inspectionDate).toLocaleDateString()}</span>
              {inspection.inspectedBy && <span>by {inspection.inspectedBy.email}</span>}
              {inspection.overallScore !== null && (
                <span className="font-semibold text-foreground">{Math.round(inspection.overallScore)}/100</span>
              )}
              {inspection.nextInspectionDate && (
                <span className="text-teal">Next: {new Date(inspection.nextInspectionDate).toLocaleDateString()}</span>
              )}
            </div>
            {inspection.notes && (
              <p className="text-xs text-slate mt-1.5 italic line-clamp-2">{inspection.notes}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit} className="p-1.5 rounded-md text-slate hover:text-teal hover:bg-teal/10 transition-all">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-md text-slate hover:text-danger hover:bg-danger/10 transition-all">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {inspection.items.length > 0 && (
          <button onClick={() => setExpanded((e) => !e)}
            className="mt-3 flex items-center gap-1.5 text-xs text-teal hover:underline">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Hide checklist" : `View checklist (${inspection.items.length} items)`}
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border bg-background/50/30 p-4 space-y-4">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">{cat}</p>
              <div className="space-y-1.5">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-foreground">{it.item}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {it.score !== null && <span className="tabular-nums text-slate">{it.score}/100</span>}
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${RATING_COLOR[it.rating]}`}>
                        {it.rating.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {inspection.recommendations && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">Recommendations</p>
              <p className="text-xs text-slate">{inspection.recommendations}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main inspections page ─────────────────────────────────────────────────────
export default function InspectionsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [dorms, setDorms]             = useState<DormOption[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatus]     = useState("");
  const [dormFilter, setDormFilter]   = useState("");
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState<Inspection | null>(null);
  const [successMsg, setSuccessMsg]   = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [refreshing, setRefreshing]   = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dormFilter)   params.set("dormId", dormFilter);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "100");
      const [inspRes, dormRes] = await Promise.all([
        fetch(`/api/accommodation/inspections?${params}`),
        fetch("/api/accommodation/dormitories"),
      ]);
      if (inspRes.ok) setInspections(await inspRes.json());
      if (dormRes.ok) {
        const d = await dormRes.json();
        setDorms(d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
      }
    } finally { setLoading(false); setRefreshing(false); }
  }, [dormFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  function flash(msg: string) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 4000); }

  async function handleDelete(id: string) {
    if (!confirm("Delete this inspection record?")) return;
    const res = await fetch(`/api/accommodation/inspections/${id}`, { method: "DELETE" });
    if (res.ok) { flash("Inspection deleted."); load(true); }
    else setError("Failed to delete.");
  }

  const filtered = inspections.filter((ins) =>
    !search || ins.dorm.name.toLowerCase().includes(search.toLowerCase())
  );

  const completedCount  = inspections.filter((i) => i.status === "COMPLETED").length;
  const scheduledCount  = inspections.filter((i) => i.status === "SCHEDULED").length;
  const avgScore = (() => {
    const with_score = inspections.filter((i) => i.overallScore !== null && i.status === "COMPLETED");
    if (!with_score.length) return null;
    return Math.round(with_score.reduce((s, i) => s + (i.overallScore ?? 0), 0) / with_score.length);
  })();

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />
      <PageHeader
        title="Dorm Inspections"
        description="Schedule and record cleanliness, safety, and order inspections for each dormitory."
        action={
          <button onClick={() => { setEditing(null); setShowForm(true); }} className={primaryButtonClass}>
            <Plus className="h-4 w-4" /> New Inspection
          </button>
        }
      />

      {successMsg && <div className="mb-4"><SuccessBanner message={successMsg} onDismiss={() => setSuccessMsg(null)} /></div>}
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total inspections", value: inspections.length, icon: ClipboardList, color: "text-teal", bg: "bg-teal/10" },
            { label: "Completed",         value: completedCount,     icon: CheckCircle2,  color: "text-success", bg: "bg-success/10" },
            { label: "Scheduled",         value: scheduledCount,     icon: Calendar,      color: scheduledCount > 0 ? "text-teal" : "text-slate", bg: "bg-teal/10" },
            { label: "Avg. score",        value: avgScore !== null ? `${avgScore}/100` : "—", icon: Star, color: avgScore !== null && avgScore >= 70 ? "text-success" : "text-warn", bg: "bg-amber-100 dark:bg-amber-900/20" },
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
        <WorkspaceToolbar.Search value={search} onChange={setSearch} placeholder="Filter by dorm name…" />
        <WorkspaceToolbar.Actions>
          <select value={dormFilter} onChange={(e) => setDormFilter(e.target.value)}
            className="text-xs border border-border rounded-lg px-2.5 py-2 bg-card">
            <option value="">All dorms</option>
            {dorms.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatus(e.target.value)}
            className="text-xs border border-border rounded-lg px-2.5 py-2 bg-card">
            <option value="">All statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <WorkspaceToolbar.RefreshButton onClick={() => load(true)} loading={refreshing} />
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-line/40/40 animate-pulse" />)}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="rounded-full bg-slate-100 p-4">
            <ClipboardList className="h-8 w-8 text-slate" />
          </div>
          <p className="text-foreground font-medium">No inspections yet</p>
          <p className="text-slate text-sm max-w-sm">
            Schedule regular inspections to track dorm cleanliness, safety, and order.
          </p>
          <button onClick={() => setShowForm(true)} className={primaryButtonClass}>
            <Plus className="h-4 w-4" /> Create first inspection
          </button>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((ins) => (
          <InspectionCard key={ins.id} inspection={ins}
            onEdit={() => { setEditing(ins); setShowForm(true); }}
            onDelete={() => handleDelete(ins.id)} />
        ))}
      </div>

      {showForm && (
        <InspectionFormModal
          dorms={dorms} editing={editing} onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); flash(editing ? "Inspection updated." : "Inspection saved."); load(true); }}
        />
      )}
    </div>
  );
}
