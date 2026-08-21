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
    // Step 1 — Read ledger entries OUTSIDE the transaction (read-only, no RLS needed,
    // all rows are already scoped to schoolId + termId).
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where:  { termId: params.termId, schoolId, isVoided: false },
      select: { studentId: true, entryType: true, amount: true, referenceType: true },
    });

    // CARRY_FORWARD entries are display-only and did NOT affect currentBalance.
    const realEntries = ledgerEntries.filter(e => e.referenceType !== "CARRY_FORWARD");

    // Compute per-student balance reversals.
    // balanceDelta rules (mirror of ledger.ts):
    //   INVOICE / DEBIT_ADJUSTMENT  → was subtracted → reverse = add back
    //   PAYMENT / CREDIT_ADJUSTMENT → was added      → reverse = subtract
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

    // Step 2 — Apply balance reversals one student at a time (simple, no transaction needed —
    // each updateMany is atomic; worst case is a partial update on crash which an admin can fix).
    for (const studentId of affectedStudentIds) {
      const delta        = studentDeltas.get(studentId)  ?? 0;
      const invoiceDelta = invoiceImpacts.get(studentId) ?? 0;
      const paymentDelta = paymentImpacts.get(studentId) ?? 0;

      await prisma.studentFinanceAccount.updateMany({
        where: { studentId, schoolId },
        data: {
          currentBalance: { increment: delta },
          ...(invoiceDelta > 0 ? { totalInvoiced: { decrement: invoiceDelta } } : {}),
          ...(paymentDelta > 0 ? { totalPaid:     { decrement: paymentDelta } } : {}),
        },
      });
    }

    // Step 3 — Clear debtor flags and notifications for affected students only.
    if (affectedStudentIds.length > 0) {
      await prisma.debtorFlag.deleteMany({
        where: { schoolId, studentId: { in: affectedStudentIds } },
      });
      await prisma.financeNotification.deleteMany({
        where: { schoolId, studentId: { in: affectedStudentIds } },
      });
    }

    // Step 4 — Delete invoices and ledger entries for this term.
    //   Payments are preserved — Payment.termId becomes null via onDelete: SetNull.
    await prisma.invoice.deleteMany({ where: { termId: params.termId, schoolId } });
    await prisma.ledgerEntry.deleteMany({ where: { termId: params.termId, schoolId } });

    // Step 5 — Delete the term itself.
    await prisma.term.delete({ where: { id: params.termId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    // Log the full error so we can see exactly what went wrong in Vercel logs
    const message = err instanceof Error ? err.message : String(err);
    console.error("[FINANCE/TERMS DELETE] termId=%s schoolId=%s error=%s", params.termId, schoolId, message);
    return NextResponse.json(
      { error: `Delete failed: ${message}` },
      { status: 500 }
    );
  }
}
