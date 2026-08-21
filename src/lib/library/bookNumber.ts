/**
 * src/lib/library/bookNumber.ts
 *
 * Sequential, school-scoped book_number generator for physical copies.
 *
 * Format: BK-NNNNN  (5-digit zero-padded, school-scoped)
 *   e.g. BK-00001, BK-00042, BK-10000
 *
 * Rules:
 *   - Sequential per school — the next number is always max(existing) + 1.
 *   - Never reused — withdrawn/archived copies keep their number forever.
 *   - Collisions in concurrent bulk imports are prevented by a DB-level
 *     unique constraint (@@unique([schoolId, bookNumber]) on LibraryCopy).
 *     On P2002 the caller should retry with a freshly generated number.
 *
 * Two modes:
 *   1. nextBookNumber(schoolId)           — single next value (for one copy)
 *   2. bookNumberSequencer(schoolId)      — factory that returns a closure
 *      incrementing a locally-cached counter; safe for sequential loops
 *      within a single request (no parallel DB calls between iterations).
 */

import { prisma } from "@/lib/prisma";

const PREFIX = "BK";

function format(seq: number): string {
  return `${PREFIX}-${String(seq).padStart(5, "0")}`;
}

function parseSeq(bookNumber: string): number {
  const match = bookNumber.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

// ---------------------------------------------------------------------------
// nextBookNumber — single next value
// ---------------------------------------------------------------------------

/**
 * Look up the highest existing book_number for the school and return the
 * next formatted value.  Does NOT persist anything — caller must write it.
 */
export async function nextBookNumber(schoolId: string): Promise<string> {
  const last = await prisma.libraryCopy.findFirst({
    where: {
      schoolId,
      bookNumber: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select:  { bookNumber: true },
  });

  const seq = last?.bookNumber ? parseSeq(last.bookNumber) + 1 : 1;
  return format(seq);
}

// ---------------------------------------------------------------------------
// bookNumberSequencer — bulk-import factory
// ---------------------------------------------------------------------------

/**
 * Pre-fetch the current max sequence for the school, then return a
 * zero-argument closure that hands out the next formatted number on each
 * call.  Use this inside a loop to avoid N database calls:
 *
 *   const next = await bookNumberSequencer(schoolId);
 *   for (const row of rows) {
 *     const bn = next();   // BK-00001, BK-00002, ...
 *   }
 */
export async function bookNumberSequencer(
  schoolId: string
): Promise<() => string> {
  const last = await prisma.libraryCopy.findFirst({
    where: {
      schoolId,
      bookNumber: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select:  { bookNumber: true },
  });

  let seq = last?.bookNumber ? parseSeq(last.bookNumber) + 1 : 1;

  return () => format(seq++);
}
