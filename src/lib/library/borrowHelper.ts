/**
 * src/lib/library/borrowHelper.ts
 *
 * Shared helper for loading a LibraryBorrow with all required relations.
 * Every circulation API route should use this instead of a bare
 * prisma.libraryBorrow.findFirst without includes, which causes runtime
 * crashes when accessing borrow.card.studentId or borrow.copy.catalogue.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export type BorrowWithRelations = Prisma.LibraryBorrowGetPayload<{
  include: {
    card: { include: { student: true } };
    copy: { include: { catalogue: true } };
  };
}>;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load a LibraryBorrow with card → student and copy → catalogue relations.
 * Returns null when no matching row exists for the given borrowId and schoolId.
 */
export async function loadBorrowWithRelations(
  borrowId: string,
  schoolId: string
): Promise<BorrowWithRelations | null> {
  return prisma.libraryBorrow.findFirst({
    where: { id: borrowId, schoolId },
    include: {
      card: { include: { student: true } },
      copy: { include: { catalogue: true } },
    },
  });
}
