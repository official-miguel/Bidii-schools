/**
 * GET    /api/finance/terms/[termId]  — Fetch a single term
 * PUT    /api/finance/terms/[termId]  — Update a term (locked once invoicing completes)
 * DELETE /api/finance/terms/[termId]  — Delete a term and all associated financial data
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

const updateSchema = z.object({
  name:         z.string().trim().min(1, "Name is required.").optional(),
  termNameId:   z.string().optional().nullable(),
  academicYear: z.number().int().min(2000).max(2100).optional(),
  isActive:     z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { termId: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const term = await prisma.term.findFirst({
    where:  { id: params.termId, schoolId },
    select: {
      id: true, name: true, termNameId: true, academicYear: true,
      isActive: true, invoicingCompletedAt: true, createdAt: true,
      termName: { select: { id: true, name: true } },
    },
  });

  if (!term) return NextResponse.json({ error: "Term not found." }, { status: 404 });
  return NextResponse.json({ term });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { termId: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Principals cannot edit terms." }, { status: 403 });
  }

  const existing = await prisma.term.findFirst({
    where:  { id: params.termId, schoolId },
    select: { id: true, invoicingCompletedAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Term not found." }, { status: 404 });

  if (existing.invoicingCompletedAt) {
    return NextResponse.json(
      { error: "This term is locked — invoicing has already been completed." },
      { status: 409 }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  if (parsed.data.termNameId) {
    const tn = await prisma.financialTermName.findFirst({
      where: { id: parsed.data.termNameId, schoolId },
    });
    if (!tn) return NextResponse.json({ error: "Selected term name not found." }, { status: 400 });
  }

  try {
    const term = await prisma.term.update({
      where: { id: params.termId },
      data:  parsed.data,
      select: {
        id: true, name: true, termNameId: true, academicYear: true,
        isActive: true, invoicingCompletedAt: true, createdAt: true,
        termName: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ term });
  } catch (err) {
    console.error("[FINANCE/TERMS PUT]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { termId: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Principals cannot delete terms." }, { status: 403 });
  }

  const term = await prisma.term.findFirst({
    where:  { id: params.termId, schoolId },
    select: { id: true, name: true },
  });
  if (!term) return NextResponse.json({ error: "Term not found." }, { status: 404 });

  try {
    // Delete all financial data associated with this term in the correct dependency order.
    // StudentFinanceAccount.currentBalance is a running total — we reverse the impact
    // of all invoices and debit adjustments for this term before deleting.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL app.current_school_id = ${schoolId}`;

      // 1. Reverse balance impact: sum all non-voided INVOICE + DEBIT_ADJUSTMENT entries
      //    for this term per student, then add that back to currentBalance.
      //    Also subtract any PAYMENT / CREDIT_ADJUSTMENT that were posted against this term.
      const ledgerEntries = await tx.ledgerEntry.findMany({
        where:  { termId: params.termId, schoolId, isVoided: false },
        select: { studentId: true, entryType: true, amount: true },
      });

      // Group net balance impact per student
      const studentDeltas = new Map<string, number>();
      for (const entry of ledgerEntries) {
        const current = studentDeltas.get(entry.studentId) ?? 0;
        const amount  = parseFloat(entry.amount.toString());
        // Mirror of balanceDelta in ledger.ts: INVOICE/DEBIT_ADJUSTMENT/OPENING_BALANCE were negated
        if (entry.entryType === "INVOICE" || entry.entryType === "DEBIT_ADJUSTMENT" || entry.entryType === "OPENING_BALANCE") {
          // These reduced the balance (made it more negative) — reverse by adding back
          studentDeltas.set(entry.studentId, current + amount);
        } else if (entry.entryType === "PAYMENT" || entry.entryType === "CREDIT_ADJUSTMENT") {
          // These increased the balance — reverse by subtracting
          studentDeltas.set(entry.studentId, current - amount);
        }
        // CARRY_FORWARD entries (referenceType = CARRY_FORWARD) are informational — handled above
      }

      // Apply reversals atomically per student
      for (const [studentId, delta] of studentDeltas.entries()) {
        if (delta === 0) continue;
        // Also reverse totalInvoiced and totalPaid
        const invoiceImpact = ledgerEntries
          .filter(e => e.studentId === studentId && e.entryType === "INVOICE")
          .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
        const paymentImpact = ledgerEntries
          .filter(e => e.studentId === studentId && e.entryType === "PAYMENT")
          .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);

        await tx.studentFinanceAccount.updateMany({
          where: { studentId, schoolId },
          data: {
            currentBalance: { increment: delta },
            ...(invoiceImpact > 0 ? { totalInvoiced: { decrement: invoiceImpact } } : {}),
            ...(paymentImpact > 0 ? { totalPaid:     { decrement: paymentImpact } } : {}),
          },
        });
      }

      // 2. Delete dependent rows in order
      await tx.financeNotification.deleteMany({ where: { schoolId } }); // scoped by school; notifications don't have termId
      await tx.mpesaReconciliationQueue.deleteMany({ where: { schoolId } });
      await tx.payment.deleteMany({ where: { termId: params.termId, schoolId } });
      await tx.invoice.deleteMany({ where: { termId: params.termId, schoolId } });
      await tx.ledgerEntry.deleteMany({ where: { termId: params.termId, schoolId } });
      await tx.debtorFlag.deleteMany({ where: { schoolId } }); // recompute flags after balance reversal
      await tx.financeImportJob.deleteMany({ where: { schoolId } });

      // 3. Delete the term itself
      await tx.term.delete({ where: { id: params.termId } });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[FINANCE/TERMS DELETE]", err);
    return NextResponse.json({ error: "An unexpected error occurred while deleting the term." }, { status: 500 });
  }
}
