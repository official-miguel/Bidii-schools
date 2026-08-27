"use client";

/**
 * Scan Mode — optimised for continuous circulation at the library desk.
 *
 * Three input modes (set in Library Settings):
 *   MANUAL       — type admission number or accession number, press Enter
 *   QR_CAMERA    — device camera scans QR codes from the screen
 *   QR_HARDWARE  — USB/Bluetooth hardware scanner feeds keyboard events
 *
 * Workflow:
 *   1. Identify student  (type admission number or name — no scanning)
 *   2. Card appears with photo — status, fines, current borrows
 *   3. Scan or type book accession number
 *   4. Choose action: Borrow / Return / Reserve / Renew
 *   5. Confirmation flash — ready for next scan
 *
 * Hardware scanner detection: listens for rapid keystrokes followed by
 * Enter (typical barcode/QR scanner behaviour) and routes them to the
 * active input field without extra clicks.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  QrCode, Search, User, BookOpen, RotateCcw,
  CheckCircle2, AlertCircle, Loader2, X, Camera,
  Keyboard, Usb,
} from "lucide-react";
import {
  Badge, ErrorBanner,
  primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";
import { useReservationToast } from "@/hooks/useReservationToast";


// ── Types ──────────────────────────────────────────────────────────────────

interface Settings {
  identificationMethod: "MANUAL" | "QR_CAMERA" | "QR_HARDWARE";
  maxBooksPerStudent: number;
  maxBorrowDays: number;
  finePerDay: number;
  maxRenewals: number;
}

interface StudentInfo {
  id: string; fullName: string; admissionNumber: string;
  schoolClass: { name: string; form: number };
  files: { id: string }[];
}

interface CardInfo {
  id: string; cardNumber: string | null; status: string;
  fineBalance: number; currentBorrowCount: number; expiresAt: string | null;
}

interface BorrowRow {
  id: string; borrowedAt: string; dueAt: string; returnedAt: string | null;
  copy?: { accessionNumber: string; catalogue?: { title: string } };
  book?: { title: string };
}

interface CardData {
  student: StudentInfo; card: CardInfo & { borrows: BorrowRow[] };
  settings: Settings;
}

interface CopyInfo {
  id: string; accessionNumber: string; status: string; condition: string;
  catalogue: { id: string; title: string; author: string | null; bookNumber: string | null; subject?: string | null };
}

type ScanPhase = "student" | "book" | "confirm";
type ActionType = "borrow" | "return" | "renew";

interface ConfirmMsg { ok: boolean; text: string }

// Lightweight shape returned by the students/search API for dropdown
interface StudentSuggestion {
  id: string; fullName: string; admissionNumber: string;
  schoolClass: { name: string };
  files?: { id: string }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(dueAt: string, returnedAt: string | null) {
  return !returnedAt && new Date(dueAt) < new Date();
}

function cardStatusVariant(status: string): "success" | "warn" | "default" | "info" {
  return status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "warn" : "default";
}

function StudentPhoto({ fileId, name, size = "md" }: { fileId?: string; name: string; size?: "sm"|"md"|"lg" }) {
  const sz     = size === "sm" ? "h-9 w-9"   : size === "lg" ? "h-20 w-20" : "h-14 w-14";
  const iconSz = size === "sm" ? "h-4 w-4"   : size === "lg" ? "h-8 w-8"   : "h-6 w-6";
  const initials = name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
  const [imgFailed, setImgFailed] = useState(false);

  if (!fileId || imgFailed) {
    return (
      <div className={`${sz} rounded-full bg-slate-100 border-2 border-slate-200 dark:bg-dark-border dark:border-dark-border flex flex-col items-center justify-center shrink-0`}>
        <svg viewBox="0 0 40 40" fill="none" className={`${iconSz} text-slate-400 dark:text-dark-muted`} aria-hidden="true">
          <circle cx="20" cy="14" r="7" fill="currentColor" opacity="0.5"/>
          <path d="M4 36c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="currentColor" opacity="0.3"/>
        </svg>
        <span className="text-[9px] font-bold text-slate-400 dark:text-dark-muted -mt-0.5 leading-none">{initials}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/students/files/${fileId}`} alt={name}
      className={`${sz} rounded-full object-cover border-2 border-line shrink-0`}
      onError={() => setImgFailed(true)}
    />
  );
}

// Book cover placeholder — spine-style tile with subject colour + title words
const SUBJECT_COLORS: Record<string, { bg: string; text: string }> = {
  mathematics: { bg: "#1d4ed8", text: "#fff" },
  english:     { bg: "#047857", text: "#fff" },
  kiswahili:   { bg: "#b45309", text: "#fff" },
  science:     { bg: "#7c3aed", text: "#fff" },
  biology:     { bg: "#065f46", text: "#fff" },
  chemistry:   { bg: "#9f1239", text: "#fff" },
  physics:     { bg: "#1e3a5f", text: "#fff" },
  history:     { bg: "#92400e", text: "#fff" },
  geography:   { bg: "#166534", text: "#fff" },
  cre:         { bg: "#6d28d9", text: "#fff" },
  business:    { bg: "#0e7490", text: "#fff" },
  default:     { bg: "#374151", text: "#fff" },
};

function BookCover({ title, subject, size = "md" }: { title: string; subject?: string | null; size?: "sm"|"md"|"lg" }) {
  const dims   = size === "lg" ? "w-24 h-32" : size === "sm" ? "w-10 h-14" : "w-16 h-[88px]";
  const textSz = size === "lg" ? "text-[11px]" : "text-[9px]";
  const iconSz = size === "lg" ? "h-6 w-6" : "h-4 w-4";
  const key    = (subject ?? "").toLowerCase().split(/\s+/)[0] ?? "";
  const color  = SUBJECT_COLORS[key] ?? SUBJECT_COLORS.default;
  const words  = title.trim().split(/\s+/);
  const line1  = words.slice(0, 2).join(" ");
  const line2  = words.length > 2 ? words.slice(2, 4).join(" ") : "";

  return (
    <div
      className={`${dims} rounded-md shrink-0 flex flex-col items-center justify-center p-1.5 shadow-sm border border-black/10 overflow-hidden`}
      style={{ backgroundColor: color.bg }}
      aria-hidden="true"
    >
      <BookOpen className={`${iconSz} mb-1 opacity-40`} style={{ color: color.text }} />
      <p className={`${textSz} font-bold text-center leading-tight`} style={{ color: color.text }}>{line1}</p>
      {line2 && <p className={`${textSz} text-center leading-tight opacity-80`} style={{ color: color.text }}>{line2}</p>}
      {subject && (
        <p className="text-[8px] mt-1 opacity-60 text-center leading-tight truncate w-full text-center" style={{ color: color.text }}>
          {subject}
        </p>
      )}
    </div>
  );
}

// ── Hardware scanner buffer ────────────────────────────────────────────────
// Hardware scanners fire characters very quickly then send Enter.
// We buffer keystrokes < 50 ms apart and treat the Enter as a scan event.

function useHardwareScanner(onScan: (value: string) => void, enabled: boolean) {
  const bufferRef  = useRef("");
  const lastKeyRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    function handler(e: KeyboardEvent) {
      const now = Date.now();
      const gap = now - lastKeyRef.current;
      lastKeyRef.current = now;

      if (e.key === "Enter") {
        const val = bufferRef.current.trim();
        bufferRef.current = "";
        if (val.length > 2) onScan(val);
        return;
      }

      // If gap is large, reset buffer (user is typing, not scanning)
      if (gap > 80) bufferRef.current = "";

      if (e.key.length === 1) bufferRef.current += e.key;
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onScan]);
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function ScanModePage() {
  useReservationToast();
  const [settings, setSettings]   = useState<Settings | null>(null);
  const [phase, setPhase]         = useState<ScanPhase>("student");
  const [studentInput, setStudentInput] = useState("");
  const [bookInput, setBookInput] = useState("");
  const [cardData, setCardData]   = useState<CardData | null>(null);
  const [copyInfo, setCopyInfo]   = useState<CopyInfo | null>(null);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [loadingBook, setLoadingBook] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [studentErr, setStudentErr] = useState<string | null>(null);
  const [bookErr, setBookErr]     = useState<string | null>(null);
  const [confirm, setConfirm]     = useState<ConfirmMsg | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanModeOn, setScanModeOn]     = useState(false);
  const [barcodeDetectorAvailable, setBarcodeDetectorAvailable] = useState<boolean | null>(null);

  // ── Live search state ──────────────────────────────────────────────────
  const [studentSuggestions, setStudentSuggestions] = useState<StudentSuggestion[]>([]);
  const [bookSuggestions, setBookSuggestions]       = useState<CopyInfo[]>([]);
  const [showStudentDrop, setShowStudentDrop]       = useState(false);
  const [showBookDrop, setShowBookDrop]             = useState(false);
  const studentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookDebounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const videoRef   = useRef<HTMLVideoElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const studentRef = useRef<HTMLInputElement>(null);
  const bookRef    = useRef<HTMLInputElement>(null);
  const studentDropRef = useRef<HTMLDivElement>(null);
  const bookDropRef    = useRef<HTMLDivElement>(null);

  // Load settings on mount
  useEffect(() => {
    fetch("/api/library/settings").then(r => r.json()).then(setSettings).catch(() => {});
  }, []);

  // Auto-focus appropriate input
  useEffect(() => {
    if (phase === "student") setTimeout(() => studentRef.current?.focus(), 50);
    if (phase === "book")    setTimeout(() => bookRef.current?.focus(), 50);
  }, [phase]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (studentDropRef.current && !studentDropRef.current.contains(e.target as Node) &&
          !studentRef.current?.contains(e.target as Node)) {
        setShowStudentDrop(false);
      }
      if (bookDropRef.current && !bookDropRef.current.contains(e.target as Node) &&
          !bookRef.current?.contains(e.target as Node)) {
        setShowBookDrop(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Hardware scanner — routes scans to the active phase
  const handleHardwareScan = useCallback((value: string) => {
    if (phase === "book") {
      setBookInput(value);
      selectBookByAccession(value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useHardwareScanner(handleHardwareScan, settings?.identificationMethod === "QR_HARDWARE");

  // ── Live student search (debounced 300ms) ──────────────────────────────

  function onStudentInputChange(value: string) {
    setStudentInput(value);
    setStudentErr(null);
    if (studentDebounceRef.current) clearTimeout(studentDebounceRef.current);
    if (!value.trim()) { setStudentSuggestions([]); setShowStudentDrop(false); return; }
    studentDebounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/library/students/search?q=${encodeURIComponent(value.trim())}`);
        const data = await res.json() as StudentSuggestion[];
        setStudentSuggestions(Array.isArray(data) ? data : []);
        setShowStudentDrop(true);
      } catch { /* silent */ }
    }, 300);
  }

  // Called when the user picks from the dropdown or presses Enter
  const selectStudentByAdmission = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setShowStudentDrop(false);
    setLoadingStudent(true); setStudentErr(null);
    try {
      const admissionNumber = q.startsWith("BIDII:STUDENT:") ? q.slice(14) : q;
      const res  = await fetch(`/api/library/students/search?q=${encodeURIComponent(admissionNumber)}`);
      const data = await res.json() as StudentSuggestion[];
      if (!res.ok || !Array.isArray(data) || data.length === 0) {
        setStudentErr(`No student found for "${admissionNumber}".`);
        setLoadingStudent(false); return;
      }
      await loadStudentCard(data[0].id);
    } catch { setStudentErr("Network error. Please try again."); }
    setLoadingStudent(false);
  }, []);

  async function selectStudentFromDrop(s: StudentSuggestion) {
    setStudentInput(s.fullName);
    setStudentSuggestions([]);
    setShowStudentDrop(false);
    await loadStudentCard(s.id);
  }

  async function loadStudentCard(studentId: string) {
    setLoadingStudent(true); setStudentErr(null);
    try {
      const cardRes  = await fetch(`/api/library/cards/${studentId}`);
      const cardJson = await cardRes.json() as CardData;
      if (!cardRes.ok) { setStudentErr((cardJson as { error?: string }).error ?? "Card error."); setLoadingStudent(false); return; }
      setCardData(cardJson);
      setPhase("book");
    } catch { setStudentErr("Network error. Please try again."); }
    setLoadingStudent(false);
  }

  // ── Live book / copy search (debounced 300ms) ──────────────────────────
  // Uses GET /api/library/copies?q= for the suggestion dropdown (title/author
  // fuzzy search returns multiple results for the list) and the faster
  // GET /api/library/copies/search?q= for exact accession/book-number lookups
  // (indexed equality — same endpoint the Circulation Desk uses).

  function onBookInputChange(value: string) {
    setBookInput(value);
    setBookErr(null);
    if (bookDebounceRef.current) clearTimeout(bookDebounceRef.current);
    if (!value.trim()) { setBookSuggestions([]); setShowBookDrop(false); return; }
    // Only run live search when we're actually in the book phase
    if (phase !== "book") return;
    bookDebounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/library/copies?q=${encodeURIComponent(value.trim())}&archived=false`);
        if (!res.ok) return;
        const data = await res.json();
        // GET /api/library/copies returns { copies: [...] } or plain array
        const list: CopyInfo[] = Array.isArray(data) ? data : (Array.isArray(data?.copies) ? data.copies : []);
        setBookSuggestions(list.slice(0, 8));
        if (list.length > 0) setShowBookDrop(true);
      } catch { /* silent — user can still press Enter */ }
    }, 300);
  }

  const selectBookByAccession = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setShowBookDrop(false);
    setLoadingBook(true); setBookErr(null);
    try {
      // Strip known QR prefixes so bare accession/book numbers always work
      const accession = q.startsWith("BIDII:BOOK:") ? q.slice(11)
                      : q.startsWith("BIDII:")      ? q.slice(6)
                      : q;
      // /copies/search uses indexed lookups (fast, single result)
      const res  = await fetch(`/api/library/copies/search?q=${encodeURIComponent(accession)}`);
      const json = await res.json();
      if (!res.ok || !json.copy) {
        setBookErr(json.error ?? `No copy found for "${accession}".`);
        setLoadingBook(false); return;
      }
      const copy: CopyInfo = json.copy;
      setCopyInfo(copy);
      setPhase("confirm");
    } catch { setBookErr("Network error. Please try again."); }
    setLoadingBook(false);
  }, []);

  function selectBookFromDrop(copy: CopyInfo) {
    setBookInput(copy.accessionNumber);
    setBookSuggestions([]);
    setShowBookDrop(false);
    setCopyInfo(copy);
    setPhase("confirm");
  }

  // Keep old alias for hardware scanner compat
  const lookupStudent = selectStudentByAdmission;
  const lookupBook    = selectBookByAccession;

  // ── Actions ────────────────────────────────────────────────────────────
  // Uses the canonical /api/library/circulate/* endpoints (same as the
  // Circulation Desk) so policy enforcement is consistent across both pages.

  async function handleAction(action: ActionType) {
    if (!cardData || !copyInfo) return;
    setActionLoading(true); setConfirm(null);
    try {
      let res: Response;

      if (action === "borrow") {
        res = await fetch("/api/library/circulate/borrow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: cardData.student.id, copyId: copyInfo.id }),
        });
      } else {
        // return / renew both need the active borrowId
        const activeBorrow = cardData.card.borrows.find(
          b => !b.returnedAt && b.copy?.accessionNumber === copyInfo.accessionNumber
        );
        if (!activeBorrow) {
          setConfirm({ ok: false, text: "No active borrow found for this copy." });
          setActionLoading(false); return;
        }

        if (action === "return") {
          res = await fetch("/api/library/circulate/return", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ borrowId: activeBorrow.id, returnType: "NORMAL", returnCondition: "GOOD" }),
          });
        } else {
          res = await fetch("/api/library/circulate/renew", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ borrowId: activeBorrow.id }),
          });
        }
      }

      const json = await res.json();
      if (!res.ok) {
        setConfirm({ ok: false, text: json.error ?? "Action failed." });
      } else {
        const msgs: Record<ActionType, string> = {
          borrow: `"${copyInfo.catalogue.title}" issued — due ${fmt(json.dueAt ?? json.borrow?.dueAt)}.`,
          return: `"${copyInfo.catalogue.title}" returned. Fine: KES ${(json.totalFine ?? 0).toFixed(2)}.`,
          renew:  `"${copyInfo.catalogue.title}" renewed — due ${fmt(json.newDueAt)}.`,
        };
        setConfirm({ ok: true, text: msgs[action] });
        // Reload card silently so borrows list is fresh for the next book
        fetch(`/api/library/cards/${cardData.student.id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setCardData(d); });
        // Auto-reset to book scan after 2.5 s (keep student loaded)
        setTimeout(() => {
          setCopyInfo(null); setBookInput(""); setBookErr(null); setConfirm(null); setPhase("book");
          // Re-open camera if scan mode is still on
          if (scanModeOn) startCamera();
        }, 2500);
      }
    } catch { setConfirm({ ok: false, text: "Network error. Please try again." }); }
    setActionLoading(false);
  }

  function resetAll() {
    setPhase("student"); setStudentInput(""); setBookInput("");
    setCardData(null); setCopyInfo(null); setStudentErr(null);
    setBookErr(null); setConfirm(null);
    setStudentSuggestions([]); setShowStudentDrop(false);
    setBookSuggestions([]);    setShowBookDrop(false);
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    stopCamera();
    setScanModeOn(false);
  }

  // ── Camera ─────────────────────────────────────────────────────────────

  // After cameraActive flips to true React renders the <video> element.
  // We wire the MediaStream to it here — AFTER the DOM node is available —
  // which is the reliable fix for the black-screen bug caused by setting
  // srcObject on a stale/unmounted video ref.
  useEffect(() => {
    if (!cameraActive) return;
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
    startQRScanning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive]);

  // Detect BarcodeDetector availability once on mount so we can show a
  // helpful hint ("QR auto-detected" vs "enter code manually") in the UI.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setBarcodeDetectorAvailable(typeof (window as any).BarcodeDetector !== "undefined");
  }, []);

  async function startCamera() {
    // Camera requires a secure context (HTTPS or localhost).
    // On phones accessing via local network HTTP this will always fail.
    if (!navigator.mediaDevices?.getUserMedia) {
      setStudentErr(
        "Camera not available. This requires HTTPS or localhost. Use manual input instead."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      // Store the stream BEFORE calling setCameraActive so the useEffect above
      // can wire it to the <video> element once React has mounted it.
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      const error = err as { name?: string };
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        setStudentErr(
          "Camera permission denied. Please allow camera access in your browser settings, then try again."
        );
      } else if (error.name === "NotFoundError") {
        setStudentErr("No camera found on this device. Use manual input instead.");
      } else if (error.name === "NotSupportedError") {
        setStudentErr(
          "Camera requires HTTPS. When accessing from a phone over Wi-Fi, use manual input or connect via HTTPS."
        );
      } else {
        setStudentErr(`Camera unavailable (${(err as Error).message ?? "unknown error"}). Use manual input instead.`);
      }
    }
  }

  function stopCamera() {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  // Toggle scan mode on/off — opening/closing the camera
  function toggleScanMode() {
    if (scanModeOn) {
      stopCamera();
      setScanModeOn(false);
    } else {
      setScanModeOn(true);
      startCamera();
    }
  }

  // Auto-open camera when arriving at book phase if scan mode is on
  useEffect(() => {
    if (phase === "book" && scanModeOn) {
      startCamera();
    }
    if (phase !== "book") {
      stopCamera();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // QR decoding via BarcodeDetector API (Chrome 83+, Edge 83+, Safari iOS 17+).
  // Falls back gracefully — if unavailable the video stays live and the user
  // reads the code visually, then types it manually.
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a stable ref to phase so the interval callback always sees the latest value.
  const phaseRef = useRef<ScanPhase>(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  function startQRScanning() {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BD = (window as any).BarcodeDetector;
    if (!BD) return; // Not supported — camera stays live for visual read

    let detector: { detect: (src: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
    try {
      detector = new BD({ formats: ["qr_code"] });
    } catch {
      return;
    }

    scanIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !streamRef.current) return;
      // Don't scan if the video hasn't loaded a frame yet
      if (videoRef.current.readyState < 2) return;
      try {
        const results = await detector.detect(videoRef.current);
        if (results.length > 0) {
          const value = results[0].rawValue;
          stopCamera(); // stops interval too
          const currentPhase = phaseRef.current;
          if (currentPhase === "book") {
            setBookInput(value);
            lookupBook(value);
          }
        }
      } catch {
        // Detection error on a single frame — ignore and keep scanning
      }
    }, 300);
  }

  // Clean up on unmount
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
  }, []);

  const method = settings?.identificationMethod ?? "MANUAL";
  const card   = cardData?.card;
  const active = card?.borrows.filter(b => !b.returnedAt) ?? [];

  const methodIcon = method === "QR_CAMERA" ? <Camera className="h-4 w-4" />
    : method === "QR_HARDWARE" ? <Usb className="h-4 w-4" />
    : <Keyboard className="h-4 w-4" />;

  const methodLabel = method === "QR_CAMERA" ? "Camera QR Scan"
    : method === "QR_HARDWARE" ? "Hardware Scanner"
    : "Manual Input";

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink dark:text-dark-text">Scan Mode</h1>
          <p className="text-sm text-slate mt-0.5">Fast circulation — borrow, return, and renew.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate border border-line rounded-lg px-3 py-1.5 bg-paper">
            {methodIcon} {methodLabel}
          </span>
          {cardData && (
            <button onClick={resetAll} className={secondaryButtonClass}>
              <X className="h-4 w-4" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Left: Student identification ── */}
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-white p-5 dark:bg-dark-surface dark:border-dark-border">
            <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-3 flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-teal text-white text-[10px] font-bold flex items-center justify-center">1</span>
              Identify Student
            </p>



            <form onSubmit={e => { e.preventDefault(); selectStudentByAdmission(studentInput); }}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate/50 pointer-events-none" />
                <input
                  ref={studentRef}
                  className="w-full rounded-lg border border-line bg-white pl-10 pr-4 py-3 text-sm text-ink focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 transition-colors dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
                  placeholder="Admission number or name…"
                  value={studentInput}
                  onChange={e => onStudentInputChange(e.target.value)}
                  onFocus={() => studentSuggestions.length > 0 && setShowStudentDrop(true)}
                  autoFocus
                  autoComplete="off"
                />
                {loadingStudent && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal animate-spin" />
                )}
                {/* Live dropdown */}
                {showStudentDrop && studentSuggestions.length > 0 && (
                  <div ref={studentDropRef} className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-line bg-white shadow-xl dark:bg-dark-surface dark:border-dark-border overflow-hidden">
                    {studentSuggestions.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); selectStudentFromDrop(s); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-teal-50 dark:hover:bg-teal/10 transition-colors text-left"
                      >
                        <StudentPhoto fileId={s.files?.[0]?.id} name={s.fullName} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{s.fullName}</p>
                          <p className="text-xs text-slate dark:text-dark-muted">{s.admissionNumber} · {s.schoolClass?.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {studentInput.trim() && !showStudentDrop && (
                <button type="submit" disabled={loadingStudent} className={`${primaryButtonClass} mt-2 w-full justify-center`}>
                  {loadingStudent ? <><Loader2 className="h-4 w-4 animate-spin" />Searching…</> : <><User className="h-4 w-4" />Find Student</>}
                </button>
              )}
            </form>

            {studentErr && <div className="mt-3"><ErrorBanner message={studentErr} onDismiss={() => setStudentErr(null)} /></div>}
          </div>

          {/* Student card preview */}
          {cardData && card && (
            <div className={`rounded-xl border p-5 ${card.status === "SUSPENDED" ? "border-warn/40 bg-warn-bg/20" : card.fineBalance > 0 ? "border-danger/30 bg-danger-bg/20" : "border-teal/30 bg-teal-50/30"} dark:bg-dark-surface`}>
              <div className="flex items-start gap-4">
                <StudentPhoto fileId={cardData.student.files?.[0]?.id} name={cardData.student.fullName} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-ink dark:text-dark-text">{cardData.student.fullName}</p>
                    <Badge variant={cardStatusVariant(card.status)}>{card.status}</Badge>
                  </div>
                  <p className="text-sm text-slate font-mono">{cardData.student.admissionNumber}</p>
                  <p className="text-sm text-slate">{cardData.student.schoolClass.name}</p>
                  {card.cardNumber && <p className="text-xs font-mono text-teal mt-1">{card.cardNumber}</p>}
                  {card.fineBalance > 0 && (
                    <p className="text-sm text-danger font-semibold mt-1">⚠ KES {card.fineBalance.toFixed(2)} outstanding fine</p>
                  )}
                  {card.expiresAt && <p className="text-xs text-slate mt-1">Card expires {fmt(card.expiresAt)}</p>}
                </div>
              </div>

              {/* Active borrows mini-list */}
              {active.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <p className="text-xs font-semibold text-slate uppercase tracking-wide">Currently borrowed ({active.length})</p>
                  {active.map(b => (
                    <div key={b.id} className={`flex items-center justify-between text-xs rounded-lg border px-3 py-2 ${isOverdue(b.dueAt, b.returnedAt) ? "border-danger/30 bg-danger-bg/30 text-danger" : "border-line bg-white dark:bg-dark-surface dark:border-dark-border text-slate"}`}>
                      <span className="font-medium truncate">{b.copy?.catalogue?.title ?? b.book?.title ?? "Unknown"}</span>
                      <span className="shrink-0 ml-2">{isOverdue(b.dueAt, b.returnedAt) ? "OVERDUE" : `Due ${fmt(b.dueAt)}`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Book scan + action ── */}
        <div className="space-y-4">
          <div className={`rounded-xl border bg-white p-5 dark:bg-dark-surface dark:border-dark-border transition-opacity ${phase === "book" || phase === "confirm" ? "border-line opacity-100" : "border-line opacity-40 pointer-events-none"}`}>

            {/* Header: label + Scan Mode toggle switch */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate uppercase tracking-wide flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-teal text-white text-[10px] font-bold flex items-center justify-center">2</span>
                Scan Book
              </p>
              {/* Scan Mode toggle — always visible once student selected */}
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${scanModeOn ? "text-teal" : "text-slate"}`}>
                  Scan Mode
                </span>
                <button
                  type="button"
                  onClick={toggleScanMode}
                  disabled={phase === "student"}
                  aria-pressed={scanModeOn}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 ${scanModeOn ? "bg-teal" : "bg-slate/30"}`}
                >
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${scanModeOn ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            </div>

            <form onSubmit={e => { e.preventDefault(); selectBookByAccession(bookInput); }}>
              {/* Input row with camera icon always on right */}
              <div className={`flex items-center rounded-lg border bg-white transition-colors dark:bg-dark-surface dark:border-dark-border ${scanModeOn ? "border-teal ring-2 ring-teal/15" : "border-line"}`}>
                <BookOpen className="ml-3 h-4 w-4 shrink-0 text-slate/50" />
                <input
                  ref={bookRef}
                  className="flex-1 bg-transparent px-2.5 py-3 text-sm text-ink placeholder:text-slate/50 focus:outline-none dark:text-dark-text"
                  placeholder={scanModeOn ? "Scanning — point camera at QR code…" : "Title, accession number or author…"}
                  value={bookInput}
                  onChange={e => onBookInputChange(e.target.value)}
                  onFocus={() => bookSuggestions.length > 0 && setShowBookDrop(true)}
                  autoComplete="off"
                  disabled={phase === "student"}
                  readOnly={scanModeOn}
                />
                {/* Camera icon button — always visible, tap = toggle scan mode */}
                {loadingBook
                  ? <Loader2 className="mr-3 h-4 w-4 shrink-0 text-teal animate-spin" />
                  : (
                    <button
                      type="button"
                      onClick={toggleScanMode}
                      disabled={phase === "student"}
                      title={scanModeOn ? "Close camera" : "Scan with camera"}
                      className={`mr-2 rounded-full p-1.5 transition-colors disabled:opacity-40 ${scanModeOn ? "bg-teal text-white" : "text-slate hover:bg-teal/10 hover:text-teal"}`}
                    >
                      <QrCode className="h-4 w-4" />
                    </button>
                  )
                }
              </div>

              {/* Camera viewfinder */}
              {cameraActive && (
                <div className="mt-3 relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "4/3", maxHeight: 300 }}>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
                  {/* Corner brackets */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative w-48 h-48">
                      {(["tl","tr","bl","br"] as const).map(c => (
                        <div key={c} className="absolute w-8 h-8" style={{
                          top: c.includes("t") ? 0 : "auto", bottom: c.includes("b") ? 0 : "auto",
                          left: c.includes("l") ? 0 : "auto", right: c.includes("r") ? 0 : "auto",
                          borderColor: "#0d9488",
                          borderTopWidth: c.includes("t") ? 3 : 0, borderBottomWidth: c.includes("b") ? 3 : 0,
                          borderLeftWidth: c.includes("l") ? 3 : 0, borderRightWidth: c.includes("r") ? 3 : 0,
                        }} />
                      ))}
                    </div>
                  </div>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 rounded-full px-3 py-1">
                    <p className="text-white text-xs whitespace-nowrap">Point at book QR code</p>
                  </div>
                  <button type="button" onClick={() => { stopCamera(); setScanModeOn(false); }} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Dropdown suggestions */}
              {showBookDrop && bookSuggestions.length > 0 && (
                <div ref={bookDropRef} className="relative mt-1 z-50 rounded-xl border border-line bg-white shadow-xl dark:bg-dark-surface dark:border-dark-border overflow-hidden">
                  {bookSuggestions.map(copy => (
                    <button
                      key={copy.id}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); selectBookFromDrop(copy); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-teal-50 dark:hover:bg-teal/10 transition-colors text-left"
                    >
                      <BookCover title={copy.catalogue.title} subject={copy.catalogue.subject} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{copy.catalogue.title}</p>
                        <p className="text-xs text-slate dark:text-dark-muted">{copy.accessionNumber} · {copy.status}</p>
                        {copy.catalogue.author && <p className="text-xs text-slate/70 dark:text-dark-muted/70 truncate">{copy.catalogue.author}</p>}
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${copy.status === "AVAILABLE" ? "bg-success-bg text-success" : "bg-warn-bg text-warn"}`}>
                        {copy.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {bookInput.trim() && phase === "book" && !showBookDrop && !scanModeOn && (
                <button type="submit" disabled={loadingBook} className={`${primaryButtonClass} mt-2 w-full justify-center`}>
                  {loadingBook ? <><Loader2 className="h-4 w-4 animate-spin" />Looking up…</> : <><QrCode className="h-4 w-4" />Find Book</>}
                </button>
              )}
            </form>

            {bookErr && <div className="mt-3"><ErrorBanner message={bookErr} onDismiss={() => setBookErr(null)} /></div>}
          </div>

          {/* Copy detail + action buttons */}
          {copyInfo && phase === "confirm" && (
            <div className="rounded-xl border border-teal/30 bg-teal-50/30 p-5 space-y-4 dark:bg-dark-surface dark:border-teal/20">
              <div className="flex items-start gap-4">
                <BookCover title={copyInfo.catalogue.title} subject={copyInfo.catalogue.subject} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-ink dark:text-dark-text">{copyInfo.catalogue.title}</p>
                  {copyInfo.catalogue.author && <p className="text-sm text-slate">{copyInfo.catalogue.author}</p>}
                  <div className="flex items-center flex-wrap gap-2 mt-2 text-xs text-slate">
                    <span className="font-mono bg-white border border-line rounded px-1.5 py-0.5 dark:bg-dark-border dark:border-dark-border">{copyInfo.accessionNumber}</span>
                    <Badge variant={copyInfo.status === "AVAILABLE" ? "success" : "info"}>{copyInfo.status}</Badge>
                    <Badge variant={copyInfo.condition === "GOOD" || copyInfo.condition === "EXCELLENT" ? "success" : "warn"}>{copyInfo.condition}</Badge>
                  </div>
                  {copyInfo.catalogue.subject && (
                    <p className="text-xs text-slate mt-1">{copyInfo.catalogue.subject}</p>
                  )}
                </div>
              </div>

              {confirm && (
                <div className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${confirm.ok ? "bg-success-bg border border-success/20 text-success" : "bg-danger-bg border border-danger/20 text-danger"}`}>
                  {confirm.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                  {confirm.text}
                </div>
              )}

              {!confirm && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Fine warning — shown but doesn't hide the button; API enforces policy */}
                  {copyInfo.status === "AVAILABLE" && card?.status === "ACTIVE" && (card?.fineBalance ?? 0) > 0 && (
                    <p className="col-span-full text-xs text-warn flex items-center gap-1.5 bg-warn-bg border border-warn/20 rounded-lg px-3 py-2">
                      ⚠ Outstanding fine of KES {card!.fineBalance.toFixed(2)} — borrow may be blocked by policy.
                    </p>
                  )}
                  {copyInfo.status !== "AVAILABLE" && copyInfo.status !== "BORROWED" && (
                    <p className="col-span-full text-xs text-slate bg-paper border border-line rounded-lg px-3 py-2">
                      Copy is <span className="font-semibold">{copyInfo.status}</span> — cannot borrow or return.
                    </p>
                  )}
                  {copyInfo.status === "AVAILABLE" && card?.status === "ACTIVE" && (
                    <button onClick={() => handleAction("borrow")} disabled={actionLoading} className={primaryButtonClass + " justify-center"}>
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                      Borrow
                    </button>
                  )}
                  {copyInfo.status === "BORROWED" && (
                    <button onClick={() => handleAction("return")} disabled={actionLoading} className={`${primaryButtonClass} justify-center bg-success hover:bg-green-600`}>
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Return
                    </button>
                  )}
                  {copyInfo.status === "BORROWED" && (
                    <button onClick={() => handleAction("renew")} disabled={actionLoading} className={secondaryButtonClass + " justify-center"}>
                      Renew
                    </button>
                  )}
                  <button onClick={() => { setCopyInfo(null); setBookInput(""); setPhase("book"); }} className={secondaryButtonClass + " justify-center"}>
                    <X className="h-4 w-4" /> Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Idle hint */}
          {!cardData && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-teal/10 flex items-center justify-center mb-4">
                <QrCode className="h-8 w-8 text-teal/50" />
              </div>
              <p className="text-sm text-slate max-w-xs">Type a student admission number or name to identify them, then scan or type the book copy.</p>
            </div>
          )}

          {/* No book yet hint */}
          {cardData && !copyInfo && phase === "book" && (
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
