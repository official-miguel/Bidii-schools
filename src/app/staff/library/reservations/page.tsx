"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X, Loader2, Users, User, Building2, List } from "lucide-react";
import {
  PageHeader, Badge, EmptyState, ErrorBanner, FormField,
  inputClass, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";

import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import SlideOver from "@/components/workspace/SlideOver";
import Modal from "@/components/Modal";

// ── Types ──────────────────────────────────────────────────────────────────

interface Reservation {
  id: string; status: string; reservationType: string;
  studentId: string | null; teacherId: string | null; departmentName: string | null;
  quantityRequested: number; notes: string | null;
  expectedReturnDate: string | null; allocatedCopyId: string | null;
  queuePosition: number | null; createdAt: string; expiresAt: string | null;
  catalogue: { id: string; title: string; bookNumber: string | null; subject: string | null; form: number | null; author: string | null };
}

interface CatalogueOption { id: string; title: string; bookNumber: string | null; subject: string | null; form: number | null; }
interface StudentOption   { id: string; fullName: string; admissionNumber: string; schoolClass: { name: string } }
interface TeacherOption   { id: string; fullName: string; staffId: string }

const STATUS_VARIANTS: Record<string,"success"|"info"|"warn"|"default"|"danger"> = {
  PENDING: "warn", ACTIVE: "success", FULFILLED: "default", CANCELLED: "default", EXPIRED: "danger",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  INDIVIDUAL: <User className="h-3.5 w-3.5" />,
  CLASSROOM:  <Users className="h-3.5 w-3.5" />,
  DEPARTMENT: <Building2 className="h-3.5 w-3.5" />,
  WAITLIST:   <List className="h-3.5 w-3.5" />,
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

// ── Create Reservation Modal ───────────────────────────────────────────────

function CreateReservationModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [rType, setRType]       = useState("INDIVIDUAL");
  const [catalogueQ, setCatalogueQ] = useState("");
  const [catalogues, setCatalogues] = useState<CatalogueOption[]>([]);
  const [selectedCat, setSelectedCat] = useState<CatalogueOption | null>(null);
  const [studentQ, setStudentQ] = useState(""); const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [teachers, setTeachers]   = useState<TeacherOption[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherOption | null>(null);
  const [deptName, setDeptName]   = useState("");
  const [qty, setQty]             = useState("1");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [notes, setNotes]         = useState("");
  const [expiryDays, setExpiryDays] = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Catalogue search
  useEffect(() => {
    if (!catalogueQ.trim()) { setCatalogues([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/library/catalogue?q=${encodeURIComponent(catalogueQ)}&take=10`);
      if (r.ok) { const d = await r.json(); setCatalogues(d.items ?? []); }
    }, 250);
    return () => clearTimeout(t);
  }, [catalogueQ]);

  // Student search
  useEffect(() => {
    if (!studentQ.trim()) { setStudents([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/library/students/search?q=${encodeURIComponent(studentQ)}`);
      if (r.ok) setStudents(await r.json());
    }, 250);
    return () => clearTimeout(t);
  }, [studentQ]);

  // Load teachers for classroom
  useEffect(() => {
    if (rType !== "CLASSROOM") return;
    fetch("/api/staff/teachers?take=200").then(r => r.ok ? r.json() : []).then(d => setTeachers(d.teachers ?? d ?? [])).catch(() => {});
  }, [rType]);

  async function handleSave() {
    if (!selectedCat) { setError("Select a book."); return; }
    setSaving(true); setError(null);
    const res = await fetch("/api/library/reservations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        catalogueId:       selectedCat.id,
        reservationType:   rType,
        studentId:         selectedStudent?.id,
        teacherId:         selectedTeacher?.id,
        departmentName:    deptName || undefined,
        quantityRequested: Number(qty),
        expectedReturnDate: expectedReturn || undefined,
        notes:             notes || undefined,
        expiryDays:        expiryDays ? Number(expiryDays) : undefined,
      }),
    });
    const json = await res.json(); setSaving(false);
    if (!res.ok) { setError(json.error ?? "Could not create reservation."); return; }
    onCreated(); onClose();
  }

  return (
    <Modal title="New Reservation" onClose={onClose} size="xl"
      footer={
        <div className="flex justify-between gap-3">
          <button className={secondaryButtonClass} onClick={onClose}>Cancel</button>
          <button className={primaryButtonClass} disabled={saving || !selectedCat} onClick={handleSave}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : "Create Reservation"}
          </button>
        </div>
      }>
      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}
        {/* Type selector */}
        <div className="grid grid-cols-4 gap-2">
          {[["INDIVIDUAL","Individual"],["CLASSROOM","Classroom"],["DEPARTMENT","Department"],["WAITLIST","Waitlist"]].map(([v,l]) => (
            <button key={v} onClick={() => setRType(v)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors ${rType === v ? "border-teal bg-teal-50 text-teal" : "border-line text-slate hover:border-teal/30"}`}>
              {TYPE_ICONS[v]} {l}
            </button>
          ))}
        </div>

        {/* Book search */}
        <FormField label="Book" required>
          {selectedCat ? (
            <div className="flex items-center gap-2 rounded-lg border border-teal/30 bg-teal-50/30 px-3 py-2">
              <p className="text-sm font-medium text-ink flex-1">{selectedCat.title}</p>
              <button onClick={() => { setSelectedCat(null); setCatalogueQ(""); }} className="text-slate hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="relative">
              <input className={inputClass} placeholder="Search book title, number…" value={catalogueQ} onChange={e => setCatalogueQ(e.target.value)} />
              {catalogues.length > 0 && (
                <ul className="absolute z-20 w-full mt-1 rounded-xl border border-line bg-white shadow-lg divide-y divide-line overflow-hidden max-h-48 overflow-y-auto">
                  {catalogues.map(c => (
                    <li key={c.id}><button onClick={() => { setSelectedCat(c); setCatalogues([]); setCatalogueQ(""); }}
                      className="w-full text-left px-4 py-3 hover:bg-teal-50/40 text-sm transition-colors">
                      <p className="font-medium text-ink">{c.title}</p>
                      <p className="text-xs text-slate">{[c.subject, c.form ? `Form ${c.form}` : null, c.bookNumber].filter(Boolean).join(" · ")}</p>
                    </button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </FormField>

        {/* Patron fields */}
        {(rType === "INDIVIDUAL" || rType === "WAITLIST") && (
          <FormField label="Student" required>
            {selectedStudent ? (
              <div className="flex items-center gap-2 rounded-lg border border-teal/30 bg-teal-50/30 px-3 py-2">
                <p className="text-sm flex-1">{selectedStudent.fullName} · {selectedStudent.admissionNumber}</p>
                <button onClick={() => setSelectedStudent(null)} className="text-slate hover:text-ink"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <input className={inputClass} placeholder="Search student name or admission number…" value={studentQ} onChange={e => setStudentQ(e.target.value)} />
                {students.length > 0 && (
                  <ul className="absolute z-20 w-full mt-1 rounded-xl border border-line bg-white shadow-lg divide-y divide-line overflow-hidden max-h-48 overflow-y-auto">
                    {students.map(s => (
                      <li key={s.id}><button onClick={() => { setSelectedStudent(s); setStudents([]); setStudentQ(""); }}
                        className="w-full text-left px-4 py-3 hover:bg-teal-50/40 text-sm transition-colors">
                        <p className="font-medium text-ink">{s.fullName}</p>
                        <p className="text-xs text-slate">{s.admissionNumber} · {s.schoolClass.name}</p>
                      </button></li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </FormField>
        )}

        {rType === "CLASSROOM" && (
          <FormField label="Teacher" required>
            <select className={inputClass} value={selectedTeacher?.id ?? ""} onChange={e => setSelectedTeacher(teachers.find(t => t.id === e.target.value) ?? null)}>
              <option value="">Select teacher…</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.fullName} ({t.staffId})</option>)}
            </select>
          </FormField>
        )}

        {rType === "DEPARTMENT" && (
          <FormField label="Department name" required>
            <input className={inputClass} value={deptName} onChange={e => setDeptName(e.target.value)} />
          </FormField>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Quantity" helper="Copies requested">
            <input type="number" min="1" max="500" className={inputClass} value={qty} onChange={e => setQty(e.target.value)} />
          </FormField>
          <FormField label="Expected return" helper="Optional">
            <input type="date" className={inputClass} value={expectedReturn} onChange={e => setExpectedReturn(e.target.value)} />
          </FormField>
          <FormField label="Expires in (days)" helper="Leave blank = no expiry">
            <input type="number" min="1" max="365" className={inputClass} value={expiryDays} onChange={e => setExpiryDays(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Notes">
          <textarea className={inputClass} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ReservationsPage() {
  const [items, setItems]         = useState<Reservation[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType]     = useState("");
  const [search, setSearch]       = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [slideItem, setSlideItem] = useState<Reservation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ take: "200" });
    if (filterStatus) sp.set("status", filterStatus);
    if (filterType)   sp.set("type", filterType);
    const r = await fetch(`/api/library/reservations?${sp}`);
    if (r.ok) { const d = await r.json(); setItems(d); }
    setLoading(false);
  }, [filterStatus, filterType]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(r =>
      r.catalogue.title.toLowerCase().includes(q) ||
      (r.catalogue.bookNumber?.toLowerCase().includes(q) ?? false)
    );
  }, [items, search]);

  async function handleCancel(id: string) {
    if (!confirm("Cancel this reservation?")) return;
    setCancelling(id);
    await fetch(`/api/library/reservations/${id}`, { method: "DELETE" });
    setCancelling(null); load();
  }

  return (
    <div>
      <PageHeader title="Reservations" description="Individual, classroom, department, and waitlist reservations."
        action={<button className={primaryButtonClass} onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />New Reservation</button>} />

      <WorkspaceToolbar>
        <WorkspaceToolbar.Search value={search} onChange={setSearch} placeholder="Search by title or book number…" />
        <WorkspaceToolbar.Filter label="Status" value={filterStatus}
          options={[{value:"",label:"All statuses"},{value:"PENDING",label:"Pending"},{value:"ACTIVE",label:"Active"},{value:"FULFILLED",label:"Fulfilled"},{value:"CANCELLED",label:"Cancelled"},{value:"EXPIRED",label:"Expired"}]}
          onChange={setFilterStatus} />
        <WorkspaceToolbar.Filter label="Type" value={filterType}
          options={[{value:"",label:"All types"},{value:"INDIVIDUAL",label:"Individual"},{value:"CLASSROOM",label:"Classroom"},{value:"DEPARTMENT",label:"Department"},{value:"WAITLIST",label:"Waitlist"}]}
          onChange={setFilterType} />
        <WorkspaceToolbar.Actions>
          <WorkspaceToolbar.ResultCount count={filtered.length} total={items.length} label="reservation" />
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {loading && <div className="space-y-2">{[...Array(5)].map((_,i) => <div key={i} className="h-16 rounded-lg bg-line/40 animate-pulse" />)}</div>}

      {!loading && filtered.length === 0 && (
        <EmptyState message="No reservations found." action={<button className={primaryButtonClass} onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Create first reservation</button>} />
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm dark:bg-dark-surface dark:border-dark-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50/80 text-left text-xs font-semibold text-slate uppercase tracking-wide dark:bg-dark-border/30">
                <th className="px-4 py-3.5">Book</th>
                <th className="px-4 py-3.5 w-[120px]">Type</th>
                <th className="px-4 py-3.5 hidden md:table-cell w-[120px]">Patron</th>
                <th className="px-4 py-3.5 hidden sm:table-cell w-[90px]">Qty</th>
                <th className="px-4 py-3.5 hidden lg:table-cell w-[120px]">Created</th>
                <th className="px-4 py-3.5 w-[100px] text-center">Status</th>
                <th className="px-4 py-3.5 w-[80px] text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-slate-50/40 cursor-pointer transition-colors dark:hover:bg-dark-border/20"
                  onClick={() => setSlideItem(r)}>
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-ink truncate max-w-[220px] dark:text-dark-text">{r.catalogue.title}</p>
                    {r.catalogue.subject && <p className="text-xs text-slate">{r.catalogue.subject}{r.catalogue.form ? ` · Form ${r.catalogue.form}` : ""}</p>}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1 text-xs text-slate">{TYPE_ICONS[r.reservationType]}{r.reservationType}</span>
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell text-xs text-slate">
                    {r.departmentName ?? (r.queuePosition != null ? `#${r.queuePosition}` : "—")}
                  </td>
                  <td className="px-4 py-3.5 hidden sm:table-cell text-sm text-center">{r.quantityRequested}</td>
                  <td className="px-4 py-3.5 hidden lg:table-cell text-xs text-slate">{fmt(r.createdAt)}</td>
                  <td className="px-4 py-3.5 text-center">
                    <Badge variant={STATUS_VARIANTS[r.status] ?? "default"}>{r.status}</Badge>
                  </td>
                  <td className="px-4 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                    {(r.status === "PENDING" || r.status === "ACTIVE") && (
                      <button onClick={() => handleCancel(r.id)} disabled={cancelling === r.id} className="text-xs text-danger hover:underline font-medium">
                        {cancelling === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Cancel"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateReservationModal onClose={() => setShowCreate(false)} onCreated={load} />}

      {slideItem && (
        <SlideOver open onClose={() => setSlideItem(null)} title="Reservation Details"
          description={slideItem.catalogue.title} size="md">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Status",   value: <Badge variant={STATUS_VARIANTS[slideItem.status] ?? "default"}>{slideItem.status}</Badge> },
                { label: "Type",     value: <span className="text-sm">{slideItem.reservationType}</span> },
                { label: "Quantity", value: <span className="text-sm">{slideItem.quantityRequested}</span> },
                { label: "Queue",    value: <span className="text-sm">{slideItem.queuePosition ?? "—"}</span> },
                { label: "Created",  value: <span className="text-sm">{fmt(slideItem.createdAt)}</span> },
                { label: "Expires",  value: <span className="text-sm">{slideItem.expiresAt ? fmt(slideItem.expiresAt) : "None"}</span> },
                { label: "Expected return", value: <span className="text-sm">{slideItem.expectedReturnDate ? fmt(slideItem.expectedReturnDate) : "—"}</span> },
                { label: "Allocated copy", value: <span className="font-mono text-xs">{slideItem.allocatedCopyId ? "Yes" : "Pending"}</span> },
              ].map(f => (
                <div key={f.label} className="rounded-lg border border-line p-3">
                  <p className="text-xs text-slate mb-1">{f.label}</p>
                  {f.value}
                </div>
              ))}
            </div>
            {slideItem.notes && (
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs text-slate mb-1">Notes</p>
                <p className="text-sm text-ink">{slideItem.notes}</p>
              </div>
            )}
          </div>
        </SlideOver>
      )}
    </div>
  );
}
