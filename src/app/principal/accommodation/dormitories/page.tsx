"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import Link from "next/link";
import {
  Plus, Building2, ChevronRight, Pencil, Trash2,
  Check, ChevronLeft, Users, BedDouble, LayoutGrid,
  ShieldCheck, CheckCircle2, Wrench, Lock, AlertTriangle,
} from "lucide-react";
import {
  PageHeader, ErrorBanner, SuccessBanner,
  inputClass, labelClass, primaryButtonClass, secondaryButtonClass,
  FormField,
} from "@/components/ui";
import SearchableSelect from "@/components/SearchableSelect";
import Modal from "@/components/Modal";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import { useFormDraft } from "@/lib/hooks/useFormDraft";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DormRow {
  id: string; name: string; genderPolicy: string; structure: string;
  status: string; totalCapacity: number; allocationPolicy: string;
  cubiclesInheritPolicy: boolean; description: string | null;
  boardingMaster: { id: string; fullName: string; staffId: string } | null;
  dormCaptain: { id: string; fullName: string; admissionNumber: string } | null;
  permittedForms: number[];
  cubicleCount: number; bedCount: number; positionCount: number;
  occupiedCount: number; availableCount: number;
  createdAt: string; updatedAt: string;
}

interface StaffOption { id: string; fullName: string; staffId: string; }
interface StudentOption { id: string; fullName: string; admissionNumber: string; className: string; }
interface SchoolClass { id: string; form: number; }

// ── Wizard step types ─────────────────────────────────────────────────────────

interface WizardData {
  // Step 1 — basics
  name: string; genderPolicy: string; status: string;
  boardingMasterId: string; dormCaptainId: string; description: string;
  // Step 2 — structure
  structure: string;
  // Step 3 — allocation policy
  allocationPolicy: string; cubiclesInheritPolicy: boolean; permittedForms: number[];
}

interface SchoolPolicy {
  genderPolicy: string; // "MIXED" | "BOYS_ONLY" | "GIRLS_ONLY"
}

const EMPTY_WIZARD: WizardData = {
  name: "", genderPolicy: "MIXED", status: "ACTIVE",
  boardingMasterId: "", dormCaptainId: "", description: "",
  structure: "OPEN_HALL",
  allocationPolicy: "MIXED_FORMS", cubiclesInheritPolicy: true, permittedForms: [],
};

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/principal/accommodation/overview",    label: "Overview",    exact: true },
  { href: "/principal/accommodation/dormitories", label: "Dormitories" },
  { href: "/principal/accommodation/allocations", label: "Allocations" },
  { href: "/principal/accommodation/management",  label: "Management" },
  { href: "/principal/accommodation/analytics",   label: "Analytics" },
  { href: "/principal/accommodation/inspections", label: "Inspections" },
  { href: "/principal/accommodation/reports",     label: "Reports" },
  { href: "/principal/accommodation/settings",    label: "Settings" },
];

const GENDER_LABEL: Record<string, string> = { BOYS_ONLY: "Boys", GIRLS_ONLY: "Girls", MIXED: "Mixed" };
const GENDER_COLOR: Record<string, string> = {
  BOYS_ONLY: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  GIRLS_ONLY: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800",
  MIXED: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800",
};
const STATUS_META: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  ACTIVE:            { label: "Active",      icon: CheckCircle2, color: "text-success" },
  UNDER_MAINTENANCE: { label: "Maintenance", icon: Wrench,       color: "text-warn" },
  CLOSED:            { label: "Closed",      icon: Lock,         color: "text-slate" },
};
// ── Wizard Step 1: Basics ─────────────────────────────────────────────────────

function Step1Basics({
  data, onChange, staffList, studentList, schoolPolicy,
}: {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
  staffList: StaffOption[];
  studentList: StudentOption[];
  schoolPolicy: SchoolPolicy;
}) {
  // Single-gender school → gender is fixed; mixed school → must choose Boys or Girls
  const schoolIsMixed  = schoolPolicy.genderPolicy === "MIXED";
  const genderLocked   = !schoolIsMixed;
  const lockedLabel    = schoolPolicy.genderPolicy === "BOYS_ONLY" ? "Boys only" : "Girls only";

  return (
    <div className="space-y-5">
      <FormField label="Dormitory name" required>
        <input
          className={inputClass} value={data.name} placeholder="e.g. Simba House"
          onChange={(e) => onChange({ name: e.target.value })} autoFocus
        />
      </FormField>

      {/* ── Gender field ───────────────────────────────────────────────────── */}
      {genderLocked ? (
        // Single-gender school — show read-only pill, no choice needed
        <FormField label="Gender" helper="Set by the school gender policy — cannot be changed here.">
          <input
            readOnly
            value={lockedLabel}
            className={`${inputClass} bg-paper cursor-not-allowed opacity-75`}
          />
        </FormField>
      ) : (
        // Mixed school — every dorm must be BOYS_ONLY or GIRLS_ONLY; MIXED is not allowed
        <div>
          <p className="text-sm font-medium text-ink mb-1.5 dark:text-dark-text">
            Gender <span className="text-danger">*</span>
          </p>
          <p className="text-xs text-slate dark:text-dark-muted mb-3">
            This school is mixed. Each dormitory must be dedicated to one gender — boys and girls cannot share a dorm.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: "BOYS_ONLY",  label: "Boys only",  color: "border-blue-400 bg-blue-50 dark:bg-blue-900/20",  activeRing: "ring-2 ring-blue-400",  dot: "bg-blue-500"  },
              { value: "GIRLS_ONLY", label: "Girls only", color: "border-pink-400 bg-pink-50 dark:bg-pink-900/20", activeRing: "ring-2 ring-pink-400", dot: "bg-pink-500" },
            ] as { value: string; label: string; color: string; activeRing: string; dot: string }[]).map(({ value, label, color, activeRing, dot }) => {
              const active = data.genderPolicy === value;
              return (
                <button
                  key={value} type="button"
                  onClick={() => onChange({ genderPolicy: value })}
                  className={`rounded-xl border-2 p-3.5 text-left transition-all ${
                    active
                      ? `${color} ${activeRing}`
                      : "border-line hover:border-slate-300 dark:border-dark-border dark:hover:border-dark-muted"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`h-3 w-3 rounded-full shrink-0 ${active ? dot : "bg-slate-300 dark:bg-dark-border"}`} />
                    <span className={`text-sm font-semibold ${active ? "text-ink dark:text-dark-text" : "text-slate dark:text-dark-muted"}`}>
                      {label}
                    </span>
                    {active && <Check className="h-4 w-4 ml-auto text-teal shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <FormField label="Status" required>
        <select className={inputClass} value={data.status}
          onChange={(e) => onChange({ status: e.target.value })}>
          <option value="ACTIVE">Active</option>
          <option value="UNDER_MAINTENANCE">Under Maintenance</option>
          <option value="CLOSED">Closed</option>
        </select>
      </FormField>

      <FormField label="Boarding master / matron" helper="The teacher responsible for this dormitory.">
        <SearchableSelect
          value={data.boardingMasterId}
          onChange={(id) => onChange({ boardingMasterId: id })}
          options={staffList.map((s) => ({ id: s.id, label: s.fullName, sub: s.staffId }))}
          placeholder="— None assigned —"
          searchPlaceholder="Search staff by name or ID…"
        />
      </FormField>

      <FormField label="Dorm captain" helper="An optional student leader for this dorm.">
        <SearchableSelect
          value={data.dormCaptainId}
          onChange={(id) => onChange({ dormCaptainId: id })}
          options={studentList.map((s) => ({ id: s.id, label: s.fullName, sub: `${s.admissionNumber} · ${s.className}` }))}
          placeholder="— None assigned —"
          searchPlaceholder="Search students by name or admission no…"
        />
      </FormField>

      <FormField label="Description" helper="Optional notes about this dormitory.">
        <textarea className={`${inputClass} resize-none`} rows={3}
          value={data.description} placeholder="Block B, ground floor…"
          onChange={(e) => onChange({ description: e.target.value })} />
      </FormField>
    </div>
  );
}

// ── Wizard Step 2: Structure ──────────────────────────────────────────────────

function Step2Structure({ data, onChange }: { data: WizardData; onChange: (p: Partial<WizardData>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate dark:text-dark-muted leading-relaxed">
        Choose how this dormitory is physically organised. You can always add beds and cubicles after registration.
      </p>
      <div className="grid grid-cols-1 gap-3">
        {([
          {
            value: "OPEN_HALL",
            icon: BedDouble,
            label: "Open Hall",
            desc: "Beds are placed directly inside the dormitory — no subdivisions. Best for small dorms or open dormitory layouts.",
          },
          {
            value: "CUBICLE_BASED",
            icon: LayoutGrid,
            label: "Cubicle-Based",
            desc: "Students are first organised into cubicles, rooms, or bays before being assigned a bed. Best for larger dorms with partitioned sleeping areas.",
          },
        ] as { value: string; icon: typeof BedDouble; label: string; desc: string }[]).map(({ value, icon: Icon, label, desc }) => {
          const active = data.structure === value;
          return (
            <button key={value} type="button" onClick={() => onChange({ structure: value })}
              className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                active ? "border-teal bg-teal/5 dark:bg-teal/10" : "border-line hover:border-teal/40 dark:border-dark-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-lg p-2 shrink-0 ${active ? "bg-teal/15" : "bg-slate-100 dark:bg-dark-border"}`}>
                  <Icon className={`h-5 w-5 ${active ? "text-teal" : "text-slate"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-semibold ${active ? "text-teal" : "text-ink dark:text-dark-text"}`}>{label}</p>
                    {active && <Check className="h-4 w-4 text-teal shrink-0" />}
                  </div>
                  <p className="text-xs text-slate mt-1 leading-relaxed dark:text-dark-muted">{desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Wizard Step 3: Allocation policy ─────────────────────────────────────────

function Step3Policy({ data, onChange, schoolForms }: { data: WizardData; onChange: (p: Partial<WizardData>) => void; schoolForms: number[] }) {
  const toggleForm = (f: number) => {
    const current = data.permittedForms;
    onChange({ permittedForms: current.includes(f) ? current.filter((x) => x !== f) : [...current, f] });
  };
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate dark:text-dark-muted leading-relaxed">
        Control which students may be allocated to this dormitory.
      </p>
      <div className="grid grid-cols-1 gap-3">
        {([
          { value: "MIXED_FORMS",       icon: Users,       label: "Mixed Forms",        desc: "Students from all forms and classes may share this dormitory together." },
          { value: "RESTRICTED_BY_FORM", icon: ShieldCheck, label: "Restricted by Form", desc: "Only students from the selected forms may be allocated here." },
        ] as { value: string; icon: typeof Users; label: string; desc: string }[]).map(({ value, icon: Icon, label, desc }) => {
          const active = data.allocationPolicy === value;
          return (
            <button key={value} type="button" onClick={() => onChange({ allocationPolicy: value })}
              className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                active ? "border-teal bg-teal/5 dark:bg-teal/10" : "border-line hover:border-teal/40 dark:border-dark-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-lg p-2 shrink-0 ${active ? "bg-teal/15" : "bg-slate-100 dark:bg-dark-border"}`}>
                  <Icon className={`h-5 w-5 ${active ? "text-teal" : "text-slate"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-semibold ${active ? "text-teal" : "text-ink dark:text-dark-text"}`}>{label}</p>
                    {active && <Check className="h-4 w-4 text-teal shrink-0" />}
                  </div>
                  <p className="text-xs text-slate mt-1 leading-relaxed dark:text-dark-muted">{desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {data.allocationPolicy === "RESTRICTED_BY_FORM" && (
        <div>
          <label className={labelClass}>Permitted forms</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {schoolForms.map((f) => {
              const on = data.permittedForms.includes(f);
              return (
                <button key={f} type="button" onClick={() => toggleForm(f)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    on ? "bg-teal text-white border-teal" : "border-line text-slate hover:border-teal/40 dark:border-dark-border dark:text-dark-muted"
                  }`}
                >
                  {on && <Check className="h-3 w-3" />} Form {f}
                </button>
              );
            })}
          </div>
          {data.permittedForms.length === 0 && (
            <p className="text-xs text-warn mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Select at least one form.
            </p>
          )}
        </div>
      )}

      {data.structure === "CUBICLE_BASED" && (
        <div className="rounded-lg border border-line bg-paper dark:bg-dark-surface dark:border-dark-border p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={data.cubiclesInheritPolicy}
              onChange={(e) => onChange({ cubiclesInheritPolicy: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-line text-teal focus:ring-teal/30"
            />
            <div>
              <p className="text-sm font-medium text-ink dark:text-dark-text">Cubicles inherit this policy</p>
              <p className="text-xs text-slate mt-0.5 dark:text-dark-muted">
                When enabled, all cubicles follow the dorm-level allocation policy. Disable to set individual cubicle policies.
              </p>
            </div>
          </label>
        </div>
      )}
    </div>
  );
}

// ── DormWizard modal ──────────────────────────────────────────────────────────

const STEP_LABELS = ["Basics", "Structure", "Allocation Policy"];

function DormWizard({
  onClose, onSaved, editDorm, staffList, studentList, schoolPolicy, schoolForms,
}: {
  onClose: () => void;
  onSaved: (dorm: DormRow) => void;
  editDorm?: DormRow | null;
  staffList: StaffOption[];
  studentList: StudentOption[];
  schoolPolicy: SchoolPolicy;
  schoolForms: number[];
}) {
  const dormWizardDraftKey = `bidii_draft_dorm_wizard_${editDorm?.id ?? "new"}`;

  // Derive the correct default genderPolicy from school settings for new dorms.
  // Mixed school → default to BOYS_ONLY (user must pick Boys or Girls; MIXED is not allowed).
  // Single-gender school → locked to that gender.
  const schoolGenderDefault =
    schoolPolicy.genderPolicy === "GIRLS_ONLY" ? "GIRLS_ONLY" : "BOYS_ONLY";

  const defaultData: WizardData = editDorm
    ? {
        name: editDorm.name, genderPolicy: editDorm.genderPolicy,
        status: editDorm.status, boardingMasterId: editDorm.boardingMaster?.id ?? "",
        dormCaptainId: editDorm.dormCaptain?.id ?? "", description: editDorm.description ?? "",
        structure: editDorm.structure, allocationPolicy: editDorm.allocationPolicy,
        cubiclesInheritPolicy: editDorm.cubiclesInheritPolicy,
        permittedForms: editDorm.permittedForms,
      }
    : { ...EMPTY_WIZARD, genderPolicy: schoolGenderDefault };

  const [wizDraft, setWizDraft, clearWizDraft] = useFormDraft(
    dormWizardDraftKey,
    defaultData as unknown as Record<string, unknown>,
  );

  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(
    // For new dorms, restore draft; for edits always use the server data
    editDorm ? defaultData : (wizDraft as unknown as WizardData)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<WizardData>) => {
    setData((d) => {
      const next = { ...d, ...p };
      // Persist after every change (only for new dorms — edits always start fresh)
      if (!editDorm) setWizDraft(next as unknown as Record<string, unknown>);
      return next;
    });
  };

  const canNext = () => {
    if (step === 0) {
      if (!data.name.trim()) return false;
      // For mixed schools, gender must be explicitly set to BOYS_ONLY or GIRLS_ONLY
      if (schoolPolicy.genderPolicy === "MIXED" && data.genderPolicy === "MIXED") return false;
      return true;
    }
    if (step === 2 && data.allocationPolicy === "RESTRICTED_BY_FORM") return data.permittedForms.length > 0;
    return true;
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Guard: only submit when on the final step — prevents accidental
    // Enter-key submissions from text inputs on earlier steps bubbling through.
    if (step !== STEP_LABELS.length - 1) return;
    if (!canNext()) return;
    setSaving(true); setError(null);
    try {
      const payload = {
        name: data.name.trim(), genderPolicy: data.genderPolicy, status: data.status,
        boardingMasterId: data.boardingMasterId || null,
        dormCaptainId: data.dormCaptainId || null,
        description: data.description.trim() || null,
        structure: data.structure, allocationPolicy: data.allocationPolicy,
        cubiclesInheritPolicy: data.cubiclesInheritPolicy,
        permittedForms: data.allocationPolicy === "RESTRICTED_BY_FORM" ? data.permittedForms : [],
      };
      const res = editDorm
        ? await fetch(`/api/accommodation/dormitories/${editDorm.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
          })
        : await fetch("/api/accommodation/dormitories", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
      clearWizDraft();
      onSaved(json);
    } catch { setError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  return (
    <Modal
      title={editDorm ? `Edit ${editDorm.name}` : "Register Dormitory"}
      description={editDorm ? "Update dormitory details." : `Step ${step + 1} of ${STEP_LABELS.length} — ${STEP_LABELS[step]}`}
      onClose={() => { if (!editDorm) clearWizDraft(); onClose(); }} size="md"
      disableBackdropClose
    >
      {/* Step indicator */}
      {!editDorm && (
        <div className="flex items-center gap-1.5 mb-6">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                i < step ? "bg-teal text-white" : i === step ? "bg-teal text-white ring-2 ring-teal/30" : "bg-line text-slate dark:bg-dark-border dark:text-dark-muted"
              }`}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${i === step ? "text-teal" : "text-slate dark:text-dark-muted"}`}>{label}</span>
              {i < STEP_LABELS.length - 1 && <div className="w-8 h-px bg-line dark:bg-dark-border" />}
            </div>
          ))}
        </div>
      )}

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") e.preventDefault(); }}>
        {step === 0 && <Step1Basics data={data} onChange={patch} staffList={staffList} studentList={studentList} schoolPolicy={schoolPolicy} />}
        {step === 1 && <Step2Structure data={data} onChange={patch} />}
        {step === 2 && <Step3Policy data={data} onChange={patch} schoolForms={schoolForms} />}

        <div className="flex items-center justify-between gap-3 mt-6">
          <button type="button" onClick={() => { if (!editDorm) clearWizDraft(); onClose(); }} className={secondaryButtonClass}>Cancel</button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className={secondaryButtonClass}>
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            )}
            {step < STEP_LABELS.length - 1 ? (
              <button key="next" type="button" onClick={() => setStep((s) => s + 1)}
                disabled={!canNext()}
                className={`${primaryButtonClass} disabled:opacity-40`}>
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button key="submit" type="submit"
                disabled={saving || !canNext()}
                className={`${primaryButtonClass} disabled:opacity-40`}>
                {saving ? "Saving…" : editDorm ? "Save changes" : "Register dormitory"}
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export default function DormitoriesPage() {
  const [dorms, setDorms] = useState<DormRow[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [studentList, setStudentList] = useState<StudentOption[]>([]);
  const [schoolPolicy, setSchoolPolicy] = useState<SchoolPolicy>({ genderPolicy: "MIXED" });
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [editDorm, setEditDorm] = useState<DormRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, sr, studr, schoolr, classesR] = await Promise.all([
        fetch("/api/accommodation/dormitories").then((r) => r.json()),
        fetch("/api/staff?limit=200").then((r) => r.ok ? r.json() : []),
        fetch("/api/accommodation/students?limit=200").then((r) => r.ok ? r.json() : []),
        fetch("/api/school/settings").then((r) => r.ok ? r.json() : null),
        fetch("/api/classes").then((r) => r.ok ? r.json() : []),
      ]);
      setDorms(Array.isArray(dr) ? dr : []);
      setStaffList(Array.isArray(sr) ? sr : []);
      setStudentList(Array.isArray(studr) ? studr : []);
      if (schoolr) setSchoolPolicy({ genderPolicy: schoolr.genderPolicy ?? "MIXED" });
      setClasses(Array.isArray(classesR) ? classesR : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = dorms.filter((d) =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete(id: string) {
    setDeleteError(null);
    const res = await fetch(`/api/accommodation/dormitories/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) { setDeleteError(json.error ?? "Failed to delete."); return; }
    setDorms((prev) => prev.filter((d) => d.id !== id));
    setDeletingId(null);
    setSuccessMsg("Dormitory deleted.");
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  function handleSaved(dorm: DormRow) {
    setDorms((prev) => {
      const idx = prev.findIndex((d) => d.id === dorm.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = dorm; return next; }
      return [dorm, ...prev];
    });
    setShowWizard(false);
    setEditDorm(null);
    setSuccessMsg(editDorm ? "Dormitory updated." : "Dormitory registered successfully.");
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />
      <PageHeader
        title="Dormitories"
        description="Register and manage all boarding dormitories, their structure, and allocation policies."
        action={
          <button onClick={() => { setEditDorm(null); setShowWizard(true); }} className={primaryButtonClass}>
            <Plus className="h-4 w-4" /> Register Dormitory
          </button>
        }
      />

      {successMsg && <div className="mb-4"><SuccessBanner message={successMsg} onDismiss={() => setSuccessMsg(null)} /></div>}
      {deleteError && <div className="mb-4"><ErrorBanner message={deleteError} onDismiss={() => setDeleteError(null)} /></div>}

      <WorkspaceToolbar>
        <WorkspaceToolbar.Search value={search} onChange={setSearch} placeholder="Search dormitories…" />
        <WorkspaceToolbar.Actions>
          <span className="text-sm text-slate dark:text-dark-muted">{dorms.length} dormitor{dorms.length !== 1 ? "ies" : "y"}</span>
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-line/40 dark:bg-dark-border/40 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="rounded-full bg-slate-100 dark:bg-dark-surface p-5">
            <Building2 className="h-9 w-9 text-slate" />
          </div>
          <p className="text-ink font-medium dark:text-dark-text">{search ? `No dormitories match "${search}"` : "No dormitories yet"}</p>
          {!search && (
            <button onClick={() => setShowWizard(true)} className={primaryButtonClass}>
              <Plus className="h-4 w-4" /> Register first dormitory
            </button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm dark:bg-dark-surface dark:border-dark-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-line bg-slate-50/80 dark:bg-dark-border/30 text-left text-xs font-semibold text-slate uppercase tracking-wide">
                  <th className="px-5 py-3.5">Dormitory</th>
                  <th className="px-5 py-3.5 w-[100px]">Gender</th>
                  <th className="px-5 py-3.5 w-[110px]">Structure</th>
                  <th className="px-5 py-3.5 w-[120px]">Status</th>
                  <th className="px-5 py-3.5 w-[130px]">Occupancy</th>
                  <th className="px-5 py-3.5 w-[80px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((dorm) => {
                  const pct = dorm.totalCapacity > 0 ? Math.round((dorm.occupiedCount / dorm.totalCapacity) * 100) : 0;
                  const statusMeta = STATUS_META[dorm.status];
                  const StatusIcon = statusMeta.icon;
                  return (
                    <tr key={dorm.id} className="border-b border-line last:border-0 hover:bg-slate-50/50 dark:hover:bg-dark-border/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/principal/accommodation/dormitories/${dorm.id}`}
                          className="font-medium text-ink hover:text-teal transition-colors dark:text-dark-text dark:hover:text-teal">
                          {dorm.name}
                        </Link>
                        {dorm.boardingMaster && (
                          <Link href={`/principal/staff/${dorm.boardingMaster.id}`}
                            className="text-xs text-slate hover:text-teal transition-colors dark:text-dark-muted dark:hover:text-teal block w-fit">
                            {dorm.boardingMaster.fullName}
                          </Link>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${GENDER_COLOR[dorm.genderPolicy]}`}>
                          {GENDER_LABEL[dorm.genderPolicy]}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-slate dark:text-dark-muted">
                          {dorm.structure === "CUBICLE_BASED" ? "Cubicle-based" : "Open hall"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`flex items-center gap-1.5 text-xs font-medium ${statusMeta.color}`}>
                          <StatusIcon className="h-3.5 w-3.5" /> {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-line dark:bg-dark-border overflow-hidden">
                            <div className={`h-full rounded-full ${pct >= 90 ? "bg-warn" : "bg-teal"}`}
                              style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-slate dark:text-dark-muted w-8 text-right">{pct}%</span>
                        </div>
                        <p className="text-[11px] text-slate/70 dark:text-dark-muted/70 mt-0.5">
                          {dorm.occupiedCount}/{dorm.totalCapacity}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditDorm(dorm); setShowWizard(true); }}
                            className="p-1.5 rounded-md text-slate hover:text-teal hover:bg-teal/10 transition-all"
                            aria-label="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <Link href={`/principal/accommodation/dormitories/${dorm.id}`}
                            className="p-1.5 rounded-md text-slate hover:text-teal hover:bg-teal/10 transition-all"
                            aria-label="View">
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                          <button onClick={() => setDeletingId(dorm.id)}
                            className="p-1.5 rounded-md text-slate hover:text-danger hover:bg-danger/10 transition-all"
                            aria-label="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Wizard */}
      {showWizard && (
        <DormWizard
          onClose={() => { setShowWizard(false); setEditDorm(null); }}
          onSaved={handleSaved}
          editDorm={editDorm}
          staffList={staffList}
          studentList={studentList}
          schoolPolicy={schoolPolicy}
          schoolForms={[...new Set(classes.map((c) => c.form))].sort((a, b) => a - b)}
        />
      )}

      {/* Delete confirm */}
      {deletingId && (
        <Modal title="Delete Dormitory" onClose={() => setDeletingId(null)} size="sm"
          footer={
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeletingId(null)} className={secondaryButtonClass}>Cancel</button>
              <button onClick={() => handleDelete(deletingId)}
                className="inline-flex items-center gap-2 rounded-lg bg-danger text-white text-sm font-medium px-4 py-2.5 hover:bg-red-600 transition-all">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          }>
          <p className="text-sm text-slate dark:text-dark-muted">
            This will permanently delete this dormitory and all associated cubicle and bed configurations.
            Active student allocations must be removed first.
          </p>
        </Modal>
      )}
    </div>
  );
}
