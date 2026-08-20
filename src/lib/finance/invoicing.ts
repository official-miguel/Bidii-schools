/**
 * src/lib/finance/invoicing.ts
 *
 * Batch invoicing engine for the Fees & Ledger module.
 *
 * runBatchInvoicing — processes all non-archived students for a term,
 * generating one Invoice + one LedgerEntry per student. Idempotent:
 * students who already have an invoice for the term are skipped.
 *
 * Fee structure specificity (most-specific wins):
 *   1. form + stream + boardingStatus  (all three match)
 *   2. form + stream + boardingStatus=null
 *   3. form + stream=null + boardingStatus  (exact boarding)
 *   4. form + stream=null + boardingStatus=null  (form only)
 */

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { postLedgerEntry } from "./ledger";
import { nextInvoiceNumber } from "./receipts";
import { computeProratedAmount } from "./proration";

export interface BatchInvoicingResult {
  succeeded: number;
  skipped:   number;
  errors:    Array<{ studentId: string; admissionNumber: string; reason: string }>;
}

export interface BatchError {
  studentId:       string;
  admissionNumber: string;
  reason:          string;
}

/**
 * Selects the most-specific FeeStructure for a student's form/stream/boardingStatus.
 * Returns null if no matching structure is found.
 */
function selectFeeStructure(
  structures: Array<{
    id: string;
    form: number;
    stream: string | null;
    boardingStatus: string | null;
    amountPerTerm: Decimal;
  }>,
  form: number,
  stream: string | null,
  boardingStatus: string | null
) {
  // Score: higher = more specific match
  // stream match = +2, boardingStatus match = +1
  const scored = structures
    .filter((s) => s.form === form)
    .filter((s) => s.stream === null || s.stream === stream)
    .filter((s) => s.boardingStatus === null || s.boardingStatus === boardingStatus)
    .map((s) => ({
      structure: s,
      score:
        (s.stream        !== null ? 2 : 0) +
        (s.boardingStatus !== null ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.structure ?? null;
}

/**
 * Runs the batch invoicing job for a term.
 *
 * For each non-archived student in the school:
 *  1. Skip if an Invoice already exists for (studentId, termId).
 *  2. Select the best-matching FeeStructure.
 *  3. Sum all active (non-detached) StudentExpenseAttachment prices.
 *  4. Create Invoice + LedgerEntry(INVOICE) + FinanceNotification — all in one transaction per student.
 *  5. Record errors for students without a matching fee structure but continue processing.
 */
export async function runBatchInvoicing(
  termId:   string,
  schoolId: string,
  userId:   string
): Promise<BatchInvoicingResult> {
  // Load term details
  const term = await prisma.term.findUnique({
    where: { id: termId },
    select: { id: true, name: true, startDate: true, endDate: true, academicYear: true, schoolId: true },
  });

  if (!term || term.schoolId !== schoolId) {
    throw new Error("Term not found or does not belong to this school.");
  }

  // Load all fee structures for this school
  const allStructures = await prisma.feeStructure.findMany({
    where:  { schoolId },
    select: { id: true, form: true, stream: true, boardingStatus: true, amountPerTerm: true },
  });

  // Load all non-archived students with their class info
  const students = await prisma.student.findMany({
    where: { schoolId, archivedAt: null },
    select: {
      id: true,
      admissionNumber: true,
      fullName: true,
      boardingStatus: true,
      schoolClass: { select: { form: true, stream: true } },
    },
  });

  // Load all active expense attachments for this school (non-detached)
  const attachments = await prisma.studentExpenseAttachment.findMany({
    where:   { schoolId, detachedAt: null },
    select:  {
      studentId:   true,
      expenseItem: { select: { currentPrice: true, name: true } },
    },
  });

  // Index attachments by studentId for O(1) lookup
  const attachmentsByStudent = new Map<string, Array<{ name: string; price: Decimal }>>();
  for (const a of attachments) {
    const list = attachmentsByStudent.get(a.studentId) ?? [];
    list.push({ name: a.expenseItem.name, price: new Decimal(a.expenseItem.currentPrice.toString()) });
    attachmentsByStudent.set(a.studentId, list);
  }

  // Check which students already have invoices for this term (idempotency)
  const existingInvoices = await prisma.invoice.findMany({
    where:  { schoolId, termId },
    select: { studentId: true },
  });
  const alreadyInvoiced = new Set(existingInvoices.map((i) => i.studentId));

  // Load finance settings for invoice prefix
  const settings = await prisma.financeSettings.findUnique({
    where:  { schoolId },
    select: { invoicePrefix: true },
  });
  const invoicePrefix = settings?.invoicePrefix ?? "INV-";

  const result: BatchInvoicingResult = { succeeded: 0, skipped: 0, errors: [] };

  for (const student of students) {
    // Skip already-invoiced students (idempotency)
    if (alreadyInvoiced.has(student.id)) {
      result.skipped++;
      continue;
    }

    const form    = student.schoolClass.form;
    const stream  = student.schoolClass.stream ?? null;
    const boarding = student.boardingStatus ?? null;

    // Select the best-matching fee structure
    const structure = selectFeeStructure(allStructures, form, stream, boarding);

    if (!structure) {
      result.errors.push({
        studentId:       student.id,
        admissionNumber: student.admissionNumber,
        reason: `No fee structure found for form=${form}, stream=${stream ?? "any"}, boardingStatus=${boarding ?? "any"}`,
      });
      continue;
    }

    // Build invoice line items
    const lineItems: Array<{ description: string; amount: number; type: string }> = [
      {
        description: `Term fees — Form ${form}`,
        amount:      parseFloat(structure.amountPerTerm.toString()),
        type:        "BASE_FEE",
      },
    ];

    let totalAmount = new Decimal(structure.amountPerTerm.toString());

    // Add expense items
    const studentAttachments = attachmentsByStudent.get(student.id) ?? [];
    for (const att of studentAttachments) {
      lineItems.push({
        description: att.name,
        amount:      parseFloat(att.price.toString()),
        type:        "EXPENSE",
      });
      totalAmount = totalAmount.plus(att.price);
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Set RLS for this transaction
        await tx.$executeRaw`SET LOCAL app.current_school_id = ${schoolId}`;

        // Generate sequential invoice number
        const invoiceNumber = await nextInvoiceNumber(tx, schoolId, invoicePrefix);

        // Create Invoice row
        await tx.invoice.create({
          data: {
            schoolId,
            studentId:    student.id,
            termId,
            totalAmount,
            lineItems:    lineItems,
            invoiceNumber,
            isProrated:   false,
            generatedById: userId,
          },
        });

        // Post the ledger entry (also updates balance + debtor flag)
        await postLedgerEntry(tx, {
          schoolId,
          studentId:    student.id,
          termId,
          entryType:    "INVOICE",
          amount:       totalAmount,
          description:  `Invoice ${invoiceNumber} — ${term.name}`,
          referenceId:  invoiceNumber,
          referenceType: "INVOICE",
          postedById:   userId,
        });

        // Create notification
        await tx.financeNotification.create({
          data: {
            schoolId,
            studentId: student.id,
            type:      "INVOICE_GENERATED",
            message:   `Invoice ${invoiceNumber} generated for ${student.fullName} — ${term.name} (KES ${totalAmount.toFixed(2)})`,
          },
        });
      });

      result.succeeded++;
    } catch (err) {
      result.errors.push({
        studentId:       student.id,
        admissionNumber: student.admissionNumber,
        reason:          err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
}

/**
 * Creates a single prorated invoice for a student who joins mid-term.
 * Used by the new-student finance setup flow.
 */
export async function createProratedInvoice(opts: {
  schoolId:    string;
  studentId:   string;
  termId:      string;
  userId:      string;
  customAmount?: Decimal; // If set, skips proration and uses this amount directly
}): Promise<{ invoiceNumber: string; amount: Decimal }> {
  const { schoolId, studentId, termId, userId, customAmount } = opts;

  const [student, term, settings] = await Promise.all([
    prisma.student.findUnique({
      where:  { id: studentId },
      select: { admissionNumber: true, fullName: true, boardingStatus: true, schoolClass: { select: { form: true, stream: true } } },
    }),
    prisma.term.findUnique({
      where:  { id: termId },
      select: { name: true, startDate: true, endDate: true, academicYear: true },
    }),
    prisma.financeSettings.findUnique({
      where:  { schoolId },
      select: { invoicePrefix: true },
    }),
  ]);

  if (!student || !term) throw new Error("Student or term not found.");

  let invoiceAmount: Decimal;
  let isProrated = false;
  let proratedDays: number | undefined;

  if (customAmount) {
    invoiceAmount = customAmount;
  } else {
    // Auto-prorate
    const structures = await prisma.feeStructure.findMany({
      where:  { schoolId },
      select: { id: true, form: true, stream: true, boardingStatus: true, amountPerTerm: true },
    });

    const structure = selectFeeStructure(
      structures,
      student.schoolClass.form,
      student.schoolClass.stream ?? null,
      student.boardingStatus ?? null
    );

    if (!structure) throw new Error("No fee structure found for this student.");

    const now = new Date();
    // startDate / endDate are always set (sentinel values used when not explicitly provided)
    const termStart = term.startDate ?? new Date(term.academicYear, 0, 1);
    const termEnd   = term.endDate   ?? new Date(term.academicYear, 11, 31);
    invoiceAmount = computeProratedAmount(
      { startDate: termStart, endDate: termEnd },
      structure.amountPerTerm,
      now
    );
    isProrated    = true;
    proratedDays  = Math.max(
      0,
      Math.floor((termEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );
  }

  const invoicePrefix = settings?.invoicePrefix ?? "INV-";

  let invoiceNumber = "";

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL app.current_school_id = ${schoolId}`;

    invoiceNumber = await nextInvoiceNumber(tx, schoolId, invoicePrefix);

    await tx.invoice.create({
      data: {
        schoolId,
        studentId,
        termId,
        totalAmount: invoiceAmount,
        lineItems:   [{ description: `${isProrated ? "Prorated term" : "Term"} fees`, amount: invoiceAmount.toNumber(), type: "BASE_FEE" }],
        invoiceNumber,
        isProrated,
        proratedDays:  proratedDays ?? null,
        generatedById: userId,
      },
    });

    await postLedgerEntry(tx, {
      schoolId,
      studentId,
      termId,
      entryType:    "INVOICE",
      amount:       invoiceAmount,
      description:  `${isProrated ? "Prorated invoice" : "Invoice"} ${invoiceNumber} — ${term.name}`,
      referenceId:  invoiceNumber,
      referenceType: "INVOICE",
      postedById:   userId,
    });

    await tx.financeNotification.create({
      data: {
        schoolId,
        studentId,
        type:    "INVOICE_GENERATED",
        message: `Invoice ${invoiceNumber} generated — ${term.name} (KES ${invoiceAmount.toFixed(2)})`,
      },
    });
  });

  return { invoiceNumber, amount: invoiceAmount };
}
