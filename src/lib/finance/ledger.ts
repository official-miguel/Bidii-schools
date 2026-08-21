/**
 * src/lib/finance/ledger.ts
 *
 * The single write path for all monetary events in the Fees & Ledger module.
 * Every caller (invoice run, payment posting, M-Pesa webhook, import processor)
 * uses postLedgerEntry — no route or service writes LedgerEntry directly.
 *
 * Balance delta rules:
 *   PAYMENT, CREDIT_ADJUSTMENT  → +amount  (reduces what student owes)
 *   INVOICE, DEBIT_ADJUSTMENT, OPENING_BALANCE → -amount  (increases what student owes)
 *
 * Uses SET LOCAL for PgBouncer-safe RLS:
 *   await tx.$executeRaw`SET LOCAL app.current_school_id = ${schoolId}`;
 */

import { LedgerEntry, LedgerEntryType, PaymentMethod } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

// The Prisma transaction client type
type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface LedgerPayload {
  schoolId:            string;
  studentId:           string;
  termId?:             string;
  entryType:           LedgerEntryType;
  amount:              Decimal;        // always positive
  description:         string;
  referenceId?:        string;
  referenceType?:      string;
  postedById:          string;
  mpesaTransactionId?: string;
  paymentMethod?:      PaymentMethod;
}

/**
 * Computes the balance delta for a ledger entry type.
 * PAYMENT and CREDIT_ADJUSTMENT increase the balance (positive = overpayment/credit).
 * INVOICE, DEBIT_ADJUSTMENT, and OPENING_BALANCE decrease it (negative = debt).
 */
export function balanceDelta(entryType: LedgerEntryType, amount: Decimal): Decimal {
  switch (entryType) {
    case "PAYMENT":
    case "CREDIT_ADJUSTMENT":
      return amount;              // positive — reduces what student owes
    case "INVOICE":
    case "DEBIT_ADJUSTMENT":
    case "OPENING_BALANCE":
      return amount.negated();   // negative — increases what student owes
    default:
      return new Decimal(0);
  }
}

/**
 * Posts an immutable ledger entry and atomically updates the student's
 * materialised finance account balance. Must be called inside a Prisma
 * transaction. Also recomputes the debtor flag for the student.
 *
 * SET LOCAL ensures the RLS session variable is scoped to this transaction
 * only — safe with PgBouncer connection pooling.
 */
export async function postLedgerEntry(
  tx: PrismaTransactionClient,
  payload: LedgerPayload
): Promise<LedgerEntry> {
  // 1. Set RLS session variable for this transaction (PgBouncer safe)
  await tx.$executeRawUnsafe(`SET LOCAL app.current_school_id = '${payload.schoolId}'`);

  // 2. Insert the immutable ledger row
  const entry = await tx.ledgerEntry.create({
    data: {
      schoolId:           payload.schoolId,
      studentId:          payload.studentId,
      termId:             payload.termId ?? null,
      entryType:          payload.entryType,
      amount:             payload.amount,
      description:        payload.description,
      referenceId:        payload.referenceId ?? null,
      referenceType:      payload.referenceType ?? null,
      postedById:         payload.postedById,
      mpesaTransactionId: payload.mpesaTransactionId ?? null,
      paymentMethod:      payload.paymentMethod ?? null,
      isVoided:           false,
    },
  });

  // 3. Compute the balance delta for this entry type
  const delta = balanceDelta(payload.entryType, payload.amount);

  // 4. Upsert the materialised finance account atomically.
  //    Some students may not have a StudentFinanceAccount row yet (finance setup
  //    not yet completed). Rather than hard-failing, we create the account
  //    on first use so any monetary event works regardless of setup status.
  await tx.studentFinanceAccount.upsert({
    where: {
      schoolId_studentId: {
        schoolId:  payload.schoolId,
        studentId: payload.studentId,
      },
    },
    create: {
      schoolId:       payload.schoolId,
      studentId:      payload.studentId,
      currentBalance: delta,
      totalInvoiced:  payload.entryType === "INVOICE" ? payload.amount : new Decimal(0),
      totalPaid:      payload.entryType === "PAYMENT" ? payload.amount : new Decimal(0),
      lastActivityAt: new Date(),
    },
    update: {
      currentBalance: { increment: delta },
      ...(payload.entryType === "INVOICE"
        ? { totalInvoiced: { increment: payload.amount } }
        : {}),
      ...(payload.entryType === "PAYMENT"
        ? { totalPaid: { increment: payload.amount } }
        : {}),
      lastActivityAt: new Date(),
    },
  });

  // 5. Recompute debtor flag (lazy import to avoid circular deps with debtor.ts)
  const { recomputeDebtorFlag } = await import("./debtor");
  await recomputeDebtorFlag(tx, payload.schoolId, payload.studentId);

  return entry;
}
