"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Users, UserX, Search, X,
  CheckCircle2, AlertTriangle, Loader2, Plus,
} from "lucide-react";
import {
  PageHeader, Badge, EmptyState, Spinner, ErrorBanner, primaryButtonClass,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface AttachedStudent {
  studentId:  string;
  attachedAt: string;
  student: {
    fullName:        string;
    admissionNumber: string;
    className:       string;
  };
}

interface ExpenseItemDetail {
  id:           string;
  name:         string;
  description:  string | null;
  currentPrice: string;
  isActive:     boolean;
  category:     { name: string };
}

interface StudentOption {
  id:              string;
  fullName:        string;
  admissionNumber: string;
  classId:         string | null;
  className:       string;
  alreadyAttached: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

const inputCls =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

// ── Attach Modal ───────────────────────────────────────────────────────────

interface AttachModalProps {
  itemId:    string;
  itemName:  string;
  itemPrice: string;
  onClose:   () => void;
  onAttached:(newStudents: StudentOption[]) => void;
}

function AttachModal({ itemId, itemName, itemPrice, onClose, onAttached }: AttachModalProps) {
  const [attachedIds,  setAttachedIds]  = useState<Set<string>>(new Set());
  const [classMap,     setClassMap]     = useState<Map<string, string>>(new Map());
  const [results,      setResults]      = useState<StudentOption[]>([]);
  const [selectedMap,  setSelectedMap]  = useState<Map<string, StudentOption>>(new Map());
  const [search,       setSearch]       = useState("");
  const [searching,    setSearching]    = useState(false);
  const [initialising, setInitialising] = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [result,       setResult]       = useState<{ created: number; errors: string[] } | null>(null);
  const [fetchErr,     setFetchErr]     = useState<string | null>(null);
  const [attachedStudents, setAttachedStudents] = useState<StudentOption[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [attachRes, classRes] = await Promise.all([
          fetch(`/api/finance/expense-attachments?expenseItemId=${itemId}`),
          fetch("/api/classes"),
        ]);
        let list: StudentOption[] = [];
        if (attachRes.ok) {
          const d = await attachRes.json();
          const raw: Array<{ studentId: string; attachedAt: string; student: { fullName: string; admissionNumber: string; className: string } }> = d.attachments ?? [];
          setAttachedIds(new Set(raw.map(a => a.studentId)));
          list = raw.map(a => ({
            id: a.studentId, fullName: a.student.fullName,
            admissionNumber: a.student.admissionNumber,
            classId: null, className: a.student.className, alreadyAttached: true,
          }));
        }
        if (classRes.ok) {
          const d = await classRes.json();
          const arr: Array<{ id: string; name: string }> = Array.isArray(d) ? d : (d.classes ?? []);
          const map = new Map<string, string>();
          arr.forEach(c => map.set(c.id, c.name));
          setClassMap(map);
        }
        setAttachedStudents(list);
      } catch {
        setFetchErr("Could not load. Please close and try again.");
      } finally {
        setInitialising(false);
      }
    }
    init();
  }, [itemId]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    try {
      const by  = /^\d/.test(q.trim()) ? "admission" : "name";
      const res = await fetch(`/api/students?q=${encodeURIComponent(q.trim())}&by=${by}&limit=50`);
      if (!res.ok) { setResults([]); return; }
      const data = await res.json() as Array<{ id: string; fullName: string; admissionNumber: string; classId: string | null }>;
      setResults(data.map(s => ({
        id: s.id, fullName: s.fullName, admissionNumber: s.admissionNumber,
        classId: s.classId ?? null,
        className: s.classId ? (classMap.get(s.classId) ?? "—") : "—",
        alreadyAttached: attachedIds.has(s.id),
      })));
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, [attachedIds, classMap]);

  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }

  function toggle(s: StudentOption) {
    if (s.alreadyAttached) return;
    setSelectedMap(prev => {
      const next = new Map(prev);
      if (next.has(s.id)) { next.delete(s.id); } else { next.set(s.id, s); }
      return next;
    });
  }

  const available = results.filter(s => !s.alreadyAttached);
  const allSelected = available.length > 0 && available.every(s => selectedMap.has(s.id));
  function toggleAll() {
    setSelectedMap(prev => {
      const next = new Map(prev);
      if (allSelected) { available.forEach(s => next.delete(s.id)); } else { available.forEach(s => next.set(s.id, s)); }
      return next;
    });
  }

  async function submit() {
    if (selectedMap.size === 0) return;
    setSaving(true);
    try {
      const res  = await fetch("/api/finance/expense-attachments", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ expenseItemId: itemId, studentIds: Array.from(selectedMap.keys()) }),
      });
      const data = await res.json();
      const successIds = new Set(Array.from(selectedMap.keys()).filter(id => !(data.errors ?? []).some((e: string) => e.includes(id))));
      setAttachedIds(prev => new Set([...prev, ...successIds]));
      setResults(prev => prev.map(s => successIds.has(s.id) ? { ...s, alreadyAttached: true } : s));
      const newlyAttached = Array.from(selectedMap.values()).filter(s => successIds.has(s.id)).map(s => ({ ...s, alreadyAttached: true }));
      setAttachedStudents(prev => [...newlyAttached, ...prev]);
      setResult({ created: data.created ?? 0, errors: data.errors ?? [] });
      setSelectedMap(new Map());
      if (newlyAttached.length > 0) onAttached(newlyAttached);
    } catch {
      setResult({ created: 0, errors: ["Network error. Please try again."] });
    } finally { setSaving(false); }
  }

  const selectedCount = selectedMap.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-dark-surface shadow-xl border border-line dark:border-dark-border animate-scale-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-dark-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">Attach students</h2>
            <p className="text-xs text-slate dark:text-dark-muted mt-0.5">{itemName} — {formatKES(itemPrice)}</p>
          </div>
          <button onClick={onClose} className="text-slate hover:text-ink dark:text-dark-muted"><X className="h-5 w-5" /></button>
        </div>

        {/* Result banner */}
        {result && (
          <div className={`mx-5 mt-4 rounded-xl border px-4 py-3 text-sm shrink-0 ${result.errors.length > 0 && result.created === 0 ? "border-danger/30 bg-danger-bg/40 text-danger" : "border-success/30 bg-success/5 text-success"}`}>
            <div className="flex items-center gap-2">
              {result.created > 0 ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <span>
                {result.created > 0 && `${result.created} student${result.created !== 1 ? "s" : ""} attached.`}
                {result.errors.length > 0 && ` ${result.errors.length} error${result.errors.length !== 1 ? "s" : ""}.`}
              </span>
            </div>
            {result.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-slate dark:text-dark-muted">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* Search */}
        <div className="px-5 pt-4 shrink-0">
          <div className="relative">
            {searching
              ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal animate-spin pointer-events-none" />
              : <Search  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" />}
            <input
              type="text" value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search by name or admission number…"
              className={inputCls + " pl-9"}
              autoFocus disabled={initialising}
            />
          </div>
          {!initialising && !search && (
            <p className="text-xs text-slate dark:text-dark-muted mt-1.5">Type to search this school&apos;s students.</p>
          )}
        </div>

        {/* Select all */}
        {!initialising && available.length > 0 && (
          <div className="px-5 pt-3 shrink-0">
            <label className="flex items-center gap-2.5 cursor-pointer select-none text-sm text-ink dark:text-dark-text">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-line accent-teal" />
              {allSelected ? "Deselect all visible" : `Select all visible (${available.length})`}
            </label>
          </div>
        )}

        {/* List */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-1 min-h-[120px]">
          {initialising ? (
            <div className="flex justify-center py-8"><Spinner size="md" /></div>
          ) : fetchErr ? (
            <p className="text-sm text-danger py-4 text-center">{fetchErr}</p>
          ) : !search.trim() ? (
            attachedStudents.length === 0 ? (
              <p className="text-sm text-slate dark:text-dark-muted py-6 text-center">No students attached yet. Search above to attach.</p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate dark:text-dark-muted px-1 pb-1">Already attached ({attachedStudents.length})</p>
                {attachedStudents.map(s => (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-teal/5 border border-teal/10">
                    <div className="h-4 w-4 shrink-0 rounded border border-teal/40 bg-teal/10 flex items-center justify-center">
                      <svg className="h-2.5 w-2.5 text-teal" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{s.fullName}</p>
                      <p className="text-xs text-slate dark:text-dark-muted">
                        <span className="font-mono">{s.admissionNumber}</span>
                        {s.className !== "—" && <span> · {s.className}</span>}
                        <span className="ml-2 text-teal font-medium">Attached</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : searching && results.length === 0 ? (
            <div className="flex justify-center py-8"><Spinner size="md" /></div>
          ) : results.length === 0 ? (
            <p className="text-sm text-slate dark:text-dark-muted py-6 text-center">No students found for &ldquo;{search}&rdquo;.</p>
          ) : results.map(s => (
            <label key={s.id} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors select-none ${
              s.alreadyAttached ? "opacity-50 cursor-not-allowed" : selectedMap.has(s.id) ? "bg-teal/5 border border-teal/20 cursor-pointer" : "hover:bg-paper dark:hover:bg-dark-border/20 cursor-pointer"
            }`}>
              <input type="checkbox" checked={selectedMap.has(s.id) || s.alreadyAttached} disabled={s.alreadyAttached}
                onChange={() => toggle(s)} className="h-4 w-4 rounded border-line accent-teal shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{s.fullName}</p>
                <p className="text-xs text-slate dark:text-dark-muted">
                  <span className="font-mono">{s.admissionNumber}</span>
                  {s.className !== "—" && <span> · {s.className}</span>}
                  {s.alreadyAttached && <span className="ml-2 text-teal font-medium">Already attached</span>}
                </p>
              </div>
            </label>
          ))}
        </div>

        {/* Selected chips */}
        {selectedCount > 0 && (
          <div className="px-5 pb-2 shrink-0">
            <div className="rounded-lg bg-teal/5 border border-teal/20 px-3 py-2">
              <p className="text-xs font-medium text-teal mb-1.5">{selectedCount} student{selectedCount !== 1 ? "s" : ""} selected</p>
              <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                {Array.from(selectedMap.values()).map(s => (
                  <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2 py-0.5 text-xs text-teal font-medium">
                    {s.fullName}
                    <button type="button" onClick={() => toggle(s)} className="hover:text-danger transition-colors" aria-label={`Remove ${s.fullName}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-line dark:border-dark-border shrink-0 flex items-center justify-between gap-3">
          <p className="text-xs text-slate dark:text-dark-muted">
            {selectedCount > 0 ? `${selectedCount} student${selectedCount !== 1 ? "s" : ""} selected` : "No students selected"}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-line text-sm font-medium text-slate hover:text-ink hover:bg-paper dark:border-dark-border dark:text-dark-muted">
              {result ? "Close" : "Cancel"}
            </button>
            {!result && (
              <button type="button" onClick={submit} disabled={saving || selectedCount === 0} className={primaryButtonClass}>
                {saving ? "Attaching…" : `Attach ${selectedCount || "…"} student${selectedCount !== 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ExpenseItemDetailPage() {
  const { itemId } = useParams<{ itemId: string }>();

  const [item,       setItem]       = useState<ExpenseItemDetail | null>(null);
  const [students,   setStudents]   = useState<AttachedStudent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [showAttach, setShowAttach] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemRes, attachRes] = await Promise.all([
        fetch(`/api/finance/expense-items/${itemId}`),
        fetch(`/api/finance/expense-attachments?expenseItemId=${itemId}`),
      ]);
      if (!itemRes.ok) throw new Error("Expense item not found.");
      const itemData   = await itemRes.json();
      const attachData = attachRes.ok ? await attachRes.json() : { attachments: [] };
      setItem(itemData.item);
      setStudents(attachData.attachments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  // When new students are attached via the modal, add them to the table
  function handleAttached(newStudents: StudentOption[]) {
    const asAttached: AttachedStudent[] = newStudents.map(s => ({
      studentId:  s.id,
      attachedAt: new Date().toISOString(),
      student: {
        fullName:        s.fullName,
        admissionNumber: s.admissionNumber,
        className:       s.className,
      },
    }));
    setStudents(prev => [...asAttached, ...prev]);
  }

  const filtered = search.trim()
    ? students.filter(a => {
        const q = search.trim().toLowerCase();
        return (
          a.student.fullName.toLowerCase().includes(q) ||
          a.student.admissionNumber.toLowerCase().includes(q) ||
          a.student.className.toLowerCase().includes(q)
        );
      })
    : students;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/staff/finance/expenses"
        className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink mb-4 transition-colors dark:text-dark-muted dark:hover:text-dark-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to expenses
      </Link>

      <PageHeader
        title={loading ? "Loading…" : (item?.name ?? "Expense item")}
        description={
          item
            ? `${item.category.name} · ${formatKES(item.currentPrice)}${item.description ? ` · ${item.description}` : ""}`
            : ""
        }
        action={
          item ? (
            <button className={primaryButtonClass} onClick={() => setShowAttach(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Attach students
            </button>
          ) : undefined
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Stats */}
      {!loading && item && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {[
            { label: "Students attached", value: String(students.length), icon: <Users className="h-5 w-5" aria-hidden="true" /> },
            { label: "Price per term",    value: formatKES(item.currentPrice), icon: <span className="text-sm font-bold">KES</span> },
            { label: "Status",            value: item.isActive ? "Active" : "Inactive",
              icon: <span className="h-2 w-2 rounded-full inline-block" style={{ background: item.isActive ? "var(--color-success, #22c55e)" : "var(--color-slate, #94a3b8)" }} /> },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-line bg-white p-4 flex gap-3 items-start dark:bg-dark-surface dark:border-dark-border">
              <div className="h-9 w-9 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">{c.icon}</div>
              <div>
                <p className="text-xl font-semibold tabular-nums leading-none text-ink dark:text-dark-text">{c.value}</p>
                <p className="text-xs text-slate mt-1 dark:text-dark-muted">{c.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search bar */}
      {!loading && students.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" />
            <input
              type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, admission no. or class…"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 pl-9 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink dark:text-dark-muted transition-colors" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {search.trim() && (
            <p className="text-xs text-slate dark:text-dark-muted shrink-0">{filtered.length} of {students.length} shown</p>
          )}
        </div>
      )}

      {/* Students table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl border border-line bg-paper animate-pulse" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          message="No students attached to this expense yet."
          icon={<UserX className="h-6 w-6" />}
          action={
            <button className={primaryButtonClass} onClick={() => setShowAttach(true)}>
              <Plus className="h-4 w-4" />
              Attach students
            </button>
          }
        />
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Student</th>
                  <th className={premiumThClass}>Class</th>
                  <th className={premiumThClass}>Attached on</th>
                  <th className={premiumThClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-sm text-slate dark:text-dark-muted">
                      No students match &ldquo;{search}&rdquo;.{" "}
                      <button type="button" onClick={() => setSearch("")} className="text-teal font-medium hover:underline">Clear search</button>
                    </td>
                  </tr>
                ) : filtered.map(a => (
                  <tr key={a.studentId} className={premiumTrClass}>
                    <td className={premiumTdClass}>
                      <p className="font-medium text-ink dark:text-dark-text">{a.student.fullName}</p>
                      <p className="text-xs font-mono text-slate dark:text-dark-muted">{a.student.admissionNumber}</p>
                    </td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>{a.student.className}</td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted text-xs`}>{formatDate(a.attachedAt)}</td>
                    <td className={premiumTdClass}><Badge variant="teal">Attached</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attach modal */}
      {showAttach && item && (
        <AttachModal
          itemId={item.id}
          itemName={item.name}
          itemPrice={item.currentPrice}
          onClose={() => setShowAttach(false)}
          onAttached={handleAttached}
        />
      )}
    </div>
  );
}
