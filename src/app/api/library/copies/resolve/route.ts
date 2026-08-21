/**
 * GET /api/library/copies/resolve
 *
 * Unified copy-lookup for the circulation desk.
 * Accepts EITHER a signed QR token OR a human-typed book_number.
 * Both resolve to the same Copy row + its Catalogue parent.
 *
 * Query params (provide exactly one):
 *   ?token=<signed_qr_token>      — scanned from QR sticker
 *   ?bookNumber=BK-00042          — typed by librarian
 *
 * Success response (200):
 *   {
 *     copy: { id, bookNumber, accessionNumber, status, condition,
 *             archivedAt, catalogueId, createdAt },
 *     catalogue: { id, title, author, edition, level, subject,
 *                  form, bookNumber, totalCopies }
 *   }
 *
 * Error responses:
 *   400 — neither / both params supplied, or QR token is malformed
 *   401 — not authenticated
 *   403 — wrong school (token school_id ≠ user schoolId)
 *   404 — copy not found or token no longer current
 *   410 — copy has been archived/withdrawn
 *
 * Security:
 *   - QR path: verifyQrToken() checks HMAC + school binding, then we
 *     additionally confirm the stored qrToken matches exactly (reissue
 *     invalidation).
 *   - bookNumber path: scoped with WHERE schoolId = user.schoolId —
 *     no cross-school lookup possible.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { verifyQrToken } from "@/lib/library/qr";

async function guard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"))
  );
}

// Shared select shape for both lookup paths
const COPY_SELECT = {
  id:              true,
  bookNumber:      true,
  accessionNumber: true,
  qrToken:         true,   // needed for token-match check; stripped before response
  status:          true,
  condition:       true,
  archivedAt:      true,
  catalogueId:     true,
  createdAt:       true,
  catalogue: {
    select: {
      id:          true,
      title:       true,
      author:      true,
      edition:     true,
      level:       true,
      subject:     true,
      form:        true,
      bookNumber:  true,
      totalCopies: true,
    },
  },
} as const;

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const rawToken   = sp.get("token")?.trim();
  const bookNumber = sp.get("bookNumber")?.trim();

  if (!rawToken && !bookNumber)
    return NextResponse.json(
      { error: "Provide either ?token= or ?bookNumber=" },
      { status: 400 }
    );
  if (rawToken && bookNumber)
    return NextResponse.json(
      { error: "Provide only one of ?token or ?bookNumber, not both." },
      { status: 400 }
    );

  // ── QR token path ────────────────────────────────────────────────────────
  if (rawToken) {
    const result = verifyQrToken(rawToken, user.schoolId!);

    if (!result.valid) {
      const status = result.reason === "school_mismatch" ? 403 : 400;
      return NextResponse.json(
        { error: result.reason === "malformed"
            ? "QR token is malformed or has been tampered with."
            : result.reason === "bad_signature"
            ? "QR token signature is invalid."
            : "This QR code belongs to a different school." },
        { status }
      );
    }

    // Look up by copy_id from verified payload
    const copy = await prisma.libraryCopy.findFirst({
      where:  { id: result.payload.copy_id, schoolId: user.schoolId! },
      select: COPY_SELECT,
    });

    if (!copy)
      return NextResponse.json({ error: "Copy not found." }, { status: 404 });

    // Reissue check: stored token must match scanned token exactly
    if (copy.qrToken !== rawToken)
      return NextResponse.json(
        { error: "This QR code has been superseded. Please use the current sticker." },
        { status: 404 }
      );

    if (copy.archivedAt)
      return NextResponse.json(
        { error: "This copy has been withdrawn from circulation." },
        { status: 410 }
      );

    // Strip qrToken from response
    const { qrToken: _t, ...safeCopy } = copy;
    return NextResponse.json({ copy: safeCopy, catalogue: copy.catalogue });
  }

  // ── bookNumber path ───────────────────────────────────────────────────────
  const copy = await prisma.libraryCopy.findFirst({
    where: {
      schoolId:   user.schoolId!,
      bookNumber: { equals: bookNumber, mode: "insensitive" },
    },
    select: COPY_SELECT,
  });

  if (!copy)
    return NextResponse.json(
      { error: `No copy found with book number "${bookNumber}".` },
      { status: 404 }
    );

  if (copy.archivedAt)
    return NextResponse.json(
      { error: "This copy has been withdrawn from circulation." },
      { status: 410 }
    );

  const { qrToken: _t, ...safeCopy } = copy;
  return NextResponse.json({ copy: safeCopy, catalogue: copy.catalogue });
}
