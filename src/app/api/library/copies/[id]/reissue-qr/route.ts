/**
 * POST /api/library/copies/[id]/reissue-qr
 *
 * Mint a new signed QR token for a copy whose sticker has been damaged or lost.
 *
 * What happens:
 *   1. Verify the copy exists and belongs to this school.
 *   2. Mint a fresh HMAC-signed token for the same copy_id.
 *   3. Overwrite LibraryCopy.qrToken + qrIssuedAt in DB (atomically).
 *   4. Write a QR_REISSUED LibraryCirculationEvent for auditability.
 *   5. Emit SSE so open dashboard sessions can react.
 *
 * The old token is implicitly invalidated: the resolve endpoint always
 * compares the scanned token against the DB-stored qrToken and rejects
 * any token that no longer matches.
 *
 * bookNumber is intentionally NOT changed — the copy's identity is stable.
 *
 * Response:
 *   { copyId, bookNumber, qrToken, qrIssuedAt }
 *   — qrToken is returned ONCE here so the caller can generate the sticker.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { mintQrToken } from "@/lib/library/qr";
import { recordCirculationEvent } from "@/lib/library/circulationEvents";
import { emitSSE } from "@/lib/sse";

async function manageGuard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"))
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = params;

  // Load copy — must belong to this school
  const copy = await prisma.libraryCopy.findFirst({
    where:   { id, schoolId: user.schoolId! },
    include: { catalogue: { select: { id: true, title: true } } },
  });
  if (!copy) return NextResponse.json({ error: "Copy not found." }, { status: 404 });

  // Mint fresh signed token (same copy_id, new issued_at)
  const newToken    = mintQrToken(copy.id, user.schoolId!);
  const qrIssuedAt  = new Date();

  // Persist atomically
  const updated = await prisma.libraryCopy.update({
    where: { id: copy.id },
    data:  { qrToken: newToken, qrIssuedAt },
    select: {
      id: true, bookNumber: true, accessionNumber: true,
      qrToken: true, qrIssuedAt: true,
      catalogueId: true,
    },
  });

  // Audit trail
  await recordCirculationEvent({
    schoolId:     user.schoolId!,
    eventType:    "QR_REISSUED",
    copyId:       copy.id,
    catalogueId:  copy.catalogueId,
    performedById: user.id,
    payload: {
      bookNumber:      copy.bookNumber,
      accessionNumber: copy.accessionNumber,
      title:           copy.catalogue?.title,
      reason:          "sticker_reissue",
    },
  });

  emitSSE(user.schoolId!, "libraryCopy.qrReissued", {
    copyId:       copy.id,
    bookNumber:   copy.bookNumber,
    catalogueId:  copy.catalogueId,
  });

  return NextResponse.json({
    copyId:          updated.id,
    bookNumber:      updated.bookNumber,
    accessionNumber: updated.accessionNumber,
    qrToken:         updated.qrToken,  // returned once for sticker printing
    qrIssuedAt:      updated.qrIssuedAt,
  });
}
