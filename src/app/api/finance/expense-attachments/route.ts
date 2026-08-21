/**
 * GET  /api/finance/expense-attachments?studentId=  — List attachments for a student (or all)
 * POST /api/finance/expense-attachments             — Attach expense item(s) to student(s)
 *   Body (single):  { studentId: string, expenseItemId: string }
 *   Body (bulk):    { studentIds: string[], expenseItemId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { postLedgerEntry } from "@/lib/finance/ledger";
import { computeProratedAmount } from "@/lib/finance/proration";

const attachSchema = z.union([
  z.object({
    studentId:     z.string().trim().min(1),
    expenseItemId: z.string().trim().min(1),
  }),
  z.object({
    studentIds:    z.array(z.string().trim().min(1)).min(1),
    expenseItemId: z.string().trim().min(1),
  }),
]);

export async function GET(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const { searchParams } = new URL(req.url);
  const studentId     = searchParams.get("studentId");
  const expenseItemId = searchParams.get("expenseItemId");

  const attachments = await prisma.studentExpenseAttachment.findMany({
    where:   {
      schoolId,
      detachedAt: null,
      ...(studentId     ? { studentId }     : {}),
      ...(expenseItemId ? { expenseItemId } : {}),
    },
    orderBy: { attachedAt: "desc" },
    select: {
      id:            true,
      studentId:     true,
      expenseItemId: true,
      attachedAt:    true,
      expenseItem: {
        select: {
          name:         true,
          currentPrice: true,
          category:     { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json({
    attachments: attachments.map((a) => ({
      ...a,
      expenseItem: {
        ...a.expenseItem,
        currentPrice: a.expenseItem.currentPrice.toString(),
      },
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = attachSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const data       = parsed.data;
  const studentIds = "studentIds" in data ? data.studentIds : [data.studentId];
  const { expenseItemId } = data;

  // Verify expense item belongs to this school and is active
  const expenseItem = await prisma.expenseItem.findFirst({
    where:  { id: expenseItemId, schoolId, isActive: true },
    select: { id: true, name: true, currentPrice: true },
  });
  if (!expenseItem) {
    return NextResponse.json({ error: "Expense item not found or inactive." }, { status: 404 });
  }

  // Get the active term for proration (only if invoicing has already completed)
  const activeTerm = await prisma.term.findFirst({
    where:   { schoolId, isActive: true, invoicingCompletedAt: { not: null } },
    orderBy: { startDate: "desc" },
    select:  { id: true, startDate: true, endDate: true, academicYear: true, name: true, invoicingCompletedAt: true },
  });

  const created: string[] = [];
  const errors:  string[] = [];

  for (const studentId of studentIds) {
    // Verify student belongs to this school and is not archived
    const student = await prisma.student.findFirst({
      where:  { id: studentId, schoolId, archivedAt: null },
      select: { id: true },
    });
    if (!student) {
      errors.push(`Student ${studentId} not found.`);
      continue;
    }

    // Check for existing active attachment (idempotency guard)
    const existing = await prisma.studentExpenseAttachment.findFirst({
      where: { studentId, expenseItemId, schoolId, detachedAt: null },
    });
    if (existing) {
      errors.push(`Student ${studentId} already has this expense attached.`);
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Set RLS session variable for PgBouncer-safe isolation
        await tx.$executeRaw`SET LOCAL app.current_school_id = ${schoolId}`;

        // Create the attachment record
        await tx.studentExpenseAttachment.create({
          data: {
            studentId,
            expenseItemId,
            schoolId,
            attachedById: user.id,
          },
        });

        // If invoicing already completed for the active term, post a prorated debit
        if (activeTerm) {
          const termStart = activeTerm.startDate ?? new Date(activeTerm.academicYear, 0, 1);
          const termEnd   = activeTerm.endDate   ?? new Date(activeTerm.academicYear, 11, 31);
          const proratedAmount = computeProratedAmount(
            { startDate: termStart, endDate: termEnd },
            new Decimal(expenseItem.currentPrice.toString())
          );

          if (proratedAmount.greaterThan(0)) {
            await postLedgerEntry(tx, {
              schoolId,
              studentId,
              termId:      activeTerm.id,
              entryType:   "DEBIT_ADJUSTMENT",
              amount:      proratedAmount,
              description: `Mid-term expense: ${expenseItem.name} (prorated)`,
              postedById:  user.id,
            });
          }
        }
      });

      created.push(studentId);
    } catch (err) {
      errors.push(
        `Failed to attach for student ${studentId}: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }

  const allFailed = errors.length > 0 && created.length === 0;
  return NextResponse.json(
    { created: created.length, errors },
    { status: allFailed ? 422 : 201 }
  );
}
