/**
 * POST /api/library/copies/[id]/archive
 *
 * Soft-withdraw a single physical copy from circulation.
 * Only AVAILABLE or UNDER_REPAIR copies can be archived —
 * a currently-borrowed copy must be returned first.
 *
 * What happens:
 *   1. Verify the copy belongs to this school.
 *   2. Reject if the copy is BORROWED or RESERVED (must be resolved first).
 *   3. Set archivedAt = now, status = ARCHIVED, archiveReason = body.reason.
 *   4. Decrement LibraryCatalogue.totalCopies by 1.
 *   5. Write an ARCHIVED LibraryCirculationEvent for the audit trail.
 *   6. Emit SSE so open sessions can react.
 *
 * Request body (optional JSON):
 *   { reason?: string }  — human-readable reason stored on the copy row
 *
 * Response 200: { id, bookNumber, accessionNumber, status, archivedAt }
 * Response 409: copy is currently borrowed or reserved — cannot archive
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { recordCirculationEvent } from "@/lib/library/circulationEvents";
import { emitSSE } from "@/lib/sse";

async function manageGuard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"))
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = params;

  // Load copy — must belong to this school
  const copy = await prisma.libraryCopy.findFirst({
    where:   { id, schoolId: user.schoolId! },
    include: { catalogue: { select: { id: true, title: true, totalCopies: true } } },
  });

  if (!copy)
    return NextResponse.json({ error: "Copy not found." }, { status: 404 });

  if (copy.archivedAt)
    return NextResponse.json({ error: "This copy is already withdrawn." }, { status: 409 });

  // Block if the copy is currently out or reserved
  if (copy.status === "BORROWED")
    return NextResponse.json(
      { error: "This copy is currently borrowed. It must be returned before it can be withdrawn." },
      { status: 409 }
    );
  if (copy.status === "RESERVED")
    return NextResponse.json(
      { error: "This copy has an active reservation. Cancel the reservation first." },
      { status: 409 }
    );

  // Optional reason from request body
  let reason: string | null = null;
  try {
    const body = await req.json();
    reason = typeof body?.reason === "string" ? body.reason.trim() || null : null;
  } catch {
    // body is optional — ignore parse errors
  }

  const now = new Date();

  // Archive the copy + decrement catalogue totalCopies atomically
  const [updated] = await prisma.$transaction([
    prisma.libraryCopy.update({
      where: { id: copy.id },
      data:  {
        archivedAt:    now,
        archiveReason: reason ?? "Withdrawn by librarian",
        status:        "ARCHIVED",
      },
      select: {
        id: true, bookNumber: true, accessionNumber: true,
        status: true, archivedAt: true, catalogueId: true,
      },
    }),
    prisma.libraryCatalogue.update({
      where: { id: copy.catalogueId },
      data:  { totalCopies: { decrement: 1 } },
    }),
  ]);

  // Audit trail
  await recordCirculationEvent({
    schoolId:      user.schoolId!,
    eventType:     "ARCHIVED",
    copyId:        copy.id,
    catalogueId:   copy.catalogueId,
    performedById: user.id,
    payload: {
      bookNumber:      copy.bookNumber,
      accessionNumber: copy.accessionNumber,
      title:           copy.catalogue?.title,
      reason:          reason ?? "Withdrawn by librarian",
    },
  });

  emitSSE(user.schoolId!, "libraryCopy.archived", {
    copyId:      copy.id,
    catalogueId: copy.catalogueId,
  });

  return NextResponse.json(updated);
}
