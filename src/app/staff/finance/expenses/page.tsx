"use client";

/**
 * Expenses page
 *
 * Two-level model:
 *   ExpenseCategory  — e.g. "Stationery", "Sports"
 *   ExpenseItem      — a chargeable item inside a category, e.g. "Lab fees – KES 500"
 *
 * UI:
 *   - List of categories, each expandable to show its items.
 *   - "Add category" button at the top.
 *   - "Add item" button per category row.
 *   - "Attach to students" button per item row — opens live-search modal.
 *   - Inline modals for all.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Plus, ChevronDown, ChevronRight, X, Pencil, Tag, Users,
  CheckCircle2, AlertTriangle, Search, Loader2,
} from "lucide-react";
import {
  PageHeader, EmptyState, Spinner, ErrorBanner, primaryButtonClass,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface FinancialTermName {
  id:   string;
  name: string;
}

interface ExpenseItem {
  id:           string;
  name:         string;
  description:  string | null;
  currentPrice: string;
  isActive:     boolean;
  categoryId:   string;
  termNameId:   string | null;
  termName:     { id: string; name: string } | null;
}

interface ExpenseCategory {
  id:          string;
  name:        string;
  description: string | null;
  _count:      { items: number };
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

const inputCls =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";
const labelCls = "block text-sm font-medium text-ink dark:text-dark-text mb-1";

// ── Attach to Students Modal ───────────────────────────────────────────────

interface AttachModalProps {
  item:    ExpenseItem;
  onClose: () => void;
}

function AttachToStudentsModal({ item, onClose }: AttachModalProps) {
  // IDs of students who already have this expense attached (fetched once)
  const [attachedIds,  setAttachedIds]  = useState<Set<string>>(new Set());
  // classId → class name map for display
  const [classMap,     setClassMap]     = useState<Map<string, string>>(new Map());
  // Server search results for the current query
  const [results,      setResults]      = useState<StudentOption[]>([]);
  // Persists selections across search changes: studentId → StudentOption
  const [selectedMap,  setSelectedMap]  = useState<Map<string, StudentOption>>(new Map());

  const [search,       setSearch]       = useState("");
  const [searching,    setSearching]    = useState(false);
  const [initialising, setInitialising] = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [result,       setResult]       = useState<{ created: number; errors: string[] } | null>(null);
  const [fetchErr,     setFetchErr]     = useState<string | null>(null);

  // Full student objects for already-attached students (shown before any search)
  const [attachedStudents, setAttachedStudents] = useState<StudentOption[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── One-time init: load attached students + class map ────────────────
  useEffect(() => {
    async function init() {
      try {
        const [attachRes, classRes] = await Promise.all([
          fetch(`/api/finance/expense-attachments?expenseItemId=${item.id}`),
          fetch("/api/classes"),
        ]);

        let attachedStudentList: StudentOption[] = [];

        if (attachRes.ok) {
          const d = await attachRes.json();
          const rawAttachments: Array<{
            studentId: string;
            attachedAt: string;
            student: { fullName: string; admissionNumber: string; className: string };
          }> = d.attachments ?? [];

          setAttachedIds(new Set(rawAttachments.map(a => a.studentId)));
          attachedStudentList = rawAttachments.map(a => ({
            id:              a.studentId,
            fullName:        a.student.fullName,
            admissionNumber: a.student.admissionNumber,
            classId:         null,
            className:       a.student.className,
            alreadyAttached: true,
          }));
        }

        if (classRes.ok) {
          const d = await classRes.json();
          const arr: Array<{ id: string; name: string }> = Array.isArray(d)
            ? d : (d.classes ?? []);
          const map = new Map<string, string>();
          for (const c of arr) map.set(c.id, c.name);
          setClassMap(map);
        }

        setAttachedStudents(attachedStudentList);
      } catch {
        setFetchErr("Could not initialise. Please close and try again.");
      } finally {
        setInitialising(false);
      }
    }
    init();
  }, [item.id]);

  // ── Live search (debounced, server-side) ──────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    try {
      // Heuristic: if the query starts with a digit treat it as an admission number
      const by  = /^\d/.test(q.trim()) ? "admission" : "name";
      const url = `/api/students?q=${encodeURIComponent(q.trim())}&by=${by}&limit=50`;
      const res = await fetch(url);
      if (!res.ok) { setResults([]); return; }

      // /api/students GET returns a flat array
      const data = await res.json() as Array<{
        id: string; fullName: string; admissionNumber: string; classId: string | null;
      }>;

      setResults(data.map(s => ({
        id:              s.id,
        fullName:        s.fullName,
        admissionNumber: s.admissionNumber,
        classId:         s.classId ?? null,
        className:       s.classId ? (classMap.get(s.classId) ?? "—") : "—",
        alreadyAttached: attachedIds.has(s.id),
      })));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [attachedIds, classMap]);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);           // show spinner immediately
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }

  // ── Selection helpers ─────────────────────────────────────────────────
  function toggle(student: StudentOption) {
    if (student.alreadyAttached) return;
    setSelectedMap(prev => {
      const next = new Map(prev);
      if (next.has(student.id)) next.delete(student.id);
      else next.set(student.id, student);
      return next;
    });
  }

  const availableInResults = results.filter(s => !s.alreadyAttached);
  const allResultsSelected =
    availableInResults.length > 0 &&
    availableInResults.every(s => selectedMap.has(s.id));

  function toggleAllResults() {
    setSelectedMap(prev => {
      const next = new Map(prev);
      if (allResultsSelected) {
        availableInResults.forEach(s => next.delete(s.id));
      } else {
        availableInResults.forEach(s => next.set(s.id, s));
      }
      return next;
    });
  }

  // ── Submit ────────────────────────────────────────────────────────────
  async function submit() {
    if (selectedMap.size === 0) return;
    setSaving(true);
    try {
      const res  = await fetch("/api/finance/expense-attachments", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          expenseItemId: item.id,
          studentIds:    Array.from(selectedMap.keys()),
        }),
      });
      const data = await res.json();

      const successIds = new Set(
        Array.from(selectedMap.keys()).filter(
          id => !(data.errors ?? []).some((e: string) => e.includes(id))
        )
      );
      setAttachedIds(prev => new Set([...prev, ...successIds]));
      setResults(prev =>
        prev.map(s => successIds.has(s.id) ? { ...s, alreadyAttached: true } : s)
      );
      setResult({ created: data.created ?? 0, errors: data.errors ?? [] });
      setSelectedMap(new Map());
      // Add newly attached students to the visible attached list
      const newlyAttached = Array.from(selectedMap.values())
        .filter(s => successIds.has(s.id))
        .map(s => ({ ...s, alreadyAttached: true }));
      setAttachedStudents(prev => [...newlyAttached, ...prev]);
    } catch {
      setResult({ created: 0, errors: ["Network error. Please try again."] });
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = selectedMap.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-dark-surface shadow-xl border border-line dark:border-dark-border animate-scale-in flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-dark-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">Attach to students</h2>
            <p className="text-xs text-slate dark:text-dark-muted mt-0.5">
              {item.name} — {formatKES(item.currentPrice)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate hover:text-ink dark:text-dark-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Result banner */}
        {result && (
          <div className={`mx-5 mt-4 rounded-xl border px-4 py-3 text-sm shrink-0 ${
            result.errors.length > 0 && result.created === 0
              ? "border-danger/30 bg-danger-bg/40 text-danger"
              : "border-success/30 bg-success/5 text-success"
          }`}>
            <div className="flex items-center gap-2">
              {result.created > 0
                ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                : <AlertTriangle className="h-4 w-4 shrink-0" />}
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

        {/* Search box */}
        <div className="px-5 pt-4 shrink-0">
          <div className="relative">
            {searching
              ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal animate-spin pointer-events-none" />
              : <Search  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" />
            }
            <input
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search by name or admission number…"
              className={inputCls + " pl-9"}
              autoFocus
              disabled={initialising}
            />
          </div>
          {!initialising && !search && (
            <p className="text-xs text-slate dark:text-dark-muted mt-1.5">
              Type a name or admission number to search this school&apos;s students.
            </p>
          )}
        </div>

        {/* Select all visible */}
        {!initialising && availableInResults.length > 0 && (
          <div className="px-5 pt-3 shrink-0">
            <label className="flex items-center gap-2.5 cursor-pointer select-none text-sm text-ink dark:text-dark-text">
              <input
                type="checkbox"
                checked={allResultsSelected}
                onChange={toggleAllResults}
                className="h-4 w-4 rounded border-line accent-teal"
              />
              {allResultsSelected
                ? "Deselect all visible"
                : `Select all visible (${availableInResults.length})`}
            </label>
          </div>
        )}

        {/* Results list */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-1 min-h-[120px]">
          {initialising ? (
            <div className="flex justify-center py-8"><Spinner size="md" /></div>
          ) : fetchErr ? (
            <p className="text-sm text-danger py-4 text-center">{fetchErr}</p>
          ) : !search.trim() ? (
            attachedStudents.length === 0 ? (
              <p className="text-sm text-slate dark:text-dark-muted py-6 text-center">
                No students attached yet. Search above to attach students.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate dark:text-dark-muted px-1 pb-1">
                  Already attached ({attachedStudents.length})
                </p>
                {attachedStudents.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-teal/5 border border-teal/10"
                  >
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
            <p className="text-sm text-slate dark:text-dark-muted py-6 text-center">
              No students found for &ldquo;{search}&rdquo;.
            </p>
          ) : (
            results.map(s => (
              <label
                key={s.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors select-none ${
                  s.alreadyAttached
                    ? "opacity-50 cursor-not-allowed"
                    : selectedMap.has(s.id)
                      ? "bg-teal/5 border border-teal/20 cursor-pointer"
                      : "hover:bg-paper dark:hover:bg-dark-border/20 cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedMap.has(s.id) || s.alreadyAttached}
                  disabled={s.alreadyAttached}
                  onChange={() => toggle(s)}
                  className="h-4 w-4 rounded border-line accent-teal shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{s.fullName}</p>
                  <p className="text-xs text-slate dark:text-dark-muted">
                    <span className="font-mono">{s.admissionNumber}</span>
                    {s.className !== "—" && <span> · {s.className}</span>}
                    {s.alreadyAttached && (
                      <span className="ml-2 text-teal font-medium">Already attached</span>
                    )}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>

        {/* Selected chips — persists across search queries */}
        {selectedCount > 0 && (
          <div className="px-5 pb-2 shrink-0">
            <div className="rounded-lg bg-teal/5 border border-teal/20 px-3 py-2">
              <p className="text-xs font-medium text-teal mb-1.5">
                {selectedCount} student{selectedCount !== 1 ? "s" : ""} selected
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                {Array.from(selectedMap.values()).map(s => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2 py-0.5 text-xs text-teal font-medium"
                  >
                    {s.fullName}
                    <button
                      type="button"
                      onClick={() => toggle(s)}
                      className="hover:text-danger transition-colors"
                      aria-label={`Remove ${s.fullName}`}
                    >
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
            {selectedCount > 0
              ? `${selectedCount} student${selectedCount !== 1 ? "s" : ""} selected`
              : "No students selected"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-line text-sm font-medium text-slate hover:text-ink hover:bg-paper dark:border-dark-border dark:text-dark-muted"
            >
              {result ? "Close" : "Cancel"}
            </button>
            {!result && (
              <button
                type="button"
                onClick={submit}
                disabled={saving || selectedCount === 0}
                className={primaryButtonClass}
              >
                {saving
                  ? "Attaching…"
                  : `Attach to ${selectedCount || "…"} student${selectedCount !== 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Category modal ─────────────────────────────────────────────────────────

interface CategoryModalProps {
  onClose:  () => void;
  onSaved:  (c: ExpenseCategory) => void;
}

function CategoryModal({ onClose, onSaved }: CategoryModalProps) {
  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Category name is required."); return; }
    setError(null);
    setSaving(true);
    try {
      const res  = await fetch("/api/finance/expense-categories", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save."); setSaving(false); return; }
      onSaved(data.category);
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface shadow-xl border border-line dark:border-dark-border animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-dark-border">
          <h2 className="text-base font-semibold text-ink dark:text-dark-text">Add expense category</h2>
          <button onClick={onClose} className="text-slate hover:text-ink dark:text-dark-muted"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          {error && <p className="text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className={labelCls}>Category name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Stationery" className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Description <span className="text-slate font-normal">(optional)</span></label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description" className={inputCls} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-line text-sm font-medium text-slate hover:text-ink hover:bg-paper dark:border-dark-border dark:text-dark-muted">Cancel</button>
            <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? "Saving…" : "Add category"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Item modal ─────────────────────────────────────────────────────────────

interface ItemModalProps {
  categoryId:   string;
  categoryName: string;
  existing?:    ExpenseItem;
  onClose:      () => void;
  onSaved:      (item: ExpenseItem) => void;
}

function ItemModal({ categoryId, categoryName, existing, onClose, onSaved }: ItemModalProps) {
  const isEdit = !!existing;
  const [name,         setName]         = useState(existing?.name ?? "");
  const [description,  setDescription]  = useState(existing?.description ?? "");
  const [currentPrice, setCurrentPrice] = useState(existing?.currentPrice ?? "");
  const [termNameId,   setTermNameId]   = useState(existing?.termNameId ?? "");
  const [termNames,    setTermNames]    = useState<FinancialTermName[]>([]);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Load financial term names for the dropdown
  useEffect(() => {
    fetch("/api/finance/academic-term-names")
      .then(r => r.ok ? r.json() : { termNames: [] })
      .then(d => setTermNames(d.termNames ?? []));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Item name is required."); return; }
    const price = parseFloat(currentPrice);
    if (isNaN(price) || price <= 0) { setError("Enter a valid price."); return; }
    setError(null);
    setSaving(true);
    try {
      const url    = isEdit ? `/api/finance/expense-items/${existing!.id}` : "/api/finance/expense-items";
      const method = isEdit ? "PATCH" : "POST";
      const body   = isEdit
        ? { name: name.trim(), description: description.trim() || null, currentPrice: price, termNameId: termNameId || null }
        : { categoryId, name: name.trim(), description: description.trim() || null, currentPrice: price, termNameId: termNameId || null };

      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save."); setSaving(false); return; }
      onSaved(data.item);
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface shadow-xl border border-line dark:border-dark-border animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-dark-border">
          <div>
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">
              {isEdit ? "Edit item" : "Add expense item"}
            </h2>
            <p className="text-xs text-slate dark:text-dark-muted mt-0.5">{categoryName}</p>
          </div>
          <button onClick={onClose} className="text-slate hover:text-ink dark:text-dark-muted"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          {error && <p className="text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className={labelCls}>Item name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lab fees" className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Description <span className="text-slate font-normal">(optional)</span></label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Price (KES)</label>
            <input type="number" min="1" step="0.01" value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} placeholder="e.g. 500" className={inputCls} required />
          </div>
          <div>
            <label className={labelCls}>Term</label>
            <select
              value={termNameId}
              onChange={e => setTermNameId(e.target.value)}
              className={inputCls}
            >
              <option value="">All terms (applies every term)</option>
              {termNames.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <p className="text-xs text-slate mt-1 dark:text-dark-muted">
              Leave as &ldquo;All terms&rdquo; to invoice this expense every term, or pick a specific term.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-line text-sm font-medium text-slate hover:text-ink hover:bg-paper dark:border-dark-border dark:text-dark-muted">Cancel</button>
            <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? "Saving…" : isEdit ? "Save changes" : "Add item"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Category row ───────────────────────────────────────────────────────────

interface CategoryRowProps {
  category:  ExpenseCategory;
  onAddItem: (cat: ExpenseCategory) => void;
}

function CategoryRow({ category, onAddItem }: CategoryRowProps) {
  const [open,      setOpen]      = useState(false);
  const [items,     setItems]     = useState<ExpenseItem[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [editing,   setEditing]   = useState<ExpenseItem | null>(null);
  const [attaching, setAttaching] = useState<ExpenseItem | null>(null);

  async function loadItems() {
    if (items.length > 0) { setOpen(true); return; }
    setLoading(true);
    setOpen(true);
    try {
      const res  = await fetch(`/api/finance/expense-items?categoryId=${category.id}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (!open) loadItems();
    else setOpen(false);
  }

  function handleItemSaved(item: ExpenseItem) {
    setItems(prev => {
      const idx = prev.findIndex(x => x.id === item.id);
      return idx >= 0 ? prev.map(x => x.id === item.id ? item : x) : [...prev, item];
    });
    setEditing(null);
  }

  return (
    <>
      {/* Category header row */}
      <tr className={premiumTrClass}>
        <td className={premiumTdClass}>
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-2 font-semibold text-ink dark:text-dark-text hover:text-teal transition-colors"
          >
            {open
              ? <ChevronDown className="h-4 w-4 text-teal shrink-0" />
              : <ChevronRight className="h-4 w-4 text-slate/60 shrink-0" />
            }
            {category.name}
          </button>
          {category.description && (
            <p className="text-xs text-slate ml-6 mt-0.5 dark:text-dark-muted">{category.description}</p>
          )}
        </td>
        <td className={`${premiumTdClass} text-slate text-sm dark:text-dark-muted`}>
          {category._count.items} {category._count.items === 1 ? "item" : "items"}
        </td>
        <td className={premiumTdClass}>
          <button
            type="button"
            onClick={() => onAddItem(category)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-teal hover:text-teal-dark transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add item
          </button>
        </td>
      </tr>

      {/* Expanded items */}
      {open && (
        loading ? (
          <tr>
            <td colSpan={3} className="py-3 pl-10">
              <Spinner size="sm" />
            </td>
          </tr>
        ) : items.length === 0 ? (
          <tr>
            <td colSpan={3} className={`${premiumTdClass} pl-10 text-slate text-sm dark:text-dark-muted italic`}>
              No items yet — click &ldquo;Add item&rdquo; to add one.
            </td>
          </tr>
        ) : (
          items.map(item => (
            <tr key={item.id} className="border-b border-line/50 dark:border-dark-border/50 bg-paper/40 dark:bg-dark-bg/30">
              <td className={`${premiumTdClass} pl-10`}>
                <Link
                  href={`/staff/finance/expenses/${item.id}`}
                  className={`text-sm font-medium hover:text-teal transition-colors ${!item.isActive ? "line-through opacity-50 text-slate" : "text-ink dark:text-dark-text"}`}
                >
                  {item.name}
                </Link>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.description && (
                    <p className="text-xs text-slate dark:text-dark-muted">{item.description}</p>
                  )}
                  {item.termName && (
                    <span className="text-[10px] font-medium bg-teal/10 text-teal px-1.5 py-0.5 rounded">
                      {item.termName.name}
                    </span>
                  )}
                  {!item.termName && (
                    <span className="text-[10px] text-slate dark:text-dark-muted">All terms</span>
                  )}
                </div>
              </td>
              <td className={`${premiumTdClass} tabular-nums font-semibold text-ink dark:text-dark-text`}>
                {formatKES(item.currentPrice)}
              </td>
              <td className={premiumTdClass}>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditing(item)}
                    className="text-slate hover:text-teal transition-colors"
                    aria-label={`Edit ${item.name}`}
                    title="Edit item"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setAttaching(item)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-teal hover:text-teal/80 transition-colors"
                    aria-label={`Attach ${item.name} to students`}
                    title="Attach to students"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Attach
                  </button>
                </div>
              </td>
            </tr>
          ))
        )
      )}

      {editing && (
        <ItemModal
          categoryId={category.id}
          categoryName={category.name}
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={handleItemSaved}
        />
      )}

      {attaching && (
        <AttachToStudentsModal
          item={attaching}
          onClose={() => setAttaching(null)}
        />
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

type ModalState =
  | null
  | { kind: "category" }
  | { kind: "item"; category: ExpenseCategory };

export default function ExpensesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [modal,      setModal]      = useState<ModalState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/finance/expense-categories");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setCategories(data.categories ?? []);
    } catch {
      setError("Could not load expense categories. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCategorySaved(cat: ExpenseCategory) {
    setCategories(prev => [{ ...cat, _count: { items: 0 } }, ...prev]);
    setModal(null);
  }

  function handleItemSaved() {
    load();
    setModal(null);
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Manage expense categories and items. Attach items to individual students — they get invoiced at the start of each term."
        action={
          <button className={primaryButtonClass} onClick={() => setModal({ kind: "category" })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add category
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : categories.length === 0 ? (
        <EmptyState
          message="No expense categories yet. Add a category to get started."
          icon={<Tag className="h-6 w-6" />}
          action={
            <button className={primaryButtonClass} onClick={() => setModal({ kind: "category" })}>
              <Plus className="h-4 w-4" />
              Add category
            </button>
          }
        />
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Category / Item</th>
                  <th className={premiumThClass}>Items / Price</th>
                  <th className={premiumThClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    onAddItem={(c) => setModal({ kind: "item", category: c })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal?.kind === "category" && (
        <CategoryModal
          onClose={() => setModal(null)}
          onSaved={handleCategorySaved}
        />
      )}

      {modal?.kind === "item" && (
        <ItemModal
          categoryId={modal.category.id}
          categoryName={modal.category.name}
          onClose={() => setModal(null)}
          onSaved={handleItemSaved}
        />
      )}
    </div>
  );
}
