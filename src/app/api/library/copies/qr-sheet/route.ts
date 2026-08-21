/**
 * GET /api/library/copies/qr-sheet
 *
 * Generate a printable PDF of QR sticker labels for one or more copies.
 * Each label contains:
 *   - QR code image (encodes the signed qrToken)
 *   - bookNumber  (BK-NNNNN)  — human-readable, large text
 *   - short title (truncated to 28 chars)
 *   - accessionNumber (small, for librarian reference)
 *
 * Layout: 3 columns × N rows on A4, 62 mm × 38 mm stickers.
 *
 * Query params:
 *   ?copyIds=id1,id2,id3    — up to 200 copy IDs (comma-separated)
 *   ?catalogueId=xxx        — all active copies for one catalogue entry
 *
 * At least one of the two params is required.
 * The resulting PDF is streamed as application/pdf.
 *
 * Security:
 *   - Requires LIBRARY manage permission (same as copy registration).
 *   - All copy IDs are validated against user.schoolId (no IDOR).
 *   - qrToken is read from DB — never from request params.
 */

import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function manageGuard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"))
  );
}

// ---------------------------------------------------------------------------
// Sticker layout constants (points — 1 pt ≈ 0.353 mm)
// ---------------------------------------------------------------------------

const PT   = 72 / 25.4; // points per mm
const PAGE_W  = 595.28; // A4 width  (pts)
const PAGE_H  = 841.89; // A4 height (pts)
const MARGIN  = 15 * PT;

// Sticker size: 62 mm × 38 mm
const STICKER_W = 62 * PT;
const STICKER_H = 38 * PT;
const COLS      = 3;
const GAP_X     = ((PAGE_W - 2 * MARGIN) - COLS * STICKER_W) / (COLS - 1);
const GAP_Y     = 4 * PT;

// Within a sticker
const QR_SIZE    = 30 * PT;   // QR image region
const QR_PAD     = 3 * PT;    // padding around QR
const TEXT_X_OFF = QR_SIZE + 2 * QR_PAD;  // text starts after QR
const TEXT_W     = STICKER_W - TEXT_X_OFF - QR_PAD;

// ---------------------------------------------------------------------------
// Helper: render one QR sticker onto the PDF
// ---------------------------------------------------------------------------

async function drawSticker(
  doc:    PDFKit.PDFDocument,
  x:      number,
  y:      number,
  sticker: {
    qrToken:         string;
    bookNumber:      string | null;
    accessionNumber: string;
    title:           string;
  }
): Promise<void> {
  // Border
  doc
    .rect(x, y, STICKER_W, STICKER_H)
    .stroke("#dddddd");

  // QR code — encode the signed token so scanning resolves to this exact copy
  const qrDataUrl = await QRCode.toDataURL(sticker.qrToken, {
    errorCorrectionLevel: "M",
    margin:               0,
    width:                Math.round(QR_SIZE),
  });
  const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");
  const qrBuf    = Buffer.from(qrBase64, "base64");

  doc.image(qrBuf, x + QR_PAD, y + QR_PAD, {
    width:  QR_SIZE,
    height: QR_SIZE,
  });

  const tx = x + TEXT_X_OFF;
  let   ty = y + QR_PAD;

  // bookNumber — large, bold
  if (sticker.bookNumber) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#000000")
      .text(sticker.bookNumber, tx, ty, { width: TEXT_W, lineBreak: false });
    ty += 13;
  }

  // Short title
  const shortTitle = sticker.title.length > 28
    ? sticker.title.slice(0, 26) + "…"
    : sticker.title;
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#333333")
    .text(shortTitle, tx, ty, { width: TEXT_W });
  ty += doc.currentLineHeight() + 2;

  // Accession number — small, muted
  doc
    .font("Helvetica")
    .fontSize(6)
    .fillColor("#888888")
    .text(sticker.accessionNumber, tx, ty, { width: TEXT_W, lineBreak: false });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp          = req.nextUrl.searchParams;
  const copyIdsRaw  = sp.get("copyIds");
  const catalogueId = sp.get("catalogueId");

  if (!copyIdsRaw && !catalogueId)
    return NextResponse.json(
      { error: "Provide ?copyIds= or ?catalogueId=" },
      { status: 400 }
    );

  let whereClause: Parameters<typeof prisma.libraryCopy.findMany>[0]["where"] = {
    schoolId:  user.schoolId!,
    archivedAt: null,
  };

  if (copyIdsRaw) {
    const ids = copyIdsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);
    if (ids.length === 0)
      return NextResponse.json({ error: "No valid copy IDs supplied." }, { status: 400 });
    whereClause = { ...whereClause, id: { in: ids } };
  } else if (catalogueId) {
    whereClause = { ...whereClause, catalogueId };
  }

  const copies = await prisma.libraryCopy.findMany({
    where:   whereClause,
    orderBy: { bookNumber: "asc" },
    select: {
      id:              true,
      bookNumber:      true,
      accessionNumber: true,
      qrToken:         true,
      catalogue: { select: { title: true } },
    },
  });

  if (copies.length === 0)
    return NextResponse.json({ error: "No copies found." }, { status: 404 });

  // Copies with no qrToken yet (legacy rows) — skip or mint on-the-fly?
  // We skip them to avoid side effects in a GET; caller should POST /reissue-qr first.
  const printable = copies.filter((c) => c.qrToken);

  if (printable.length === 0)
    return NextResponse.json(
      {
        error:
          "None of the selected copies have a signed QR token yet. " +
          "Use POST /api/library/copies/[id]/reissue-qr to generate tokens for legacy copies.",
      },
      { status: 422 }
    );

  // ── Build PDF ─────────────────────────────────────────────────────────────
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      size:    "A4",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
      bufferPages: true,
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end",  resolve);
    doc.on("error", reject);

    (async () => {
      let col = 0;
      let row = 0;

      for (const copy of printable) {
        const x = MARGIN + col * (STICKER_W + GAP_X);
        const y = MARGIN + row * (STICKER_H + GAP_Y);

        await drawSticker(doc, x, y, {
          qrToken:         copy.qrToken!,
          bookNumber:      copy.bookNumber,
          accessionNumber: copy.accessionNumber,
          title:           copy.catalogue?.title ?? "",
        });

        col++;
        if (col >= COLS) {
          col = 0;
          row++;
          const maxRows = Math.floor((PAGE_H - 2 * MARGIN) / (STICKER_H + GAP_Y));
          if (row >= maxRows) {
            doc.addPage();
            row = 0;
          }
        }
      }

      doc.end();
    })().catch(reject);
  });

  const pdfBuffer = Buffer.concat(chunks);

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="qr-stickers-${Date.now()}.pdf"`,
      "Content-Length":      String(pdfBuffer.length),
      "Cache-Control":       "no-store",
    },
  });
}
