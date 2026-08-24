/**
 * src/lib/library/autoAssign.ts
 *
 * Shared tryAutoAssign helper.
 * Called within DB transactions by:
 *   - Return route (after AVAILABLE copy)
 *   - Reservations [id] PATCH/DELETE (after cancellation releases a copy)
 *   - Expiry cron (after expired ACTIVE reservation releases a copy)
 *
 * IMPORTANT: Pass the transactional Prisma client (tx) so the read/writes
 * are part of the caller's transaction. Never use the global prisma here.
 *
 * NOTE: LibraryReservation does not have a student relation in the schema
 * (only studentId). The caller is responsible for resolving studentName
 * from studentId if needed for SSE payloads.
 */

import { Prisma } from "@prisma/client";

// The transactional client type used inside prisma.$transaction
type TxClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface AutoAssignResult {
  activated: boolean;
  reservation?: {
    id:          string;
    studentId:   string | null;
    catalogueId: string;
  };
}

/**
 * Find the next PENDING INDIVIDUAL reservation for a catalogue, activate it,
 * and mark the copy as RESERVED — all within the caller's transaction.
 *
 * Returns { activated: false } when no PENDING reservation exists.
 * Returns { activated: true, reservation } when one is found and promoted.
 */
export async function tryAutoAssign(
  catalogueId: string,
  copyId: string,
  schoolId: string,
  tx: TxClient
): Promise<AutoAssignResult> {
  const next = await tx.libraryReservation.findFirst({
    where: {
      catalogueId,
      schoolId,
      status:          "PENDING",
      reservationType: "INDIVIDUAL",
    },
    orderBy: [
      { queuePosition: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
  });

  if (!next) return { activated: false };

  await tx.libraryReservation.update({
    where: { id: next.id },
    data:  { status: "ACTIVE", allocatedCopyId: copyId },
  });

  await tx.libraryCopy.update({
    where: { id: copyId },
    data:  { status: "RESERVED" },
  });

  return {
    activated: true,
    reservation: {
      id:          next.id,
      studentId:   next.studentId,
      catalogueId: next.catalogueId,
    },
  };
}
