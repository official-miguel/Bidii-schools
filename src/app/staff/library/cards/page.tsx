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
import CardDetailPanel from "@/components/library/CardDetailPanel";

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

// ── Helpers ────────────────────────────────────────────────────────────────

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
            className="w-full rounded-lg border border-border bg-card pl-10 pr-10 py-2.5 text-sm
                       text-foreground placeholder:text-slate/50 focus:outline-none focus:border-teal
                       focus:ring-2 focus:ring-teal/15 transition-colors"
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
            className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border
                       bg-card shadow-xl overflow-hidden"
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
                    <p className="text-sm font-medium text-foreground truncate">{s.fullName}</p>
                    <p className="text-xs text-slate">{s.admissionNumber} · {s.schoolClass?.name}</p>
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
            className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border
                       bg-card shadow-xl px-4 py-3"
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
            <input type="checkbox" checked={filterFine} onChange={e => setFilterFine(e.target.checked)} className="rounded border-border" />
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
                  : "border-border bg-card hover:border-teal/30"}`}>
                <div className="flex items-start gap-3">
                  <StudentPhoto fileId={photoId} name={c.student.fullName} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="font-semibold text-sm text-foreground truncate">{c.student.fullName}</p>
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
