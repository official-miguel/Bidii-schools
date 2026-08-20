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
 *   - Inline modals for both.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Plus, ChevronDown, ChevronRight, X, Pencil, Tag,
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
  category: ExpenseCategory;
  onAddItem: (cat: ExpenseCategory) => void;
}

function CategoryRow({ category, onAddItem }: CategoryRowProps) {
  const [open,    setOpen]    = useState(false);
  const [items,   setItems]   = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ExpenseItem | null>(null);

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
                <button
                  onClick={() => setEditing(item)}
                  className="text-slate hover:text-teal transition-colors"
                  aria-label={`Edit ${item.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
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
    // New category always has 0 items
    setCategories(prev => [{ ...cat, _count: { items: 0 } }, ...prev]);
    setModal(null);
  }

  function handleItemSaved() {
    // Reload to get updated _count
    load();
    setModal(null);
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Manage expense categories and the chargeable items within them."
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
                  <th className={premiumThClass}></th>
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

      {/* Inline add-item trigger also uses ItemModal — handled inside CategoryRow */}
    </div>
  );
}
