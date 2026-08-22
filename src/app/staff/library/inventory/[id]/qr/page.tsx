"use client";

/**
 * /staff/library/inventory/[id]/qr
 *
 * In-browser QR sticker sheet.
 * Fetches all active copies for a catalogue entry, renders each copy's
 * signed qrToken as a scannable QR image using the `qrcode` package,
 * and provides a Print button that opens the browser print dialog with
 * a clean sticker-grid layout (no nav, no buttons).
 *
 * Each sticker shows:
 *   - QR code image (encodes the signed qrToken)
 *   - bookNumber  (BK-NNNNN)
 *   - accessionNumber (ACC-NNNNN)
 *   - Truncated book title
 *   - Status badge (so librarian can spot unavailable copies at a glance)
 *
 * Print layout: 3 columns on A4, ~62 mm × 38 mm per sticker.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft, Printer, RefreshCw, AlertTriangle, Loader2 } from "lucide-react";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface CopyQrRecord {
  id:              string;
  bookNumber:      string | null;
  accessionNumber: string;
  qrToken:         string | null;
  status:          string;
  title:           string;
}

// ── Single sticker component ───────────────────────────────────────────────

function QRSticker({ copy }: { copy: CopyQrRecord }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!copy.qrToken || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, copy.qrToken, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 110,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(() => setError(true));
  }, [copy.qrToken]);

  const statusColor =
    copy.status === "AVAILABLE"  ? "#0f766e" :
    copy.status === "BORROWED"   ? "#0369a1" :
    copy.status === "RESERVED"   ? "#b45309" : "#64748b";

  const shortTitle = copy.title.length > 30
    ? copy.title.slice(0, 28) + "…"
    : copy.title;

  return (
    <div className="sticker" style={{
      display: "flex", alignItems: "center", gap: "6px",
      border: "1px solid #d1d5db",
      borderRadius: "6px",
      padding: "6px",
      width: "100%",
      boxSizing: "border-box",
      backgroundColor: "#fff",
      pageBreakInside: "avoid",
      breakInside: "avoid",
    }}>
      {/* QR image */}
      <div style={{ flexShrink: 0 }}>
        {error ? (
          <div style={{ width: 110, height: 110, display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", borderRadius: 4 }}>
            <AlertTriangle size={24} color="#ef4444" />
          </div>
        ) : (
          <canvas ref={canvasRef} style={{ display: "block", borderRadius: 4 }} />
        )}
      </div>

      {/* Text info */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, fontFamily: "monospace", color: "#111827", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {copy.bookNumber ?? copy.accessionNumber}
        </p>
        {copy.bookNumber && (
          <p style={{ margin: "2px 0 0", fontSize: "9px", fontFamily: "monospace", color: "#6b7280" }}>
            {copy.accessionNumber}
          </p>
        )}
        <p style={{ margin: "4px 0 0", fontSize: "9px", color: "#374151", lineHeight: 1.3 }}>
          {shortTitle}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: "8px", fontWeight: 600, color: statusColor, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {copy.status}
        </p>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function QRStickerPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [copies,    setCopies]    = useState<CopyQrRecord[]>([]);
  const [title,     setTitle]     = useState("QR Stickers");
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [skipped,   setSkipped]   = useState(0);
  const [reissuing, setReissuing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res  = await fetch(`/api/library/copies/qr-data?catalogueId=${id}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) { setError(json.error ?? "Failed to load copies."); return; }
    setCopies(json.copies ?? []);
    setSkipped(json.skipped ?? 0);
    setTitle(json.catalogue?.title ?? "QR Stickers");
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Reissue tokens for all copies that are missing one then reload
  const handleReissueAll = async () => {
    setReissuing(true);
    // Fetch ALL copies (including those without tokens) to find their IDs
    const res  = await fetch(`/api/library/copies?catalogueId=${id}`);
    const list = await res.json() as { id: string; qrToken?: string | null }[];
    const needToken = (Array.isArray(list) ? list : []).filter(c => !c.qrToken);
    await Promise.all(
      needToken.map(c =>
        fetch(`/api/library/copies/${c.id}/reissue-qr`, { method: "POST" })
      )
    );
    setReissuing(false);
    load();
  };

  const handlePrint = () => window.print();

  return (
    <>
      {/* ── Print stylesheet injected via <style> ───────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          .sticker-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            padding: 12mm;
          }
        }
        @media screen {
          .sticker-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 12px;
          }
        }
      `}</style>

      {/* ── Screen-only toolbar ─────────────────────────────────────── */}
      <div className="no-print mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className={secondaryButtonClass}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div>
            <h1 className="text-lg font-bold text-ink dark:text-dark-text">{title}</h1>
            <p className="text-sm text-slate dark:text-dark-muted">
              {loading ? "Loading…" : `${copies.length} sticker${copies.length !== 1 ? "s" : ""} ready to print`}
              {skipped > 0 && ` · ${skipped} cop${skipped > 1 ? "ies" : "y"} missing QR token`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {skipped > 0 && (
            <button
              onClick={handleReissueAll}
              disabled={reissuing}
              className={secondaryButtonClass}
              title="Generate QR tokens for copies that are missing one"
            >
              {reissuing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
              {reissuing ? "Generating…" : "Generate missing QR codes"}
            </button>
          )}
          <button
            onClick={handlePrint}
            disabled={loading || copies.length === 0}
            className={primaryButtonClass}
          >
            <Printer className="h-4 w-4" /> Print Stickers
          </button>
        </div>
      </div>

      {/* ── States ──────────────────────────────────────────────────── */}
      {loading && (
        <div className="no-print flex items-center justify-center py-24 gap-3 text-slate">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading copies…
        </div>
      )}

      {!loading && error && (
        <div className="no-print rounded-xl border border-danger/30 bg-danger/5 p-6 text-center text-sm text-danger">
          <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
          {error}
        </div>
      )}

      {!loading && !error && copies.length === 0 && (
        <div className="no-print flex flex-col items-center justify-center py-24 gap-3 text-slate text-sm">
          <AlertTriangle className="h-8 w-8" />
          <p>No printable QR codes found.</p>
          {skipped > 0 && (
            <p className="text-xs">
              {skipped} cop{skipped > 1 ? "ies are" : "y is"} missing a QR token.
            </p>
          )}
          <button onClick={handleReissueAll} disabled={reissuing} className={primaryButtonClass}>
            {reissuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {reissuing ? "Generating…" : "Generate QR codes now"}
          </button>
        </div>
      )}

      {/* ── Sticker grid ────────────────────────────────────────────── */}
      {!loading && copies.length > 0 && (
        <div className="sticker-grid">
          {copies.map(copy => (
            <QRSticker key={copy.id} copy={copy} />
          ))}
        </div>
      )}
    </>
  );
}
