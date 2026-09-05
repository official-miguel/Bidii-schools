/**
 * POST /api/finance/accounts/[studentId]/setup-invoice
 *
 * Creates a custom invoice for a student who was added after the term's batch
 * invoicing already ran.  The bursar supplies:
 *   - termId          — the active term to invoice against
 *   - basicFeesAmount — base fees component (KES, must be >= 0)
 *   - expenseAmount   — expenses component (KES, optional, defaults to 0)
 *
 * Rules:
 *  • Only a BURSAR may call this endpoint (not PRINCIPAL).
 *  • The student must belong to the caller's school.
 *  • The student must NOT already have an invoice for the given term — this
 *    endpoint is specifically for the "missed batch" case.
 *  • basicFeesAmount + expenseAmount must be > 0.
 *  • After the invoice is created the finance setup is marked as complete
 *    (financeSetupCompletedAt) and the SETUP_REQUIRED notification is cleared,
 *    so the UI badge disappears automatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { createProratedInvoice } from "@/lib/finance/invoicing";
import { Decimal } from "@prisma/client/runtime/library";

const bodySchema = z.object({
  termId:          z.string().min(1, "termId is required."),
  basicFeesAmount: z
    .number({ required_error: "basicFeesAmount is required." })
    .min(0, "basicFeesAmount must be >= 0."),
  expenseAmount: z
    .number()
    .min(0, "expenseAmount must be >= 0.")
    .optional()
    .default(0),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { termId, basicFeesAmount, expenseAmount } = parsed.data;

  // ── Validate total ─────────────────────────────────────────────────────────
  if (basicFeesAmount + expenseAmount <= 0) {
    return NextResponse.json(
      { error: "The total invoice amount must be greater than 0." },
      { status: 400 }
    );
  }

  // ── Verify student belongs to school ──────────────────────────────────────
  const student = await prisma.student.findFirst({
    where:  { id: params.studentId, schoolId, archivedAt: null },
    select: { id: true, fullName: true, admissionNumber: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  // ── Verify term belongs to school ─────────────────────────────────────────
  const term = await prisma.term.findFirst({
    where:  { id: termId, schoolId },
    select: { id: true, name: true },
  });
  if (!term) {
    return NextResponse.json({ error: "Term not found." }, { status: 404 });
  }

  // ── Guard: student must NOT already have an invoice for this term ──────────
  const existing = await prisma.invoice.findUnique({
    where: {
      schoolId_studentId_termId: {
        schoolId,
        studentId: params.studentId,
        termId,
      },
    },
    select: { invoiceNumber: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: `This student already has an invoice (${existing.invoiceNumber}) for the selected term.`,
      },
      { status: 409 }
    );
  }

  // ── Create invoice ─────────────────────────────────────────────────────────
  let invoiceNumber: string;
  let amount: Decimal;

  try {
    ({ invoiceNumber, amount } = await createProratedInvoice({
      schoolId,
      studentId:       params.studentId,
      termId,
      userId:          user.id,
      basicFeesAmount: new Decimal(basicFeesAmount),
      expenseAmount:   new Decimal(expenseAmount),
    }));
  } catch (err) {
    console.error("[setup-invoice] createProratedInvoice failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create invoice." },
      { status: 500 }
    );
  }

  // ── Mark finance setup as complete & clear the SETUP_REQUIRED notification ─
  await prisma.$transaction(async (tx) => {
    const account = await tx.studentFinanceAccount.findFirst({
      where:  { studentId: params.studentId, schoolId },
      select: { id: true },
    });

    if (account) {
      await tx.studentFinanceAccount.update({
        where: { id: account.id },
        data:  { financeSetupCompletedAt: new Date() },
      });
    }

    await tx.financeNotification.updateMany({
      where: {
        schoolId,
        studentId: params.studentId,
        type:      "SETUP_REQUIRED",
        isRead:    false,
      },
      data: { isRead: true },
    });
  });

  return NextResponse.json(
    {
      invoiceNumber,
      amount: amount.toString(),
      termName: term.name,
    },
    { status: 201 }
  );
}
