/**
 * GET /api/library/copies/qr-data
 *
 * Returns copy metadata + qrToken for browser-side QR rendering.
 * Scoped to user.schoolId — no IDOR possible.
 *
 * Query params (at least one required):
 *   ?catalogueId=xxx        — all active copies for one catalogue entry
 *   ?copyIds=id1,id2,...    — up to 200 specific copy IDs
 *
 * Response: { copies: CopyQrRecord[], catalogue: { title, bookNumber } }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function guard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"))
  );
}

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp          = req.nextUrl.searchParams;
  const catalogueId = sp.get("catalogueId");
  const copyIdsRaw  = sp.get("copyIds");

  if (!catalogueId && !copyIdsRaw)
    return NextResponse.json({ error: "Provide ?catalogueId= or ?copyIds=" }, { status: 400 });

  const baseWhere = {
    schoolId:   user.schoolId!,
    archivedAt: null,
    ...(catalogueId
      ? { catalogueId }
      : {
          id: {
            in: (copyIdsRaw ?? "")
              .split(",")
              .map(s => s.trim())
              .filter(Boolean)
              .slice(0, 200),
          },
        }),
  };

  const copies = await prisma.libraryCopy.findMany({
    where:   baseWhere,
    orderBy: { bookNumber: "asc" },
    select: {
      id:              true,
      bookNumber:      true,
      accessionNumber: true,
      qrToken:         true,
      status:          true,
      catalogue: { select: { id: true, title: true, bookNumber: true } },
    },
  });

  if (copies.length === 0)
    return NextResponse.json({ error: "No copies found." }, { status: 404 });

  // Only return copies that have a signed token (legacy rows need /reissue-qr first)
  const printable = copies.filter(c => c.qrToken);

  return NextResponse.json({
    catalogue: copies[0]?.catalogue ?? null,
    copies: printable.map(c => ({
      id:              c.id,
      bookNumber:      c.bookNumber,
      accessionNumber: c.accessionNumber,
      qrToken:         c.qrToken,
      status:          c.status,
      title:           c.catalogue?.title ?? "",
    })),
    skipped: copies.length - printable.length,
  });
}
