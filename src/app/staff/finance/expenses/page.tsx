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
 *   - "Attach to students" button per item row.
 *   - Inline modals for all.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Plus, ChevronDown, ChevronRight, X, Pencil, Tag, Users,
  CheckCircle2, AlertTriangle, Search,
} from "lucide-react";
import {
  PageHeader, EmptyState, Spinner, ErrorBanner, primaryButtonClass,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface ExpenseItem {
  id:           string;
  name:         string;
  description:  string | null;
  currentPrice: string;
  isActive:     boolean;
  categoryId:   string;
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
  const [students,  setStudents]  = useState<StudentOption[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [saving,    setSaving]    = useState(false);
  const [result,    setResult]    = useState<{ created: number; errors: string[] } | null>(null);
  const [fetchErr,  setFetchErr]  = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Fetch all students and existing attachments for this item in parallel
        const [studentsRes, attachRes] = await Promise.all([
          fetch("/api/students?pageSize=2000&includeArchived=false"),
          fetch(`/api/finance/expense-attachments?expenseItemId=${item.id}`),
        ]);

        const studentsData = studentsRes.ok ? await studentsRes.json() : { students: [] };
        const attachData   = attachRes.ok  ? await attachRes.json()  : { attachments: [] };

        const attachedIds = new Set<string>(
          (attachData.attachments ?? []).map((a: { studentId: string }) => a.studentId)
        );

        const options: StudentOption[] = (studentsData.students ?? []).map((s: {
          id: string; fullName: string; admissionNumber: string;
          schoolClass?: { name: string };
        }) => ({
          id:              s.id,
          fullName:        s.fullName,
          admissionNumber: s.admissionNumber,
          className:       s.schoolClass?.name ?? "—",
          alreadyAttached: attachedIds.has(s.id),
        }));

        setStudents(options);
      } catch {
        setFetchErr("Could not load students. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [item.id]);

  const filtered = students.filter(s =>
    s.fullName.toLowerCase().includes(search.toLowerCase()) ||
    s.admissionNumber.toLowerCase().includes(search.toLowerCase()) ||
    s.className.toLowerCase().includes(search.toLowerCase())
  );

  const available   = filtered.filter(s => !s.alreadyAttached);
  const allSelected = available.length > 0 && available.every(s => selected.has(s.id));

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        available.forEach(s => next.delete(s.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        available.forEach(s => next.add(s.id));
        return next;
      });
    }
  }

  async function submit() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const res  = await fetch("/api/finance/expense-attachments", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ expenseItemId: item.id, studentIds: Array.from(selected) }),
      });
      const data = await res.json();
      setResult({ created: data.created ?? 0, errors: data.errors ?? [] });
      // Mark newly attached students in the local list
      setStudents(prev => prev.map(s =>
        selected.has(s.id) && !(data.errors ?? []).some((e: string) => e.includes(s.id))
          ? { ...s, alreadyAttached: true }
          : s
      ));
      setSelected(new Set());
    } catch {
      setResult({ created: 0, errors: ["Network error. Please try again."] });
    } finally {
      setSaving(false);
    }
  }

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

        {/* Search */}
        <div className="px-5 pt-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, admission no. or class…"
              className={inputCls + " pl-9"}
            />
          </div>
        </div>

        {/* Select all row */}
        {!loading && available.length > 0 && (
          <div className="px-5 pt-3 shrink-0">
            <label className="flex items-center gap-2.5 cursor-pointer select-none text-sm text-ink dark:text-dark-text">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-line accent-teal"
              />
              {allSelected ? "Deselect all" : `Select all (${available.length} available)`}
            </label>
          </div>
        )}

        {/* Student list */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-1">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner size="md" /></div>
          ) : fetchErr ? (
            <p className="text-sm text-danger py-4">{fetchErr}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate dark:text-dark-muted py-4 text-center">No students found.</p>
          ) : (
            filtered.map(s => (
              <label
                key={s.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                  s.alreadyAttached
                    ? "opacity-50 cursor-not-allowed"
                    : selected.has(s.id)
                      ? "bg-teal/5 border border-teal/20"
                      : "hover:bg-paper dark:hover:bg-dark-border/20"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(s.id) || s.alreadyAttached}
                  disabled={s.alreadyAttached}
                  onChange={() => !s.alreadyAttached && toggle(s.id)}
                  className="h-4 w-4 rounded border-line accent-teal shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{s.fullName}</p>
                  <p className="text-xs text-slate dark:text-dark-muted">
                    {s.admissionNumber} · {s.className}
                    {s.alreadyAttached && <span className="ml-2 text-teal font-medium">Already attached</span>}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-line dark:border-dark-border shrink-0 flex items-center justify-between gap-3">
          <p className="text-xs text-slate dark:text-dark-muted">
            {selected.size > 0 ? `${selected.size} student${selected.size !== 1 ? "s" : ""} selected` : "No students selected"}
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
                disabled={saving || selected.size === 0}
                className={primaryButtonClass}
              >
                {saving ? "Attaching…" : `Attach to ${selected.size || "…"} student${selected.size !== 1 ? "s" : ""}`}
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
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

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
        ? { name: name.trim(), description: description.trim() || null, currentPrice: price }
        : { categoryId, name: name.trim(), description: description.trim() || null, currentPrice: price };

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
  const [open,        setOpen]        = useState(false);
  const [items,       setItems]       = useState<ExpenseItem[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [editing,     setEditing]     = useState<ExpenseItem | null>(null);
  const [attaching,   setAttaching]   = useState<ExpenseItem | null>(null);

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
                <p className={`text-sm text-ink dark:text-dark-text ${!item.isActive ? "line-through opacity-50" : ""}`}>
                  {item.name}
                </p>
                {item.description && (
                  <p className="text-xs text-slate mt-0.5 dark:text-dark-muted">{item.description}</p>
                )}
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
