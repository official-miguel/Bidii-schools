/**
 * src/lib/finance/void.ts
 *
 * The single reversal path for the Fees & Ledger module — the counterpart to
 * postLedgerEntry.
 *
 * Why voiding rather than deleting: the ledger is an immutable audit trail.
 * A mis-posted entry is never removed; it is flagged `isVoided` and its effect
 * on the materialised StudentFinanceAccount is backed out, so the cache keeps
 * matching computeBalance() — which sums only non-voided entries.
 *
 * The exact invariant this preserves:
 *
 *   StudentFinanceAccount.currentBalance
 *     === Σ balanceDelta(entryType, amount) over entries WHERE isVoided = false
 *
 * so voiding must decrement by precisely the delta that posting incremented by,
 * and back out totalInvoiced / totalPaid on the same terms reconcileBalance
 * recomputes them.
 *
 * A PAYMENT entry also has a Payment receipt row. That row is flagged too, in
 * the same transaction, because some reports (payment-volume) read Payment
 * directly and would otherwise still count a reversed payment.
 */

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { balanceDelta } from "./ledger";

type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface VoidLedgerEntryPayload {
  schoolId:   string;
  entryId:    string;
  /** User performing the reversal — recorded in AuditLog. */
  voidedById: string;
  /** Free-text justification. Required: a reversal is never anonymous. */
  reason:     string;
}

export type VoidFailureCode = "NOT_FOUND" | "ALREADY_VOIDED";

export class VoidLedgerEntryError extends Error {
  constructor(public readonly code: VoidFailureCode, message: string) {
    super(message);
    this.name = "VoidLedgerEntryError";
  }
}

/**
 * Voids one ledger entry and backs its effect out of the student's balance.
 * Must be called inside a Prisma transaction.
 *
 * Throws VoidLedgerEntryError for the two expected business failures so the
 * caller can map them to 404 / 409 without string-matching.
 */
export async function voidLedgerEntry(
  tx: PrismaTransactionClient,
  payload: VoidLedgerEntryPayload
) {
  const { schoolId, entryId, voidedById, reason } = payload;

  // Match postLedgerEntry: scope the RLS session variable to this transaction.
  const safeSchoolId = schoolId.replace(/[^a-zA-Z0-9_\-]/g, "");
  await tx.$executeRawUnsafe(`SET LOCAL "app.current_school_id" = '${safeSchoolId}'`);

  // 1. Load the entry, bound to the caller's school so one school can never
  //    void another's row even with a guessed id.
  const entry = await tx.ledgerEntry.findFirst({
    where: { id: entryId, schoolId },
  });

  if (!entry) {
    throw new VoidLedgerEntryError("NOT_FOUND", "Ledger entry not found.");
  }
  if (entry.isVoided) {
    // Idempotency guard: voiding twice would double-subtract the delta and
    // silently corrupt the balance.
    throw new VoidLedgerEntryError("ALREADY_VOIDED", "This entry has already been voided.");
  }

  const amount = new Decimal(entry.amount.toString());

  // 2. Flag the entry. The row itself is never mutated beyond these fields.
  await tx.ledgerEntry.update({
    where: { id: entry.id },
    data:  { isVoided: true, voidedAt: new Date(), voidReason: reason },
  });

  // 3. Back the entry out of the materialised account. Negating the original
  //    delta is what keeps currentBalance equal to computeBalance().
  const reversal = balanceDelta(entry.entryType, amount).negated();

  await tx.studentFinanceAccount.update({
    where: { schoolId_studentId: { schoolId, studentId: entry.studentId } },
    data: {
      currentBalance: { increment: reversal },
      ...(entry.entryType === "INVOICE"
        ? { totalInvoiced: { decrement: amount } }
        : {}),
      ...(entry.entryType === "PAYMENT"
        ? { totalPaid: { decrement: amount } }
        : {}),
      lastActivityAt: new Date(),
    },
  });

  // 4. Flag the matching Payment receipt, if this entry has one.
  //
  //    M-Pesa entries carry the transaction id; manual payments reference the
  //    receipt number. Both columns are unique, so at most one row matches.
  let voidedPaymentId: string | null = null;

  if (entry.mpesaTransactionId) {
    const updated = await tx.payment.updateMany({
      where: { schoolId, mpesaTransactionId: entry.mpesaTransactionId },
      data:  { isVoided: true },
    });
    if (updated.count > 0) voidedPaymentId = entry.mpesaTransactionId;
  } else if (entry.referenceType === "PAYMENT" && entry.referenceId) {
    const updated = await tx.payment.updateMany({
      where: { schoolId, receiptNumber: entry.referenceId },
      data:  { isVoided: true },
    });
    if (updated.count > 0) voidedPaymentId = entry.referenceId;
  }

  // 5. The student may have crossed the debtor threshold in either direction.
  const { recomputeDebtorFlag } = await import("./debtor");
  await recomputeDebtorFlag(tx, schoolId, entry.studentId);

  // 6. Audit trail — this is where "who" and "why" live.
  await tx.auditLog.create({
    data: {
      schoolId,
      action: "FINANCE_LEDGER_VOIDED",
      detail: {
        ledgerEntryId: entry.id,
        studentId:     entry.studentId,
        entryType:     entry.entryType,
        amount:        amount.toString(),
        reversalDelta: reversal.toString(),
        description:   entry.description,
        voidedPaymentId,
        reason,
      },
      performedById: voidedById,
    },
  });

  return { entry, reversal };
}
