/**
 * GET  /api/finance/terms  — List all terms
 * POST /api/finance/terms  — Create a new term and auto-run batch invoicing
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { runBatchInvoicing } from "@/lib/finance/invoicing";

const createSchema = z.object({
  name:         z.string().trim().min(1, "Term name is required."),
  termNameId:   z.string().optional().nullable(),
  academicYear: z.number().int().min(2000).max(2100),
  isActive:     z.boolean().optional().default(true),
});

export async function GET() {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const terms = await prisma.term.findMany({
    where:   { schoolId },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
    select:  {
      id: true, name: true, termNameId: true, academicYear: true,
      isActive: true, invoicingCompletedAt: true, createdAt: true,
      termName: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ terms });
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { name, termNameId, academicYear, isActive } = parsed.data;

  // Verify termNameId belongs to this school if provided
  if (termNameId) {
    const tn = await prisma.financialTermName.findFirst({ where: { id: termNameId, schoolId } });
    if (!tn) return NextResponse.json({ error: "Selected term name not found." }, { status: 400 });
  }

  // Create the term
  let term;
  try {
    term = await prisma.term.create({
      data: {
        schoolId,
        name,
        termNameId: termNameId ?? null,
        academicYear,
        isActive,
        createdById: user.id,
        // startDate / endDate are now optional — set a sentinel so existing
        // ledger queries that ORDER BY startDate still compile
        startDate: new Date(academicYear, 0, 1),
        endDate:   new Date(academicYear, 11, 31),
      },
      select: {
        id: true, name: true, termNameId: true, academicYear: true,
        isActive: true, invoicingCompletedAt: true, createdAt: true,
        termName: { select: { id: true, name: true } },
      },
    });
  } catch (err) {
    console.error("[FINANCE/TERMS POST] create failed", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }

  // Auto-run batch invoicing for the new term
  let invoicingResult;
  try {
    invoicingResult = await runBatchInvoicing(term.id, schoolId, user.id);

    // Mark invoicing as completed
    await prisma.term.update({
      where: { id: term.id },
      data:  { invoicingCompletedAt: new Date() },
    });
  } catch (err) {
    console.error("[FINANCE/TERMS POST] invoicing failed", err);
    // Term was created; return it with an invoicing error flag
    return NextResponse.json(
      {
        term,
        invoicing: {
          succeeded: 0, skipped: 0, errors: [],
          classesWithoutFees: [],
          fatalError: "Invoicing could not be completed. You can retry from the term menu.",
        },
      },
      { status: 201 }
    );
  }

  return NextResponse.json(
    {
      term,
      invoicing: {
        succeeded:          invoicingResult.succeeded,
        skipped:            invoicingResult.skipped,
        errors:             invoicingResult.errors,
        classesWithoutFees: invoicingResult.classesWithoutFees,
      },
    },
    { status: 201 }
  );
}
