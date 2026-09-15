"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle, Loader2, RotateCcw, DollarSign,
} from "lucide-react";
import {
  Badge, ErrorBanner, FormField,
  inputClass, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";

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
      className={`${sz} rounded-full object-cover border border-border shrink-0`}
      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

// ── CardDetailPanel ────────────────────────────────────────────────────────

export default function CardDetailPanel({ studentId, onClose }: { studentId: string; onClose: () => void }) {
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
          <div className="flex items-start gap-4 p-4 rounded-xl border border-border bg-background/20">
            <StudentPhoto fileId={photoId} name={student.fullName} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground text-base">{student.fullName}</p>
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
                    <li key={b.id} className={`rounded-xl border p-4 text-sm ${overdue ? "border-danger/30 bg-danger-bg/30" : "border-border bg-card"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{title(b)}</p>
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
            <div className="rounded-xl border border-border p-4 space-y-3 animate-slide-down">
              <p className="text-sm font-semibold text-foreground">Record Fine Payment</p>
              <p className="text-sm text-slate">Outstanding: <strong className="text-foreground">KES {card.fineBalance.toFixed(2)}</strong></p>
              {payErr && <ErrorBanner message={payErr} />}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-foreground mb-1.5">Amount paid (KES)</label>
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
              <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                {history.map(b => (
                  <li key={b.id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{title(b)}</p>
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
