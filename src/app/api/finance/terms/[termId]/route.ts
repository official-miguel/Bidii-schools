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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL app.current_school_id = ${schoolId}`;

      // 1. Read all non-voided ledger entries for this term so we can reverse
      //    their impact on StudentFinanceAccount.
      //    OPENING_BALANCE / CREDIT_ADJUSTMENT entries tagged with
      //    referenceType = 'CARRY_FORWARD' are informational and did NOT
      //    affect currentBalance when created — exclude them from the reversal.
      const ledgerEntries = await tx.ledgerEntry.findMany({
        where:  { termId: params.termId, schoolId, isVoided: false },
        select: { studentId: true, entryType: true, amount: true, referenceType: true },
      });

      const realEntries = ledgerEntries.filter(
        e => e.referenceType !== "CARRY_FORWARD"
      );

      // Group net balance delta per student.
      // balanceDelta mirror (src/lib/finance/ledger.ts):
      //   INVOICE / DEBIT_ADJUSTMENT  → was -amount  → reverse = +amount
      //   PAYMENT / CREDIT_ADJUSTMENT → was +amount  → reverse = -amount
      const studentDeltas  = new Map<string, number>();
      const invoiceImpacts = new Map<string, number>();
      const paymentImpacts = new Map<string, number>();

      for (const e of realEntries) {
        const amount = parseFloat(e.amount.toString());

        if (e.entryType === "INVOICE" || e.entryType === "DEBIT_ADJUSTMENT") {
          studentDeltas.set(e.studentId, (studentDeltas.get(e.studentId) ?? 0) + amount);
          if (e.entryType === "INVOICE") {
            invoiceImpacts.set(e.studentId, (invoiceImpacts.get(e.studentId) ?? 0) + amount);
          }
        } else if (e.entryType === "PAYMENT" || e.entryType === "CREDIT_ADJUSTMENT") {
          studentDeltas.set(e.studentId, (studentDeltas.get(e.studentId) ?? 0) - amount);
          if (e.entryType === "PAYMENT") {
            paymentImpacts.set(e.studentId, (paymentImpacts.get(e.studentId) ?? 0) + amount);
          }
        }
      }

      const affectedStudentIds = Array.from(studentDeltas.keys());

      // Apply balance reversals
      for (const studentId of affectedStudentIds) {
        const delta        = studentDeltas.get(studentId)  ?? 0;
        const invoiceDelta = invoiceImpacts.get(studentId) ?? 0;
        const paymentDelta = paymentImpacts.get(studentId) ?? 0;

        await tx.studentFinanceAccount.updateMany({
          where: { studentId, schoolId },
          data: {
            currentBalance: { increment: delta },
            ...(invoiceDelta > 0 ? { totalInvoiced: { decrement: invoiceDelta } } : {}),
            ...(paymentDelta > 0 ? { totalPaid:     { decrement: paymentDelta } } : {}),
          },
        });
      }

      // Clear debtor flags only for students affected by this term
      if (affectedStudentIds.length > 0) {
        await tx.debtorFlag.deleteMany({
          where: { schoolId, studentId: { in: affectedStudentIds } },
        });
        // Clear finance notifications for affected students
        await tx.financeNotification.deleteMany({
          where: { schoolId, studentId: { in: affectedStudentIds } },
        });
      }

      // 2. Delete invoices and ledger entries scoped to this term.
      //    Payments are NOT deleted — Payment.termId uses onDelete: SetNull
      //    so deleting the term automatically nulls Payment.termId.
      await tx.invoice.deleteMany({ where: { termId: params.termId, schoolId } });
      await tx.ledgerEntry.deleteMany({ where: { termId: params.termId, schoolId } });

      // 3. Delete the term (Payment.termId → null via SetNull cascade)
      await tx.term.delete({ where: { id: params.termId } });
    }, { timeout: 30000 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[FINANCE/TERMS DELETE]", err);
    return NextResponse.json({ error: "An unexpected error occurred while deleting the term." }, { status: 500 });
  }
}
