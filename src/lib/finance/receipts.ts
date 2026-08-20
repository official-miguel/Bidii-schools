/**
 * src/lib/finance/receipts.ts
 *
 * Sequential receipt number generation for the Fees & Ledger module.
 *
 * nextReceiptNumber — generates the next receipt number for a school, using a
 * Postgres advisory lock to prevent concurrent duplicate numbers.
 *
 * Advisory lock approach:
 *   pg_advisory_xact_lock(hashtext(schoolId)) is acquired at the start of
 *   the transaction and automatically released at commit/rollback. This
 *   serialises receipt-number generation for a school without a separate
 *   counter table or sequence per school. PgBouncer transaction-mode safe
 *   because the lock is scoped to the transaction.
 *
 * Receipt number format: `{prefix}{zero-padded-6-digit-sequence}`
 * e.g. "REC-000001", "REC-000002", …
 */

import { prisma } from "@/lib/prisma";

// The Prisma transaction client type
type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Generates the next receipt number for the given school, serialised via
 * a Postgres advisory transaction lock.
 *
 * MUST be called within a prisma.$transaction block.
 *
 * @param tx       - The active Prisma transaction client
 * @param schoolId - The school to generate the number for
 * @param prefix   - Receipt prefix from FinanceSettings (e.g. "REC-")
 */
export async function nextReceiptNumber(
  tx: PrismaTransactionClient,
  schoolId: string,
  prefix: string
): Promise<string> {
  // Acquire a transaction-scoped advisory lock keyed on the school's ID hash.
  // This serialises receipt number generation for this school — any concurrent
  // transaction trying the same lock waits until this one commits or rolls back.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}))`;

  // Find the highest existing receipt number for this school
  const last = await tx.payment.findFirst({
    where:   { schoolId },
    orderBy: { paidAt: "desc" },    // Most recent first is a good proxy
    select:  { receiptNumber: true },
  });

  let nextNum = 1;

  if (last?.receiptNumber) {
    // Strip the prefix and parse the numeric suffix
    const stripped = last.receiptNumber.startsWith(prefix)
      ? last.receiptNumber.slice(prefix.length)
      : last.receiptNumber;
    const parsed = parseInt(stripped, 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }

  return `${prefix}${String(nextNum).padStart(6, "0")}`;
}

/**
 * Same as nextReceiptNumber but for invoice numbers.
 * Uses the same advisory lock so invoices and receipts don't race each other.
 */
export async function nextInvoiceNumber(
  tx: PrismaTransactionClient,
  schoolId: string,
  prefix: string
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}))`;

  const last = await tx.invoice.findFirst({
    where:   { schoolId },
    orderBy: { generatedAt: "desc" },
    select:  { invoiceNumber: true },
  });

  let nextNum = 1;

  if (last?.invoiceNumber) {
    const stripped = last.invoiceNumber.startsWith(prefix)
      ? last.invoiceNumber.slice(prefix.length)
      : last.invoiceNumber;
    const parsed = parseInt(stripped, 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }

  return `${prefix}${String(nextNum).padStart(6, "0")}`;
}
