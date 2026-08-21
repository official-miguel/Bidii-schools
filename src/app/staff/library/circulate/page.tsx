"use client";

/**
 * Circulation Desk — 4-step workflow:
 *   Step 1: Identify student (search / QR / hardware scanner)
 *   Step 2: View persistent student panel with photo, card status,
 *            fines, active borrows, reservations, history
 *   Step 3: Scan / type book accession number
 *   Step 4: Policy evaluation → Confirm action / show block reasons
 *
 * The student panel stays visible throughout steps 2–4 so librarians can
 * see the student's photo, ID and card status at all times.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search, User, BookOpen, RotateCcw, CheckCircle2, AlertCircle,
  AlertTriangle, Loader2, X, Camera, Usb, Keyboard, DollarSign,
  Shield, ChevronDown, ChevronUp, CreditCard, RefreshCw,
} from "lucide-react";
import {
  Badge, ErrorBanner,
  inputClass, primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";


// ── Types ──────────────────────────────────────────────────────────────────

interface Settings { identificationMethod: "MANUAL"|"QR_CAMERA"|"QR_HARDWARE"; }

interface StudentHit { id: string; fullName: string; admissionNumber: string; schoolClass: { name: string; form: number }; libraryCard: { id: string; fineBalance: number } | null; }

interface BorrowRow {
  id: string; borrowedAt: string; dueAt: string; returnedAt: string | null;
  renewalCount: number; fineAmount: number;
  copy?: { accessionNumber: string; catalogue?: { title: string; author: string | null } } | null;
  book?: { title: string; author: string | null } | null;
}

interface CardDetail {
  student: { id: string; fullName: string; admissionNumber: string; schoolClass: { name: string; form: number }; files: { id: string }[] };
  card: {
    id: string; cardNumber: string | null; status: string; suspensionReason: string | null;
    fineBalance: number; totalFinesPaid: number; expiresAt: string | null;
    currentBorrowCount: number; totalBorrowCount: number;
    borrows: BorrowRow[];
  };
  settings: { maxBooksPerStudent: number; maxBorrowDays: number; finePerDay: number; maxRenewals: number };
}

interface EvalResult {
  allowed: boolean; reasons: string[]; warnings: string[];
  policy: { maxBooksAllowed: number; borrowDays: number; finePerDay: number; maxRenewals: number };
  dueAt: string; finePaused: boolean;
  card?: { fineBalance: number; currentBorrowCount: number; status: string };
  copy?: { id: string; accessionNumber: string; status: string; condition: string; catalogue: { id: string; title: string } };
}

interface ConfirmMsg { ok: boolean; text: string; extra?: string }

type Phase = "student" | "book" | "eval" | "done";
type Action = "borrow" | "return" | "renew";

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
const isOverdue = (dueAt: string, returned: string | null) => !returned && new Date(dueAt) < new Date();
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

function cardStatusVariant(s: string): "success"|"warn"|"default"|"danger" {
  return s === "ACTIVE" ? "success" : s === "SUSPENDED" ? "warn" : "default";
}

function copyStatusVariant(s: string): "success"|"info"|"warn"|"danger"|"default" {
  const m: Record<string,"success"|"info"|"warn"|"danger"|"default"> = {
    AVAILABLE: "success", BORROWED: "info", RESERVED: "warn", UNDER_REPAIR: "warn", ARCHIVED: "default",
  };
  return m[s] ?? "default";
}

function StudentPhoto({ fileId, name, size = "md" }: { fileId?: string; name: string; size?: "sm"|"md"|"lg" }) {
  const sz = size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-20 w-20 text-2xl" : "h-14 w-14 text-lg";
  const initials = name.trim().split(/\s+/).map(p => p[0]).slice(0,2).join("").toUpperCase();
  if (!fileId) return <div className={`${sz} rounded-full bg-teal/10 border-2 border-teal/20 flex items-center justify-center font-bold text-teal shrink-0`}>{initials}</div>;
  return <img src={`/api/students/files/${fileId}`} alt={name} className={`${sz} rounded-full object-cover border-2 border-line shrink-0`} onError={e => { (e.target as HTMLImageElement).style.display="none"; }} />;  // eslint-disable-line @next/next/no-img-element
}

// ── Hardware scanner ───────────────────────────────────────────────────────
function useHardwareScanner(onScan: (v: string) => void, enabled: boolean) {
  const buf = useRef(""); const last = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      const now = Date.now(); const gap = now - last.current; last.current = now;
      if (e.key === "Enter") { const v = buf.current.trim(); buf.current = ""; if (v.length > 2) onScan(v); return; }
      if (gap > 80) buf.current = "";
      if (e.key.length === 1) buf.current += e.key;
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [enabled, onScan]);
}

// ── Main component ─────────────────────────────────────────────────────────

export default function CirculatePage() {
  const [settings, setSettings]   = useState<Settings | null>(null);
  const [phase, setPhase]         = useState<Phase>("student");
  const [studentQuery, setStudentQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [cardData, setCardData]   = useState<CardDetail | null>(null);
  const [bookQuery, setBookQuery] = useState("");
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [returnType, setReturnType] = useState<string>("NORMAL");
  const [returnCondition, setReturnCondition] = useState<string>("GOOD");
  const [returnNotes, setReturnNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [clearReason, setClearReason] = useState("");
  const [showClearFine, setShowClearFine] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [confirm, setConfirm]     = useState<ConfirmMsg | null>(null);
  const [acting, setActing]       = useState(false);
  const [loadingCard, setLoadingCard] = useState(false);
  const [_loadingEval, _setLoadingEval] = useState(false);
  const [loadingBook, setLoadingBook] = useState(false);
  const [studentErr, setStudentErr]   = useState<string | null>(null);
  const [bookErr, setBookErr]         = useState<string | null>(null);
  const [actionErr, setActionErr]     = useState<string | null>(null);
  const studentRef = useRef<HTMLInputElement>(null);
  const bookRef    = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch("/api/library/settings").then(r=>r.json()).then(setSettings).catch(()=>{}); }, []);
  useEffect(() => {
    if (phase === "student") setTimeout(() => studentRef.current?.focus(), 50);
    if (phase === "book")    setTimeout(() => bookRef.current?.focus(), 50);
  }, [phase]);

  const method = settings?.identificationMethod ?? "MANUAL";

  // ── Student search ────────────────────────────────────────────────────
  const doStudentSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setSearching(true); setStudentErr(null);
    const res = await fetch(`/api/library/students/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setSearchResults(Array.isArray(data) ? data : []);
    setSearching(false);
  }, []);

  // Hardware scanner
  const onHardwareScan = useCallback((val: string) => {
    if (phase === "student") { setStudentQuery(val); doStudentSearch(val); }
    else if (phase === "book") { setBookQuery(val); doLookupBook(val); }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useHardwareScanner(onHardwareScan, method === "QR_HARDWARE");

  const selectStudent = async (s: StudentHit) => {
    setSearchResults([]); setStudentQuery(""); setLoadingCard(true); setStudentErr(null);
    const res = await fetch(`/api/library/cards/${s.id}`);
    const json = await res.json();
    setLoadingCard(false);
    if (!res.ok) { setStudentErr(json.error ?? "Card error"); return; }
    setCardData(json); setPhase("book");
  };

  // ── Book lookup + policy eval ─────────────────────────────────────────
  const doLookupBook = useCallback(async (q: string) => {
    if (!q.trim() || !cardData) return;
    setLoadingBook(true); setBookErr(null); setEvalResult(null); setSelectedAction(null); setConfirm(null);
    // Strip QR prefix
    const accession = q.startsWith("BIDII:") ? q.slice(6) : q;
    try {
      const copiesRes = await fetch(`/api/library/copies?q=${encodeURIComponent(accession)}`);
      const copies = await copiesRes.json();
      const match = (Array.isArray(copies) ? copies : []).find(
        (c: { accessionNumber: string }) => c.accessionNumber.toUpperCase() === accession.toUpperCase()
      );
      if (!match) { setBookErr(`No copy found for "${accession}".`); setLoadingBook(false); return; }
      // Policy evaluation
      const evalRes = await fetch(`/api/library/policies/evaluate?studentId=${cardData.student.id}&copyId=${match.id}`);
      const evalJson = await evalRes.json();
      setEvalResult({ ...evalJson, copy: match });
      setPhase("eval");
    } catch { setBookErr("Network error. Please try again."); }
    setLoadingBook(false);
  }, [cardData]);

  // ── Determine available actions based on copy status ──────────────────
  const copyStatus = evalResult?.copy?.status;
  const canBorrow  = copyStatus === "AVAILABLE" || copyStatus === "RESERVED";
  const canReturn  = copyStatus === "BORROWED";
  const canRenew   = copyStatus === "BORROWED";

  // ── Execute action ────────────────────────────────────────────────────
  const handleAction = async (action: Action) => {
    if (!cardData || !evalResult?.copy) return;
    setActing(true); setActionErr(null); setConfirm(null);
    try {
      let res: Response;
      if (action === "borrow") {
        res = await fetch("/api/library/circulate/borrow", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: cardData.student.id, copyId: evalResult.copy.id,
            ...(!evalResult.allowed && overrideReason ? { overrideReason } : {}),
          }),
        });
      } else if (action === "return") {
        const activeBorrow = cardData.card.borrows.find(
          b => !b.returnedAt && b.copy?.accessionNumber === evalResult.copy?.accessionNumber
        );
        if (!activeBorrow) { setActionErr("No active borrow found for this copy."); setActing(false); return; }
        res = await fetch("/api/library/circulate/return", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            borrowId: activeBorrow.id, returnType, returnCondition,
            notes: returnNotes || undefined,
          }),
        });
      } else {
        const activeBorrow = cardData.card.borrows.find(b => !b.returnedAt && b.copy?.accessionNumber === evalResult.copy?.accessionNumber);
        if (!activeBorrow) { setActionErr("No active borrow found."); setActing(false); return; }
        res = await fetch("/api/library/circulate/renew", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ borrowId: activeBorrow.id }),
        });
      }
      const json = await res.json();
      if (!res.ok) { setActionErr(json.error ?? "Action failed."); setActing(false); return; }
      const msgs: Record<Action, string> = {
        borrow: `"${evalResult.copy?.catalogue?.title}" issued — due ${fmt(json.dueAt ?? json.borrow?.dueAt)}.`,
        return: `Returned. Fine charged: KES ${(json.totalFine ?? 0).toFixed(2)}.`,
        renew:  `Renewed — new due date ${fmt(json.newDueAt)}.`,
      };
      setConfirm({ ok: true, text: msgs[action], extra: json.warnings?.[0] });
      setPhase("done");
      // Reload card silently
      const cardRes = await fetch(`/api/library/cards/${cardData.student.id}`);
      if (cardRes.ok) setCardData(await cardRes.json());
    } catch { setActionErr("Network error. Please try again."); }
    setActing(false);
  };

  // ── Clear fine ────────────────────────────────────────────────────────
  const handleClearFine = async () => {
    if (!cardData || !clearReason.trim()) return;
    setActing(true);
    const res = await fetch("/api/library/fines/clear", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: cardData.card.id, reason: clearReason }),
    });
    const json = await res.json();
    setActing(false);
    if (!res.ok) { setActionErr(json.error ?? "Could not clear fine."); return; }
    setClearReason(""); setShowClearFine(false);
    const cardRes = await fetch(`/api/library/cards/${cardData.student.id}`);
    if (cardRes.ok) setCardData(await cardRes.json());
  };

  const resetAll = () => {
    setPhase("student"); setCardData(null); setEvalResult(null); setSelectedAction(null);
    setStudentQuery(""); setBookQuery(""); setConfirm(null); setStudentErr(null);
    setBookErr(null); setActionErr(null); setReturnType("NORMAL"); setReturnCondition("GOOD");
    setReturnNotes(""); setOverrideReason(""); setShowClearFine(false);
  };

  const nextBook = () => {
    setPhase("book"); setEvalResult(null); setSelectedAction(null); setBookQuery("");
    setConfirm(null); setBookErr(null); setActionErr(null);
  };

  const card    = cardData?.card;
  const student = cardData?.student;
  const activeBorrows = card?.borrows.filter(b => !b.returnedAt) ?? [];
  const history       = card?.borrows.filter(b => !!b.returnedAt) ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-dark-text">Circulation Desk</h1>
          <p className="text-sm text-slate mt-0.5">4-step workflow — student → card → book → confirm.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate border border-line rounded-lg px-3 py-1.5 bg-paper">
            {method === "QR_CAMERA" ? <Camera className="h-4 w-4" /> : method === "QR_HARDWARE" ? <Usb className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />}
            {method === "QR_CAMERA" ? "Camera QR" : method === "QR_HARDWARE" ? "Hardware Scanner" : "Manual"}
          </span>
          {cardData && <button onClick={resetAll} className={secondaryButtonClass}><X className="h-4 w-4" /> Clear</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* ── LEFT: Student panel (always visible once loaded) ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Step 1 — Student search */}
          <div className={`rounded-xl border bg-white p-5 dark:bg-dark-surface dark:border-dark-border ${phase !== "student" && !cardData ? "opacity-50" : "border-line"}`}>
            <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-3 flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-teal text-white text-[10px] font-bold flex items-center justify-center">1</span>
              Identify Student
            </p>
            <form onSubmit={e => { e.preventDefault(); doStudentSearch(studentQuery); }}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate/50 pointer-events-none" />
                <input ref={studentRef} className="w-full rounded-lg border border-line bg-white pl-10 pr-4 py-2.5 text-sm text-ink focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 transition-colors"
                  placeholder="Name or admission number…" value={studentQuery}
                  onChange={e => { setStudentQuery(e.target.value); if (!e.target.value) setSearchResults([]); }}
                  autoComplete="off" />
              </div>
              {searching && <div className="mt-2 flex items-center gap-2 text-slate text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" />Searching…</div>}
            </form>
            {loadingCard && <div className="mt-2 flex items-center gap-2 text-slate text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading card…</div>}
            {studentErr && <div className="mt-2"><ErrorBanner message={studentErr} onDismiss={() => setStudentErr(null)} /></div>}
            {searchResults.length > 0 && (
              <ul className="mt-2 rounded-xl border border-line bg-white shadow-sm divide-y divide-line overflow-hidden animate-scale-in">
                {searchResults.map(s => (
                  <li key={s.id}>
                    <button onClick={() => selectStudent(s)} className="w-full text-left px-4 py-3 hover:bg-teal-50/40 transition-colors flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-ink">{s.fullName}</p>
                        <p className="text-xs text-slate">{s.admissionNumber} · {s.schoolClass.name}</p>
                      </div>
                      {s.libraryCard?.fineBalance ? <span className="text-xs text-danger font-semibold">KES {s.libraryCard.fineBalance.toFixed(2)}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Student card panel */}
          {student && card && (
            <div className={`rounded-xl border p-5 space-y-4 ${card.status === "SUSPENDED" ? "border-warn/40 bg-warn-bg/20" : card.fineBalance > 0 ? "border-danger/30 bg-danger-bg/10" : "border-teal/30 bg-teal-50/20"}`}>
              {/* Header */}
              <div className="flex items-start gap-4">
                <StudentPhoto fileId={student.files?.[0]?.id} name={student.fullName} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-ink">{student.fullName}</p>
                    <Badge variant={cardStatusVariant(card.status)}>{card.status}</Badge>
                  </div>
                  <p className="text-sm text-slate font-mono">{student.admissionNumber}</p>
                  <p className="text-sm text-slate">{student.schoolClass.name}</p>
                  {card.cardNumber && <p className="text-xs font-mono text-teal mt-1">{card.cardNumber}</p>}
                  {card.expiresAt && <p className="text-xs text-slate">Expires {fmt(card.expiresAt)}</p>}
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Borrowed", value: card.currentBorrowCount, hi: false },
                  { label: "Total", value: card.totalBorrowCount, hi: false },
                  { label: "Fine (KES)", value: card.fineBalance.toFixed(2), hi: card.fineBalance > 0 },
                ].map(s => (
                  <div key={s.label} className={`rounded-lg px-2 py-2 border ${s.hi ? "border-danger/30 bg-danger-bg/40" : "border-line bg-white/70"}`}>
                    <p className={`text-base font-bold ${s.hi ? "text-danger" : "text-ink"}`}>{s.value}</p>
                    <p className="text-[10px] text-slate">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Clear fine */}
              {card.fineBalance > 0 && (
                <div>
                  {!showClearFine ? (
                    <button onClick={() => setShowClearFine(true)} className="inline-flex items-center gap-1.5 text-xs text-danger border border-danger/30 rounded-lg px-3 py-1.5 hover:bg-danger-bg/40 transition-colors">
                      <DollarSign className="h-3.5 w-3.5" /> Clear Fine (KES {card.fineBalance.toFixed(2)})
                    </button>
                  ) : (
                    <div className="space-y-2 animate-slide-down">
                      <input className={inputClass} placeholder="Mandatory reason for clearing fine…" value={clearReason} onChange={e => setClearReason(e.target.value)} autoFocus />
                      <div className="flex gap-2">
                        <button onClick={handleClearFine} disabled={!clearReason.trim() || acting} className="inline-flex items-center gap-1.5 text-xs text-white bg-danger rounded-lg px-3 py-1.5 hover:bg-red-600 transition-colors disabled:opacity-50">
                          {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />} Confirm Clear
                        </button>
                        <button onClick={() => { setShowClearFine(false); setClearReason(""); }} className={secondaryButtonClass + " text-xs py-1.5 px-3"}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Active borrows */}
              {activeBorrows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-2">Active ({activeBorrows.length})</p>
                  <div className="space-y-1.5">
                    {activeBorrows.map(b => (
                      <div key={b.id} className={`flex items-center justify-between text-xs rounded-lg border px-3 py-2 ${isOverdue(b.dueAt, b.returnedAt) ? "border-danger/30 bg-danger-bg/30" : "border-line bg-white"}`}>
                        <span className="truncate font-medium">{b.copy?.catalogue?.title ?? b.book?.title ?? "Unknown"}</span>
                        <span className={`shrink-0 ml-2 ${isOverdue(b.dueAt, b.returnedAt) ? "text-danger font-bold" : "text-slate"}`}>
                          {isOverdue(b.dueAt, b.returnedAt) ? `${daysSince(b.dueAt)}d overdue` : `Due ${fmt(b.dueAt)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* History toggle */}
              {history.length > 0 && (
                <button onClick={() => setShowHistory(v => !v)} className="flex items-center gap-1 text-xs text-slate hover:text-ink transition-colors">
                  {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  History ({history.length})
                </button>
              )}
              {showHistory && (
                <div className="space-y-1">
                  {history.slice(0, 10).map(b => (
                    <div key={b.id} className="flex items-center justify-between text-xs border border-line rounded-lg px-3 py-2">
                      <span className="truncate text-ink">{b.copy?.catalogue?.title ?? b.book?.title ?? "Unknown"}</span>
                      <span className="shrink-0 ml-2 text-slate">{fmt(b.returnedAt!)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Book scan + action panel ── */}
        <div className="xl:col-span-3 space-y-4">

          {/* Step 2 — Book scan */}
          <div className={`rounded-xl border bg-white p-5 dark:bg-dark-surface dark:border-dark-border transition-opacity ${phase === "student" && !cardData ? "opacity-40 pointer-events-none" : "border-line"}`}>
            <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-3 flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-teal text-white text-[10px] font-bold flex items-center justify-center">2</span>
              Scan Book
            </p>
            <form onSubmit={e => { e.preventDefault(); doLookupBook(bookQuery); }}>
              <div className="relative">
                <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate/50 pointer-events-none" />
                <input ref={bookRef} className="w-full rounded-lg border border-line bg-white pl-10 pr-4 py-2.5 text-sm text-ink focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 transition-colors"
                  placeholder="Accession number or QR code…" value={bookQuery}
                  onChange={e => { setBookQuery(e.target.value); setBookErr(null); }}
                  autoComplete="off" disabled={phase === "student" && !cardData} />
              </div>
              {bookQuery.trim() && (phase === "book" || phase === "done") && (
                <button type="submit" disabled={loadingBook} className={`${primaryButtonClass} mt-2`}>
                  {loadingBook ? <><Loader2 className="h-4 w-4 animate-spin" />Looking up…</> : <><BookOpen className="h-4 w-4" />Find Book</>}
                </button>
              )}
            </form>
            {bookErr && <div className="mt-2"><ErrorBanner message={bookErr} onDismiss={() => setBookErr(null)} /></div>}
          </div>

          {/* Step 3 — Policy evaluation + action */}
          {evalResult?.copy && (phase === "eval" || phase === "done") && (
            <div className="rounded-xl border border-line bg-white p-5 space-y-4 dark:bg-dark-surface dark:border-dark-border">
              <p className="text-xs font-semibold text-slate uppercase tracking-wide flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-teal text-white text-[10px] font-bold flex items-center justify-center">3</span>
                Book Identified
              </p>

              {/* Copy details */}
              <div className="flex items-start gap-3 p-3 rounded-xl border border-line bg-paper">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-ink">{evalResult.copy.catalogue?.title ?? "Unknown"}</p>
                  <p className="text-xs font-mono text-slate mt-0.5">{evalResult.copy.accessionNumber}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={copyStatusVariant(evalResult.copy.status)}>{evalResult.copy.status}</Badge>
                  <span className="text-xs text-slate">{evalResult.copy.condition}</span>
                </div>
              </div>

              {/* Block reasons */}
              {evalResult.reasons.length > 0 && (
                <div className="rounded-xl bg-danger-bg border border-danger/20 p-4 space-y-2">
                  <p className="text-sm font-semibold text-danger flex items-center gap-2"><AlertCircle className="h-4 w-4" />Borrowing blocked</p>
                  <ul className="space-y-1">
                    {evalResult.reasons.map((r, i) => <li key={i} className="text-sm text-danger/90">• {r}</li>)}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {evalResult.warnings.length > 0 && (
                <div className="rounded-xl bg-warn-bg border border-warn/20 p-3 space-y-1">
                  {evalResult.warnings.map((w, i) => (
                    <p key={i} className="text-sm text-warn flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{w}</p>
                  ))}
                </div>
              )}

              {/* Override */}
              {evalResult.reasons.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate">Override (with reason):</p>
                  <input className={inputClass} placeholder="Mandatory override reason…" value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
                </div>
              )}

              {/* Confirm message */}
              {confirm && (
                <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium ${confirm.ok ? "bg-success-bg border border-success/20 text-success" : "bg-danger-bg border border-danger/20 text-danger"}`}>
                  {confirm.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                  <div><p>{confirm.text}</p>{confirm.extra && <p className="text-xs mt-0.5 opacity-80">{confirm.extra}</p>}</div>
                </div>
              )}

              {actionErr && <ErrorBanner message={actionErr} onDismiss={() => setActionErr(null)} />}

              {/* Return options */}
              {selectedAction === "return" && (
                <div className="space-y-3 animate-slide-down">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate mb-1">Return type</label>
                      <select className={inputClass} value={returnType} onChange={e => setReturnType(e.target.value)}>
                        {["NORMAL","DAMAGED","LOST","REPLACEMENT_RECEIVED","OVERRIDE"].map(t => <option key={t} value={t}>{t.replace("_"," ")}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate mb-1">Condition</label>
                      <select className={inputClass} value={returnCondition} onChange={e => setReturnCondition(e.target.value)}>
                        {["EXCELLENT","GOOD","FAIR","DAMAGED","LOST"].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <input className={inputClass} placeholder="Notes (optional)…" value={returnNotes} onChange={e => setReturnNotes(e.target.value)} />
                </div>
              )}

              {/* Action buttons */}
              {phase !== "done" && (
                <div className="flex flex-wrap gap-2">
                  {canBorrow && (
                    <button onClick={() => { setSelectedAction("borrow"); handleAction("borrow"); }}
                      disabled={acting || (evalResult.reasons.length > 0 && !overrideReason.trim())}
                      className={`${primaryButtonClass} ${evalResult.reasons.length > 0 ? "bg-warn hover:bg-amber-600" : ""}`}>
                      {acting && selectedAction === "borrow" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                      {evalResult.reasons.length > 0 ? "Override Borrow" : "Borrow"}
                    </button>
                  )}
                  {canReturn && (
                    <button onClick={() => selectedAction === "return" ? handleAction("return") : setSelectedAction("return")}
                      disabled={acting}
                      className="inline-flex items-center gap-2 rounded-lg bg-success text-white text-sm font-medium px-4 py-2.5 hover:bg-green-600 disabled:opacity-50 transition-colors">
                      {acting && selectedAction === "return" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      {selectedAction === "return" ? "Confirm Return" : "Return"}
                    </button>
                  )}
                  {canRenew && (
                    <button onClick={() => { setSelectedAction("renew"); handleAction("renew"); }} disabled={acting}
                      className={secondaryButtonClass}>
                      {acting && selectedAction === "renew" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Renew
                    </button>
                  )}
                  <button onClick={() => { setEvalResult(null); setPhase("book"); setBookQuery(""); setSelectedAction(null); }} className={secondaryButtonClass}>
                    <X className="h-4 w-4" /> Cancel
                  </button>
                </div>
              )}

              {phase === "done" && (
                <div className="flex gap-2">
                  <button onClick={nextBook} className={primaryButtonClass}><BookOpen className="h-4 w-4" />Next Book</button>
                  <button onClick={resetAll} className={secondaryButtonClass}><User className="h-4 w-4" />New Student</button>
                </div>
              )}
            </div>
          )}

          {/* Idle hint */}
          {!cardData && phase === "student" && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-full bg-teal/10 flex items-center justify-center mb-4">
                <CreditCard className="h-8 w-8 text-teal/50" />
              </div>
              <p className="text-sm text-slate max-w-xs">Search for a student to open their library card, then scan the book to borrow, return or renew.</p>
              <Link href="/staff/library/reservations" className="text-xs text-teal hover:underline mt-3">View reservations →</Link>
            </div>
          )}

          {/* Step 2 idle hint */}
          {cardData && phase === "book" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-teal/10 flex items-center justify-center mb-3">
                <BookOpen className="h-6 w-6 text-teal/50" />
              </div>
              <p className="text-sm text-slate">Now scan the book&apos;s QR code or type its accession number.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
