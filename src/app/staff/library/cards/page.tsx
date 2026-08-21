"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  CreditCard, AlertTriangle, Loader2,
  RotateCcw, DollarSign, X, Search,
} from "lucide-react";
import {
  PageHeader, Badge, EmptyState, ErrorBanner, FormField,
  inputClass, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";

import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import SlideOver from "@/components/workspace/SlideOver";

// ── Types ──────────────────────────────────────────────────────────────────

interface StudentCard {
  id: string; cardNumber: string | null; status: string;
  suspensionReason: string | null; expiresAt: string | null;
  fineBalance: number; totalFinesPaid: number;
  currentBorrowCount: number; totalBorrowCount: number;
  createdAt: string; updatedAt: string;
  student: {
    id: string; fullName: string; admissionNumber: string;
    dateOfBirth: string | null; archivedAt: string | null; archiveType: string | null;
    schoolClass: { id: string; name: string; form: number; stream: string | null };
    files: { id: string; mimeType: string }[];
  };
}

interface BorrowRecord {
  id: string; borrowedAt: string; dueAt: string; returnedAt: string | null;
  fineStoppedAt: string | null; fineAmount: number; renewalCount: number; notes: string | null;
  copy?: { accessionNumber: string; catalogue?: { title: string; author: string | null; bookNumber: string | null } };
  book?: { title: string; author: string | null };
}

interface CardDetail {
  student: StudentCard["student"];
  card: StudentCard & { borrows: BorrowRecord[] };
  settings: { maxBooksPerStudent: number; maxBorrowDays: number; finePerDay: number; maxRenewals: number };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(dueAt: string, returnedAt: string | null, fineStoppedAt: string | null) {
  if (returnedAt || fineStoppedAt) return false;
  return new Date(dueAt) < new Date();
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function cardStatusBadge(status: string) {
  const map: Record<string, "success"|"warn"|"default"|"info"> = {
    ACTIVE: "success", SUSPENDED: "warn", ALUMNI: "default", TRANSFERRED: "info",
  };
  return <Badge variant={map[status] ?? "default"}>{status}</Badge>;
}

// ── StudentPhoto ───────────────────────────────────────────────────────────

function StudentPhoto({ fileId, name, size = "md" }: { fileId?: string; name: string; size?: "sm"|"md"|"lg" }) {
  const sz = size === "sm" ? "h-9 w-9 text-sm" : size === "lg" ? "h-16 w-16 text-xl" : "h-12 w-12 text-base";
  const initials = name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
  if (!fileId) {
    return (
      <div className={`${sz} rounded-full bg-teal/10 border border-teal/20 flex items-center justify-center font-semibold text-teal shrink-0`}>
        {initials}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/students/files/${fileId}`} alt={name}
      className={`${sz} rounded-full object-cover border border-line shrink-0`}
      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

// ── CardDetailPanel ────────────────────────────────────────────────────────

function CardDetailPanel({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const [data, setData]         = useState<CardDetail | null>(null);
  const [loadErr, setLoadErr]   = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [payBorrowId, setPayBorrowId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payErr, setPayErr]     = useState<string | null>(null);
  const [acting, setActing]     = useState(false);

  const load = useCallback(async () => {
    setLoadErr(null);
    const res = await fetch(`/api/library/cards/${studentId}`);
    const json = await res.json();
    if (!res.ok) { setLoadErr(json.error ?? "Failed to load card."); return; }
    setData(json);
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  async function updateCard(body: object) {
    setActing(true); setActionErr(null);
    const res = await fetch(`/api/library/cards/${studentId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    setActing(false);
    if (!res.ok) { setActionErr(json.error ?? "Action failed."); return; }
    load();
  }

  async function handleBorrowAction(borrowId: string, action: string) {
    setActing(true); setActionErr(null);
    const res = await fetch(`/api/library/card/${studentId}/borrow/${borrowId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    const json = await res.json();
    setActing(false);
    if (!res.ok) { setActionErr(json.error ?? "Action failed."); return; }
    load();
  }

  async function handlePayFine() {
    if (!payBorrowId || !payAmount) return;
    setPayErr(null);
    const res = await fetch(`/api/library/card/${studentId}/borrow/${payBorrowId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pay_fine", amount: parseFloat(payAmount) }),
    });
    const json = await res.json();
    if (!res.ok) { setPayErr(json.error ?? "Payment failed."); return; }
    setPayBorrowId(null); setPayAmount(""); load();
  }

  const card    = data?.card;
  const student = data?.student;
  const active  = card?.borrows.filter(b => !b.returnedAt) ?? [];
  const history = card?.borrows.filter(b => !!b.returnedAt) ?? [];
  const photoId = student?.files?.[0]?.id;
  const title   = (b: BorrowRecord) =>
    b.copy?.catalogue?.title ?? b.book?.title ?? "Unknown";

  return (
    <SlideOver open onClose={onClose} size="xl"
      title={student ? `${student.fullName}'s Library Card` : "Library Card"}
      description={student ? `${student.admissionNumber} · ${student.schoolClass.name}` : undefined}
    >
      {!data && !loadErr && (
        <div className="flex items-center justify-center py-16 gap-2 text-slate text-sm">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      )}
      {loadErr && <ErrorBanner message={loadErr} />}

      {data && card && student && (
        <div className="space-y-6">
          {/* Card header with photo */}
          <div className="flex items-start gap-4 p-4 rounded-xl border border-line bg-paper dark:bg-dark-border/20">
            <StudentPhoto fileId={photoId} name={student.fullName} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink text-base dark:text-dark-text">{student.fullName}</p>
                  <p className="text-sm text-slate font-mono">{student.admissionNumber}</p>
                  <p className="text-sm text-slate">{student.schoolClass.name}</p>
                </div>
                <div className="shrink-0">{cardStatusBadge(card.status)}</div>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate">
                {card.cardNumber && <span className="font-mono bg-teal/10 text-teal px-2 py-0.5 rounded-md">{card.cardNumber}</span>}
                {card.expiresAt && <span>Expires {fmt(card.expiresAt)}</span>}
                <span>{card.currentBorrowCount} borrowed · {card.totalBorrowCount} total</span>
              </div>
            </div>
          </div>

          {/* Suspension reason */}
          {card.status === "SUSPENDED" && card.suspensionReason && (
            <div className="rounded-lg bg-warn-bg border border-warn/20 text-warn text-sm px-4 py-3">
              Suspended: {card.suspensionReason}
            </div>
          )}

          {/* Fine balance */}
          {card.fineBalance > 0 && (
            <div className="flex items-center justify-between gap-4 rounded-xl bg-danger-bg border border-danger/20 px-4 py-3">
              <span className="flex items-center gap-2 text-danger text-sm font-medium">
                <DollarSign className="h-4 w-4" />
                Outstanding fine: <strong>KES {card.fineBalance.toFixed(2)}</strong>
              </span>
              <span className="text-xs text-danger/70">Cannot borrow until cleared</span>
            </div>
          )}

          {actionErr && <ErrorBanner message={actionErr} onDismiss={() => setActionErr(null)} />}

          {/* Card actions */}
          <div className="flex flex-wrap gap-2">
            {card.status === "ACTIVE" && (
              <button className={secondaryButtonClass} onClick={() => setSuspendOpen(v => !v)}>
                <AlertTriangle className="h-4 w-4" /> Suspend Card
              </button>
            )}
            {card.status === "SUSPENDED" && (
              <button className={primaryButtonClass} disabled={acting} onClick={() => updateCard({ status: "ACTIVE" })}>
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Reinstate Card
              </button>
            )}
            <button className={secondaryButtonClass} disabled={acting} onClick={() => updateCard({ renew: true })}>
              <RotateCcw className="h-4 w-4" /> Renew Card
            </button>
          </div>

          {suspendOpen && (
            <div className="rounded-xl border border-warn/30 bg-warn-bg/30 p-4 space-y-3 animate-slide-down">
              <p className="text-sm font-semibold text-warn">Suspend Library Card</p>
              <FormField label="Reason for suspension">
                <input className={inputClass} value={suspendReason} onChange={e => setSuspendReason(e.target.value)} autoFocus />
              </FormField>
              <div className="flex gap-2">
                <button className="inline-flex items-center gap-1.5 rounded-lg bg-warn text-white text-sm font-medium px-4 py-2.5 hover:bg-amber-600 transition-colors"
                  disabled={acting} onClick={() => { updateCard({ status: "SUSPENDED", suspensionReason: suspendReason }); setSuspendOpen(false); }}>
                  Confirm Suspend
                </button>
                <button className={secondaryButtonClass} onClick={() => setSuspendOpen(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Active borrows */}
          <SlideOver.Section title={`Currently Borrowed (${active.length})`}>
            {active.length === 0 ? (
              <p className="text-sm text-slate py-2">No books currently borrowed.</p>
            ) : (
              <ul className="space-y-2.5">
                {active.map(b => {
                  const overdue = isOverdue(b.dueAt, b.returnedAt, b.fineStoppedAt);
                  const stopped = !!b.fineStoppedAt;
                  return (
                    <li key={b.id} className={`rounded-xl border p-4 text-sm ${overdue ? "border-danger/30 bg-danger-bg/30" : "border-line bg-white dark:bg-dark-surface dark:border-dark-border"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink truncate dark:text-dark-text">{title(b)}</p>
                          {b.copy?.accessionNumber && <p className="text-xs font-mono text-slate">{b.copy.accessionNumber}</p>}
                          <p className="text-xs text-slate mt-1">
                            Borrowed {fmt(b.borrowedAt)} · Due {fmt(b.dueAt)}
                            {b.renewalCount > 0 && ` · Renewed ${b.renewalCount}×`}
                            {stopped && <span className="ml-2 text-warn font-medium">Fine frozen {fmt(b.fineStoppedAt!)}</span>}
                            {overdue && !stopped && <span className="ml-2 text-danger font-semibold">{daysSince(b.dueAt)}d overdue</span>}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0 items-end">
                          <button onClick={() => handleBorrowAction(b.id, "return")} disabled={acting}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-teal border border-teal/30 bg-teal-50 hover:bg-teal-50/80 rounded-lg px-2.5 py-1.5 transition-colors">
                            <RotateCcw className="h-3 w-3" />Return
                          </button>
                          {!stopped && overdue && (
                            <button onClick={() => handleBorrowAction(b.id, "stop_fine")} className="text-xs text-warn hover:underline font-medium">
                              Freeze fine
                            </button>
                          )}
                          {card.fineBalance > 0 && (
                            <button onClick={() => { setPayBorrowId(b.id); setPayAmount(String(card.fineBalance)); }}
                              className="text-xs text-teal hover:underline font-medium">
                              Record payment
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SlideOver.Section>

          {/* Pay fine panel */}
          {payBorrowId && (
            <div className="rounded-xl border border-line p-4 space-y-3 animate-slide-down">
              <p className="text-sm font-semibold text-ink">Record Fine Payment</p>
              <p className="text-sm text-slate">Outstanding: <strong className="text-ink">KES {card.fineBalance.toFixed(2)}</strong></p>
              {payErr && <ErrorBanner message={payErr} />}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-ink mb-1.5">Amount paid (KES)</label>
                  <input type="number" min="0.01" step="0.01" className={inputClass} value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus />
                </div>
                <button className={primaryButtonClass} onClick={handlePayFine}><DollarSign className="h-4 w-4" />Confirm</button>
                <button className={secondaryButtonClass} onClick={() => { setPayBorrowId(null); setPayErr(null); }}>Cancel</button>
              </div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <SlideOver.Section title={`Borrow History (${history.length})`}>
              <ul className="divide-y divide-line rounded-xl border border-line overflow-hidden">
                {history.map(b => (
                  <li key={b.id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate dark:text-dark-text">{title(b)}</p>
                      <p className="text-xs text-slate mt-0.5">{fmt(b.borrowedAt)} → {b.returnedAt ? fmt(b.returnedAt) : "—"}</p>
                    </div>
                    {b.fineAmount > 0 && <span className="text-xs text-danger font-medium shrink-0">Fine KES {b.fineAmount.toFixed(2)}</span>}
                  </li>
                ))}
              </ul>
            </SlideOver.Section>
          )}
        </div>
      )}
    </SlideOver>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

// Minimal shape for the student-search dropdown
interface StudentHit {
  id: string; fullName: string; admissionNumber: string;
  schoolClass: { name: string };
  files?: { id: string }[];
}

export default function StudentCardsPage() {
  const [cards, setCards]         = useState<StudentCard[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFine, setFilterFine]     = useState(false);
  const [openCard, setOpenCard]   = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provMsg, setProvMsg]     = useState<string | null>(null);

  // ── Student search for issuing cards ──────────────────────────────────
  const [studentQuery, setStudentQuery] = useState("");
  const [studentHits, setStudentHits]   = useState<StudentHit[]>([]);
  const [showDrop, setShowDrop]         = useState(false);
  const [searching, setSearching]       = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef     = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          !inputRef.current?.contains(e.target as Node)) {
        setShowDrop(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function onStudentQueryChange(value: string) {
    setStudentQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setStudentHits([]); setShowDrop(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/library/students/search?q=${encodeURIComponent(value.trim())}`);
        const data = await res.json() as StudentHit[];
        setStudentHits(Array.isArray(data) ? data : []);
        setShowDrop(true);
      } catch { /* silent */ }
      setSearching(false);
    }, 300);
  }

  async function openStudentCard(studentId: string) {
    // GET auto-provisions the card if missing, then opens the panel
    setShowDrop(false);
    setStudentQuery("");
    setStudentHits([]);
    setOpenCard(studentId);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ take: "200" });
    if (filterStatus) sp.set("status", filterStatus);
    if (filterFine)   sp.set("hasFine", "true");
    const res = await fetch(`/api/library/cards?${sp}`);
    if (res.ok) { const d = await res.json(); setCards(d.items ?? []); }
    setLoading(false);
  }, [filterStatus, filterFine]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return cards;
    const q = search.toLowerCase();
    return cards.filter(c =>
      c.student.fullName.toLowerCase().includes(q) ||
      c.student.admissionNumber.toLowerCase().includes(q) ||
      (c.cardNumber?.toLowerCase().includes(q) ?? false)
    );
  }, [cards, search]);

  async function handleProvision() {
    setProvisioning(true); setProvMsg(null);
    const res = await fetch("/api/library/cards", { method: "POST" });
    const d = await res.json();
    setProvMsg(d.provisioned > 0
      ? `${d.provisioned} new card${d.provisioned === 1 ? "" : "s"} issued.`
      : "All eligible students already have cards.");
    setProvisioning(false); load();
  }

  return (
    <div>
      <PageHeader
        title="Student Library Cards"
        description="View and manage student digital library cards."
        action={
          <button onClick={handleProvision} disabled={provisioning} className={primaryButtonClass}>
            {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Issue Cards
          </button>
        }
      />

      {/* ── Find any student (with or without a card) ── */}
      <div className="mb-5 relative max-w-md">
        <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-1.5">
          Find student
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate/50 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            className="w-full rounded-lg border border-line bg-white pl-10 pr-10 py-2.5 text-sm
                       text-ink placeholder:text-slate/50 focus:outline-none focus:border-teal
                       focus:ring-2 focus:ring-teal/15 transition-colors
                       dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
            placeholder="Type name or admission number…"
            value={studentQuery}
            onChange={e => onStudentQueryChange(e.target.value)}
            onFocus={() => studentHits.length > 0 && setShowDrop(true)}
            autoComplete="off"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal animate-spin" />
          )}
          {studentQuery && !searching && (
            <button
              type="button"
              onClick={() => { setStudentQuery(""); setStudentHits([]); setShowDrop(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate/50 hover:text-slate transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Live dropdown — shows ALL matching students, not just those with cards */}
        {showDrop && studentHits.length > 0 && (
          <div
            ref={dropRef}
            className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-line
                       bg-white shadow-xl dark:bg-dark-surface dark:border-dark-border overflow-hidden"
          >
            {studentHits.map(s => {
              const photoId = s.files?.[0]?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); openStudentCard(s.id); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5
                             hover:bg-teal-50 dark:hover:bg-teal/10 transition-colors text-left"
                >
                  <StudentPhoto fileId={photoId} name={s.fullName} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{s.fullName}</p>
                    <p className="text-xs text-slate dark:text-dark-muted">{s.admissionNumber} · {s.schoolClass?.name}</p>
                  </div>
                  <span className="text-xs text-teal shrink-0">View card →</span>
                </button>
              );
            })}
          </div>
        )}

        {showDrop && studentHits.length === 0 && studentQuery.trim() && !searching && (
          <div
            ref={dropRef}
            className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-line
                       bg-white shadow-xl dark:bg-dark-surface dark:border-dark-border px-4 py-3"
          >
            <p className="text-sm text-slate">No students found for &ldquo;{studentQuery}&rdquo;</p>
          </div>
        )}
      </div>

      {provMsg && (
        <div className="mb-5 rounded-lg bg-success-bg border border-success/20 text-success text-sm px-4 py-3">
          {provMsg}
        </div>
      )}

      <WorkspaceToolbar>
        <WorkspaceToolbar.Search value={search} onChange={setSearch} placeholder="Search by name, admission number or card number…" />
        <WorkspaceToolbar.Filter label="Status" value={filterStatus}
          options={[
            { value: "", label: "All statuses" },
            { value: "ACTIVE", label: "Active" },
            { value: "SUSPENDED", label: "Suspended" },
            { value: "ALUMNI", label: "Alumni" },
            { value: "TRANSFERRED", label: "Transferred" },
          ]}
          onChange={setFilterStatus}
        />
        <WorkspaceToolbar.Actions>
          <label className="inline-flex items-center gap-2 text-sm text-slate cursor-pointer select-none">
            <input type="checkbox" checked={filterFine} onChange={e => setFilterFine(e.target.checked)} className="rounded border-line" />
            With fines only
          </label>
          <WorkspaceToolbar.ResultCount count={filtered.length} total={cards.length} label="card" />
        </WorkspaceToolbar.Actions>
      </WorkspaceToolbar>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-line/40 animate-pulse" />)}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <EmptyState
          message={search || filterStatus || filterFine ? "No cards match your filters." : "No library cards have been issued yet."}
          action={<button className={primaryButtonClass} onClick={handleProvision}><CreditCard className="h-4 w-4" />Issue cards for all students</button>}
        />
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => {
            const photoId = c.student.files?.[0]?.id;
            return (
              <button key={c.id} onClick={() => setOpenCard(c.student.id)}
                className={`text-left rounded-xl border p-4 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-teal/20 ${
                  c.fineBalance > 0 ? "border-danger/30 bg-danger-bg/20 dark:bg-danger/5"
                  : c.status === "SUSPENDED" ? "border-warn/30 bg-warn-bg/20"
                  : "border-line bg-white hover:border-teal/30 dark:bg-dark-surface dark:border-dark-border"}`}>
                <div className="flex items-start gap-3">
                  <StudentPhoto fileId={photoId} name={c.student.fullName} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="font-semibold text-sm text-ink truncate dark:text-dark-text">{c.student.fullName}</p>
                      {cardStatusBadge(c.status)}
                    </div>
                    <p className="text-xs text-slate font-mono">{c.student.admissionNumber}</p>
                    <p className="text-xs text-slate">{c.student.schoolClass.name}</p>
                    {c.cardNumber && <p className="text-xs font-mono text-teal mt-1">{c.cardNumber}</p>}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate">{c.currentBorrowCount} out · {c.totalBorrowCount} total</span>
                  {c.fineBalance > 0 && (
                    <span className="text-danger font-semibold">KES {c.fineBalance.toFixed(2)} fine</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {openCard && <CardDetailPanel studentId={openCard} onClose={() => { setOpenCard(null); load(); }} />}
    </div>
  );
}
