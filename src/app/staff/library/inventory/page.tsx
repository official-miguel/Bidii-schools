"use client";

/**
 * /staff/library/inventory
 *
 * Full Library Inventory management page.
 *
 * Features:
 *   - Live search (debounced 250ms) across title / author / subject
 *   - Category filter pills
 *   - Paginated catalogue list — one row per Book (title), showing copy counts
 *   - Expand a row to see all physical Copies with status + bookNumber
 *   - Add Book modal (POST /api/library/catalogue)
 *   - Edit Book modal (PATCH /api/library/catalogue/[id])
 *   - Add Copies inline (POST /api/library/copies)
 *   - Bulk CSV import (POST /api/library/catalogue/import)
 *   - Print QR sheet button per-book (GET /api/library/copies/qr-sheet?catalogueId=)
 *   - Status badges: Available · Checked Out · Reserved
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus, Upload, Search, BookOpen, ChevronRight,
  Edit2, QrCode, Package, X, Loader2, FileText,
  CheckCircle2, AlertCircle, RefreshCw, ExternalLink,
  Trash2, RotateCcw,
} from "lucide-react";
import {
  PageHeader, Badge, EmptyState, ErrorBanner,
  inputClass, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface CatalogueItem {
  id:              string;
  title:           string;
  author:          string | null;
  edition:         string | null;
  level:           string | null;
  subject:         string | null;
  form:            number | null;
  bookNumber:      string | null;
  category:        string;
  shelf:           string | null;
  shelfRow:        string | null;
  language:        string;
  totalCopies:     number;
  availableCopies: number;
  checkedOut:      number;
  reserved:        number;
  archivedAt:      string | null;
}

interface CopyRow {
  id:              string;
  bookNumber:      string | null;
  accessionNumber: string;
  status:          string;
  condition:       string;
  archivedAt:      string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, "success"|"info"|"warn"|"default"> = {
  AVAILABLE:   "success",
  BORROWED:    "info",
  RESERVED:    "warn",
  UNDER_REPAIR:"warn",
  ARCHIVED:    "default",
};

const CATEGORIES = [
  "TEXTBOOK","REFERENCE","FICTION","NON_FICTION","NOVEL",
  "SCIENCE","MATHEMATICS","HUMANITIES","LANGUAGES","OTHER",
];

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function useDebounce(value: string, delay: number) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

// ── CSV parser (client-side, import screen) ────────────────────────────────

function parseImportCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/"/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function LibraryInventoryPage() {
  const [items,      setItems]      = useState<CatalogueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [loadingMore,setLoadingMore]= useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [q,          setQ]          = useState("");
  const [category,   setCategory]   = useState("");
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());
  const [copies,     setCopies]     = useState<Record<string, CopyRow[]>>({});
  const [loadingCopies, setLoadingCopies] = useState<Set<string>>(new Set());

  // Modals
  const [showAddBook,  setShowAddBook]  = useState(false);
  const [editBook,     setEditBook]     = useState<CatalogueItem | null>(null);
  const [addCopiesFor, setAddCopiesFor] = useState<CatalogueItem | null>(null);
  const [showImport,   setShowImport]   = useState(false);

  const dq = useDebounce(q, 250);

  // ── Fetch catalogue ──────────────────────────────────────────────────────

  const fetchCatalogue = useCallback(async (reset = true, cursor?: string) => {
    if (reset) { setLoading(true); setError(null); }
    else setLoadingMore(true);

    const params = new URLSearchParams({ take: "50" });
    if (dq)       params.set("q", dq);
    if (category) params.set("category", category);
    if (cursor)   params.set("cursor", cursor);

    try {
      const res  = await fetch(`/api/library/catalogue?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      if (reset) {
        setItems(json.items ?? []);
      } else {
        setItems(prev => [...prev, ...(json.items ?? [])]);
      }
      setNextCursor(json.nextCursor ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load catalogue");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [dq, category]);

  useEffect(() => { fetchCatalogue(true); }, [fetchCatalogue]);

  // ── Expand / collapse a book row — loads its copies ─────────────────────

  const toggleExpand = async (item: CatalogueItem) => {
    const id = item.id;
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); return n; }
      n.add(id); return n;
    });

    if (copies[id]) return; // already loaded

    setLoadingCopies(prev => new Set(prev).add(id));
    try {
      const res  = await fetch(`/api/library/copies?catalogueId=${id}`);
      const json = await res.json();
      setCopies(prev => ({ ...prev, [id]: Array.isArray(json) ? json : [] }));
    } finally {
      setLoadingCopies(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  // ── After add/edit — refresh that row's copies ────────────────────────

  const refreshCopies = async (catalogueId: string) => {
    const res  = await fetch(`/api/library/copies?catalogueId=${catalogueId}`);
    const json = await res.json();
    setCopies(prev => ({ ...prev, [catalogueId]: Array.isArray(json) ? json : [] }));
  };
  // ── QR sheet download ─────────────────────────────────────────────────

  const downloadQRSheet = (catalogueId: string) => {
    window.open(`/api/library/copies/qr-sheet?catalogueId=${catalogueId}`, "_blank");
  };

  return (
    <div>
      <PageHeader
        title="Library Inventory"
        description="Manage books and physical copies, generate QR stickers, and import in bulk."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowImport(true)} className={secondaryButtonClass}>
              <Upload className="h-4 w-4" /> Bulk Import
            </button>
            <button onClick={() => setShowAddBook(true)} className={primaryButtonClass}>
              <Plus className="h-4 w-4" /> Add Book
            </button>
          </div>
        }
      />

      {/* ── Search + filter bar ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate/50 pointer-events-none" />
          <input
            className="w-full rounded-lg border border-line bg-white pl-10 pr-4 py-2 text-sm text-ink focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 transition-colors dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
            placeholder="Search title, author, subject…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {/* Category pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setCategory("")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${!category ? "bg-teal text-white border-teal" : "bg-white text-slate border-line hover:border-teal/40 dark:bg-dark-surface dark:text-dark-muted dark:border-dark-border"}`}
          >
            All
          </button>
          {["TEXTBOOK","FICTION","REFERENCE","NON_FICTION","OTHER"].map(c => (
            <button
              key={c}
              onClick={() => setCategory(prev => prev === c ? "" : c)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${category === c ? "bg-teal text-white border-teal" : "bg-white text-slate border-line hover:border-teal/40 dark:bg-dark-surface dark:text-dark-muted dark:border-dark-border"}`}
            >
              {c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* ── Catalogue list ───────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-line bg-white animate-pulse dark:bg-dark-surface dark:border-dark-border" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          message={q ? `No books match "${q}"` : "No books in the catalogue yet."}
          action={
            <button onClick={() => setShowAddBook(true)} className={primaryButtonClass}>
              <Plus className="h-4 w-4" /> Add First Book
            </button>
          }
        />
      ) : (
        <div className="rounded-xl border border-line overflow-hidden bg-white dark:bg-dark-surface dark:border-dark-border">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-line bg-slate-50/80 dark:bg-dark-border/30">
            <span className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted">Book</span>
            <span className="text-xs font-semibold text-slate uppercase tracking-wide text-center dark:text-dark-muted w-20">Copies</span>
            <span className="text-xs font-semibold text-slate uppercase tracking-wide text-center dark:text-dark-muted w-20">Available</span>
            <span className="text-xs font-semibold text-slate uppercase tracking-wide text-center dark:text-dark-muted w-20">Out</span>
            <span className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted w-28">Actions</span>
          </div>

          {items.map((item, idx) => (
            <CatalogueRow
              key={item.id}
              item={item}
              isLast={idx === items.length - 1}
              isExpanded={expanded.has(item.id)}
              copies={copies[item.id] ?? null}
              loadingCopies={loadingCopies.has(item.id)}
              onToggle={() => toggleExpand(item)}
              onEdit={() => setEditBook(item)}
              onAddCopies={() => { setAddCopiesFor(item); setExpanded(prev => new Set(prev).add(item.id)); }}
              onQRSheet={() => downloadQRSheet(item.id)}
              onRefreshCopies={() => refreshCopies(item.id)}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {nextCursor && !loading && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => fetchCatalogue(false, nextCursor)}
            disabled={loadingMore}
            className={secondaryButtonClass}
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Load more
          </button>
        </div>
      )}

      {/* ── Summary ─────────────────────────────────────────────────── */}
      {!loading && items.length > 0 && (
        <p className="mt-3 text-xs text-slate text-center dark:text-dark-muted">
          {items.length} title{items.length !== 1 ? "s" : ""} ·{" "}
          {items.reduce((s, i) => s + i.totalCopies, 0)} total copies ·{" "}
          {items.reduce((s, i) => s + i.availableCopies, 0)} available
        </p>
      )}

      {/* ── Modals ──────────────────────────────────────────────────── */}
      {showAddBook && (
        <BookFormModal
          title="Add Book"
          onClose={() => setShowAddBook(false)}
          onSaved={() => { setShowAddBook(false); fetchCatalogue(true); }}
        />
      )}

      {editBook && (
        <BookFormModal
          title="Edit Book"
          initial={editBook}
          onClose={() => setEditBook(null)}
          onSaved={() => { setEditBook(null); fetchCatalogue(true); }}
        />
      )}

      {addCopiesFor && (
        <AddCopiesModal
          catalogue={addCopiesFor}
          onClose={() => setAddCopiesFor(null)}
          onSaved={async () => {
            await refreshCopies(addCopiesFor.id);
            setAddCopiesFor(null);
            fetchCatalogue(true);
          }}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSaved={() => { setShowImport(false); fetchCatalogue(true); }}
        />
      )}
    </div>
  );
}

// ── CatalogueRow ──────────────────────────────────────────────────────────

function CatalogueRow({
  item, isLast, isExpanded, copies, loadingCopies,
  onToggle, onEdit, onAddCopies, onQRSheet, onRefreshCopies,
}: {
  item: CatalogueItem; isLast: boolean;
  isExpanded: boolean; copies: CopyRow[] | null; loadingCopies: boolean;
  onToggle: () => void; onEdit: () => void;
  onAddCopies: () => void; onQRSheet: () => void;
  onRefreshCopies: () => void;
}) {
  const [copyAction, setCopyAction] = useState<string | null>(null); // copyId currently acting on

  const handleArchiveCopy = async (copyId: string) => {
    if (!confirm("Withdraw this copy from circulation? This cannot be undone.")) return;
    setCopyAction(copyId);
    await fetch(`/api/library/copies/${copyId}/archive`, { method: "POST" });
    setCopyAction(null);
    onRefreshCopies();
  };

  const handleReissueQR = async (copyId: string) => {
    setCopyAction(copyId);
    const res  = await fetch(`/api/library/copies/${copyId}/reissue-qr`, { method: "POST" });
    const json = await res.json();
    setCopyAction(null);
    if (res.ok) {
      alert(`New QR token issued for ${json.bookNumber ?? json.accessionNumber}.\nPrint a new sticker from the QR Sheet button.`);
      onRefreshCopies();
    }
  };

  const activeCopies   = (copies ?? []).filter(c => !c.archivedAt);
  const archivedCopies = (copies ?? []).filter(c => c.archivedAt);

  return (
    <div className={`${!isLast ? "border-b border-line dark:border-dark-border" : ""}`}>
      {/* Main row */}
      <div
        className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3.5 items-center hover:bg-slate-50/50 dark:hover:bg-dark-border/20 transition-colors cursor-pointer select-none"
        onClick={onToggle}
      >
        {/* Book info */}
        <div className="flex items-center gap-3 min-w-0">
          <span className={`shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}>
            <ChevronRight className="h-4 w-4 text-slate/50" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink dark:text-dark-text truncate">{item.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {item.author && <span className="text-xs text-slate dark:text-dark-muted">{item.author}</span>}
              {item.edition && <span className="text-xs text-slate/60 dark:text-dark-muted/60">{item.edition}</span>}
              {item.subject && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-teal/10 text-teal">{item.subject}</span>
              )}
              {item.level && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">{item.level}</span>
              )}
              {item.shelf && (
                <span className="text-[10px] text-slate/60 dark:text-dark-muted/60">Shelf {item.shelf}</span>
              )}
            </div>
          </div>
        </div>

        {/* Counts */}
        <span className="hidden sm:block text-sm font-semibold text-ink text-center w-20 dark:text-dark-text">{item.totalCopies}</span>
        <span className="hidden sm:block text-sm font-semibold text-success text-center w-20">{item.availableCopies}</span>
        <span className={`hidden sm:block text-sm font-semibold text-center w-20 ${item.checkedOut > 0 ? "text-info" : "text-slate/40 dark:text-dark-muted/40"}`}>{item.checkedOut}</span>

        {/* Action buttons */}
        <div className="hidden sm:flex items-center gap-1.5 w-28" onClick={e => e.stopPropagation()}>
          <button title="Edit book" onClick={onEdit}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-slate hover:text-ink hover:bg-line/60 transition-colors dark:text-dark-muted dark:hover:text-dark-text dark:hover:bg-dark-border">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button title="Add copies" onClick={onAddCopies}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-slate hover:text-teal hover:bg-teal/10 transition-colors dark:text-dark-muted dark:hover:text-teal">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button title="Print QR stickers" onClick={onQRSheet}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-slate hover:text-teal hover:bg-teal/10 transition-colors dark:text-dark-muted dark:hover:text-teal">
            <QrCode className="h-3.5 w-3.5" />
          </button>
          <Link title="Book intelligence" href={`/staff/library/inventory/${item.id}`}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-slate hover:text-teal hover:bg-teal/10 transition-colors dark:text-dark-muted dark:hover:text-teal">
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Mobile: copy count */}
        <div className="flex sm:hidden items-center gap-2" onClick={e => e.stopPropagation()}>
          <span className="text-xs font-semibold text-slate dark:text-dark-muted">{item.totalCopies} cop{item.totalCopies !== 1 ? "ies" : "y"}</span>
        </div>
      </div>

      {/* Expanded copies panel */}
      {isExpanded && (
        <div className="border-t border-line/60 bg-slate-50/40 dark:bg-dark-border/10 dark:border-dark-border/60 px-4 py-3 space-y-3">
          {/* Mobile actions */}
          <div className="flex sm:hidden items-center gap-2 flex-wrap">
            <button onClick={onEdit} className={secondaryButtonClass + " text-xs py-1.5 px-3"}><Edit2 className="h-3.5 w-3.5" /> Edit</button>
            <button onClick={onAddCopies} className={secondaryButtonClass + " text-xs py-1.5 px-3"}><Plus className="h-3.5 w-3.5" /> Add Copies</button>
            <button onClick={onQRSheet} className={secondaryButtonClass + " text-xs py-1.5 px-3"}><QrCode className="h-3.5 w-3.5" /> QR Sheet</button>
          </div>

          {loadingCopies ? (
            <div className="flex items-center gap-2 text-slate text-xs py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading copies…
            </div>
          ) : activeCopies.length === 0 && archivedCopies.length === 0 ? (
            <div className="flex items-center justify-between text-xs text-slate dark:text-dark-muted py-1">
              <span>No physical copies registered yet.</span>
              <button onClick={onAddCopies} className="text-teal font-medium hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add copies
              </button>
            </div>
          ) : (
            <>
              {/* Active copies grid */}
              {activeCopies.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {activeCopies.map(copy => (
                    <CopyCard
                      key={copy.id}
                      copy={copy}
                      acting={copyAction === copy.id}
                      onArchive={() => handleArchiveCopy(copy.id)}
                      onReissueQR={() => handleReissueQR(copy.id)}
                    />
                  ))}
                </div>
              )}

              {/* Archived copies (collapsed by default) */}
              {archivedCopies.length > 0 && (
                <p className="text-[10px] text-slate/60 dark:text-dark-muted/60 pt-1">
                  {archivedCopies.length} withdrawn cop{archivedCopies.length !== 1 ? "ies" : "y"} not shown
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── CopyCard ──────────────────────────────────────────────────────────────

function CopyCard({
  copy, acting, onArchive, onReissueQR,
}: {
  copy:        CopyRow;
  acting:      boolean;
  onArchive:   () => void;
  onReissueQR: () => void;
}) {
  const canArchive = copy.status === "AVAILABLE" || copy.status === "UNDER_REPAIR";
  const variant    = STATUS_BADGE[copy.status] ?? "default";

  return (
    <div className="group flex items-start justify-between rounded-lg border border-line bg-white px-3 py-2 dark:bg-dark-surface dark:border-dark-border">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-ink dark:text-dark-text font-mono leading-tight">{copy.bookNumber ?? copy.accessionNumber}</p>
        {copy.bookNumber && (
          <p className="text-[10px] text-slate/60 dark:text-dark-muted/60 font-mono">{copy.accessionNumber}</p>
        )}
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <Badge variant={variant}>{copy.status.replace(/_/g, " ")}</Badge>
          <span className="text-[9px] text-slate/60 dark:text-dark-muted/60">{copy.condition}</span>
        </div>
      </div>

      {/* Per-copy actions — show on hover */}
      <div className="flex flex-col items-end gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {acting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate" />
        ) : (
          <>
            <button
              title="Reissue QR sticker"
              onClick={onReissueQR}
              className="h-5 w-5 flex items-center justify-center rounded text-slate/60 hover:text-teal hover:bg-teal/10 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
            {canArchive && (
              <button
                title="Withdraw copy"
                onClick={onArchive}
                className="h-5 w-5 flex items-center justify-center rounded text-slate/60 hover:text-danger hover:bg-danger/10 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── BookFormModal ─────────────────────────────────────────────────────────

interface BookFormFields {
  title:      string;
  author:     string;
  edition:    string;
  level:      string;
  subject:    string;
  category:   string;
  shelf:      string;
  publisher:  string;
  isbn:       string;
  language:   string;
  publishYear:string;
}

function BookFormModal({
  title: modalTitle,
  initial,
  onClose,
  onSaved,
}: {
  title:     string;
  initial?:  CatalogueItem | null;
  onClose:   () => void;
  onSaved:   () => void;
}) {
  const [form, setForm] = useState<BookFormFields>({
    title:       initial?.title       ?? "",
    author:      initial?.author      ?? "",
    edition:     initial?.edition     ?? "",
    level:       initial?.level       ?? "",
    subject:     initial?.subject     ?? "",
    category:    initial?.category    ?? "TEXTBOOK",
    shelf:       initial?.shelf       ?? "",
    publisher:   "",
    isbn:        "",
    language:    initial?.language    ?? "English",
    publishYear: "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = (k: keyof BookFormFields) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError(null);

    const payload = {
      title:       form.title.trim(),
      author:      form.author      || null,
      edition:     form.edition     || null,
      level:       form.level       || null,
      subject:     form.subject     || null,
      category:    form.category    || "TEXTBOOK",
      shelf:       form.shelf       || null,
      publisher:   form.publisher   || null,
      isbn:        form.isbn        || null,
      language:    form.language    || "English",
      publishYear: form.publishYear ? parseInt(form.publishYear) : null,
    };

    const url    = initial ? `/api/library/catalogue/${initial.id}` : "/api/library/catalogue";
    const method = initial ? "PATCH" : "POST";

    const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Save failed."); return; }
    onSaved();
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-dark-surface rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-ink dark:text-dark-text flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-teal" /> {modalTitle}
          </h2>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-slate hover:bg-line/60 transition-colors dark:text-dark-muted dark:hover:bg-dark-border">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title — required */}
          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5 dark:text-dark-muted">
              Title <span className="text-danger">*</span>
            </label>
            <input className={inputClass} value={form.title} onChange={set("title")} placeholder="e.g. Secondary Mathematics Book 3" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate mb-1.5 dark:text-dark-muted">Author</label>
              <input className={inputClass} value={form.author} onChange={set("author")} placeholder="Author name" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate mb-1.5 dark:text-dark-muted">Edition</label>
              <input className={inputClass} value={form.edition} onChange={set("edition")} placeholder="e.g. 3rd Edition" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate mb-1.5 dark:text-dark-muted">Level / Form</label>
              <input className={inputClass} value={form.level} onChange={set("level")} placeholder="e.g. Form 3, Grade 7" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate mb-1.5 dark:text-dark-muted">Subject</label>
              <input className={inputClass} value={form.subject} onChange={set("subject")} placeholder="e.g. Mathematics" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate mb-1.5 dark:text-dark-muted">Category</label>
              <select className={inputClass} value={form.category} onChange={set("category")}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate mb-1.5 dark:text-dark-muted">Shelf</label>
              <input className={inputClass} value={form.shelf} onChange={set("shelf")} placeholder="e.g. A, Science" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate mb-1.5 dark:text-dark-muted">Publisher</label>
              <input className={inputClass} value={form.publisher} onChange={set("publisher")} placeholder="Publisher name" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate mb-1.5 dark:text-dark-muted">ISBN</label>
              <input className={inputClass} value={form.isbn} onChange={set("isbn")} placeholder="ISBN" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5 dark:text-dark-muted">Publish Year</label>
            <input className={inputClass} value={form.publishYear} onChange={set("publishYear")} placeholder="e.g. 2020" type="number" min="1900" max="2099" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className={primaryButtonClass + " flex-1"}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : initial ? "Save Changes" : "Add Book"}
            </button>
            <button type="button" onClick={onClose} className={secondaryButtonClass}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

// ── AddCopiesModal ────────────────────────────────────────────────────────

function AddCopiesModal({
  catalogue,
  onClose,
  onSaved,
}: {
  catalogue: CatalogueItem;
  onClose:   () => void;
  onSaved:   () => void;
}) {
  const [count,  setCount]  = useState("1");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const n = parseInt(count, 10);
    if (!n || n < 1 || n > 500) { setError("Enter a number between 1 and 500."); return; }
    setSaving(true); setError(null);

    const res  = await fetch("/api/library/copies", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogueId: catalogue.id, count: n }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to add copies."); return; }
    onSaved();
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="w-full max-w-sm bg-white dark:bg-dark-surface rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-ink dark:text-dark-text flex items-center gap-2">
            <Package className="h-5 w-5 text-teal" /> Add Physical Copies
          </h2>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-slate hover:bg-line/60 dark:text-dark-muted dark:hover:bg-dark-border transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-slate mb-4 dark:text-dark-muted">
          Adding copies of <strong className="text-ink dark:text-dark-text">{catalogue.title}</strong>
        </p>
        <p className="text-xs text-slate/70 mb-4 dark:text-dark-muted/70">
          Each copy gets a unique <strong>BK-NNNNN</strong> sticker number and a signed QR token automatically.
        </p>

        {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate mb-1.5 dark:text-dark-muted">
              Number of Copies <span className="text-danger">*</span>
            </label>
            <input
              className={inputClass}
              type="number" min="1" max="500"
              value={count}
              onChange={e => setCount(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className={primaryButtonClass + " flex-1"}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? "Creating…" : `Add ${count || 0} Cop${parseInt(count || "1") === 1 ? "y" : "ies"}`}
            </button>
            <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

// ── ImportModal ───────────────────────────────────────────────────────────

interface ImportPreviewRow {
  index:  number;
  data:   { title: string; author: string; edition: string; level: string; subject: string; copies: number } | null;
  error?: string;
}

function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName]   = useState("");
  const [preview,  setPreview]    = useState<ImportPreviewRow[]>([]);
  const [parsing,  setParsing]    = useState(false);
  const [importing,setImporting]  = useState(false);
  const [result,   setResult]     = useState<{ imported: number; copiesAdded: number; skipped: number; errors: {row:number;error:string}[] } | null>(null);
  const [error,    setError]      = useState<string | null>(null);

  const validRows   = preview.filter(r => r.data && !r.error);
  const totalCopies = validRows.reduce((s, r) => s + (r.data?.copies ?? 0), 0);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    setPreview([]);
    setResult(null);
    setError(null);

    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const rows = parseImportCSV(text);
      const parsed: ImportPreviewRow[] = rows.map((raw, i) => {
        const title  = (raw["title"] || "").trim();
        const copies = raw["copies"] || raw["num_copies"] || "";
        if (!title) return { index: i + 1, data: null, error: "Missing title" };
        const n = parseInt(copies, 10);
        if (!copies || isNaN(n) || n < 1) return { index: i + 1, data: null, error: !copies ? "Missing copies" : `Invalid copies value: "${copies}"` };
        if (n > 500) return { index: i + 1, data: null, error: "copies cannot exceed 500" };
        return { index: i + 1, data: { title, author: (raw["author"]||"").trim(), edition:(raw["edition"]||"").trim(), level:(raw["level"]||"").trim(), subject:(raw["subject"]||"").trim(), copies: n } };
      });
      setPreview(parsed);
      setParsing(false);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true); setError(null);
    const res  = await fetch("/api/library/catalogue/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: validRows.map(r => r.data) }),
    });
    const json = await res.json();
    setImporting(false);
    if (!res.ok) { setError(json.error ?? "Import failed."); return; }
    setResult(json);
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-dark-surface rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-ink dark:text-dark-text flex items-center gap-2">
            <Upload className="h-5 w-5 text-teal" /> Bulk Import
          </h2>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-slate hover:bg-line/60 transition-colors dark:text-dark-muted dark:hover:bg-dark-border">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Template info */}
        <div className="rounded-xl border border-line bg-slate-50/60 dark:bg-dark-border/20 dark:border-dark-border p-4 mb-5 text-xs text-slate dark:text-dark-muted space-y-1">
          <p className="font-semibold text-ink dark:text-dark-text">Required CSV columns:</p>
          <p><code className="text-teal font-bold">title</code> (required) · <code className="text-teal font-bold">copies</code> (required, integer)</p>
          <p className="text-slate/70 dark:text-dark-muted/70">Optional: author · edition · level · subject</p>
          <p className="text-slate/70 dark:text-dark-muted/70">First row must be the header row. Each row creates or reuses a Book and registers that many physical copies.</p>
        </div>

        {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

        {/* File picker */}
        {!result && (
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-teal rounded-xl bg-teal/5 hover:bg-teal/10 transition-colors cursor-pointer p-8 flex flex-col items-center gap-3 mb-5"
          >
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
            {parsing ? (
              <Loader2 className="h-8 w-8 text-teal animate-spin" />
            ) : (
              <FileText className="h-8 w-8 text-teal" />
            )}
            <p className="text-sm font-semibold text-teal">{fileName ? fileName : "Click to choose a CSV file"}</p>
            {!fileName && <p className="text-xs text-slate dark:text-dark-muted">Supported: .csv</p>}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-xl border border-success/30 bg-success-bg/40 p-4 mb-5 space-y-2">
            <p className="text-sm font-semibold text-success flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Import complete
            </p>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="rounded-lg border border-line bg-white p-2 dark:bg-dark-surface dark:border-dark-border">
                <p className="text-base font-bold text-ink dark:text-dark-text">{result.imported}</p>
                <p className="text-slate dark:text-dark-muted">Books</p>
              </div>
              <div className="rounded-lg border border-teal/30 bg-teal/5 p-2">
                <p className="text-base font-bold text-teal">{result.copiesAdded}</p>
                <p className="text-slate dark:text-dark-muted">Copies added</p>
              </div>
              <div className={`rounded-lg border p-2 ${result.skipped > 0 ? "border-danger/30 bg-danger-bg/40" : "border-line bg-white dark:bg-dark-surface dark:border-dark-border"}`}>
                <p className={`text-base font-bold ${result.skipped > 0 ? "text-danger" : "text-slate dark:text-dark-muted"}`}>{result.skipped}</p>
                <p className="text-slate dark:text-dark-muted">Skipped</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {result.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-danger flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> Row {e.row}: {e.error}
                  </p>
                ))}
              </div>
            )}
            <button onClick={onSaved} className={primaryButtonClass + " mt-3 w-full"}>Done</button>
          </div>
        )}

        {/* Preview */}
        {preview.length > 0 && !result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-success/10 text-success">{validRows.length} valid</span>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-teal/10 text-teal">{totalCopies} copies</span>
              {preview.filter(r => r.error || !r.data).length > 0 && (
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-danger/10 text-danger">
                  {preview.filter(r => r.error || !r.data).length} errors
                </span>
              )}
            </div>

            <div className="rounded-xl border border-line overflow-hidden dark:border-dark-border">
              {preview.slice(0, 20).map((row, idx) => (
                <div key={idx} className={`flex items-start gap-3 px-4 py-2.5 text-xs ${idx < preview.length - 1 ? "border-b border-line dark:border-dark-border" : ""} ${row.error || !row.data ? "bg-danger-bg/30" : ""}`}>
                  {row.error || !row.data
                    ? <AlertCircle className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
                    : <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${row.error || !row.data ? "text-danger" : "text-ink dark:text-dark-text"}`}>
                      Row {row.index}: {row.data?.title ?? "(empty)"}
                    </p>
                    {row.data && (
                      <p className="text-slate/70 dark:text-dark-muted/70">
                        {[row.data.author && `by ${row.data.author}`, row.data.level, `${row.data.copies} cop${row.data.copies !== 1 ? "ies" : "y"}`].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {row.error && <p className="text-danger">{row.error}</p>}
                  </div>
                </div>
              ))}
              {preview.length > 20 && (
                <div className="px-4 py-2 text-xs text-slate text-center dark:text-dark-muted">
                  + {preview.length - 20} more rows
                </div>
              )}
            </div>

            {validRows.length > 0 && (
              <button
                onClick={handleImport}
                disabled={importing}
                className={primaryButtonClass + " w-full"}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {importing ? "Importing…" : `Import ${validRows.length} row${validRows.length !== 1 ? "s" : ""} → ${totalCopies} copies`}
              </button>
            )}
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}

// ── ModalBackdrop ─────────────────────────────────────────────────────────

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} className="w-full flex justify-center">
        {children}
      </div>
    </div>
  );
}
