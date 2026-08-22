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
  name:          z.string().trim().min(1, "Term name is required."),
  termNameId:    z.string().optional().nullable(),
  academicYear:  z.number().int().min(2000).max(2100),
  isActive:      z.boolean().optional().default(true),
  /**
   * When true the term is created without requiring fee structures on every
   * class. No automatic batch invoicing is run — the school will supply
   * per-student invoice amounts via a CSV import instead.
   */
  useCsvInvoice: z.boolean().optional().default(false),
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
      isActive: true, useCsvInvoice: true, invoicingCompletedAt: true, createdAt: true,
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

  const { name, termNameId, academicYear, isActive, useCsvInvoice } = parsed.data;

  // Verify termNameId belongs to this school if provided
  if (termNameId) {
    const tn = await prisma.financialTermName.findFirst({ where: { id: termNameId, schoolId } });
    if (!tn) return NextResponse.json({ error: "Selected term name not found." }, { status: 400 });
  }

  // ── Pre-flight: ensure every class in the school has a fee structure ──────
  // Skipped when useCsvInvoice = true — the school will supply invoice amounts
  // via a CSV import and no automatic batch invoicing will be run.
  if (!useCsvInvoice) {
    const allClasses = await prisma.schoolClass.findMany({
      where:  { schoolId },
      select: { id: true, name: true, form: true, stream: true },
    });

    if (allClasses.length === 0) {
      return NextResponse.json(
        { error: "No classes found. Create classes before adding a term." },
        { status: 422 }
      );
    }

    // Fetch fee structures relevant to this term (term-specific OR generic/null)
    const structures = await prisma.feeStructure.findMany({
      where: {
        schoolId,
        OR: [
          { termNameId: termNameId ?? null },
          { termNameId: null },
        ],
      },
      select: { form: true, stream: true, termNameId: true },
    });

    // For each class, check whether there is a matching fee structure using the
    // same logic as selectFeeStructure in invoicing.ts:
    //   - A structure with stream = null covers ALL streams for that form.
    //   - A structure with a specific stream only covers that stream.
    //   - Term-specific structures (termNameId matches) take priority but a
    //     generic (termNameId = null) structure also counts as covered.
    const classesWithoutFees = allClasses.filter(cls => {
      return !structures.some(s =>
        s.form === cls.form &&
        (s.stream === null || s.stream === cls.stream)
      );
    });

    if (classesWithoutFees.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot create term — ${classesWithoutFees.length} class${classesWithoutFees.length !== 1 ? "es" : ""} ${classesWithoutFees.length === 1 ? "does" : "do"} not have a fee structure: ${classesWithoutFees.map(c => c.name).join(", ")}.`,
          classesWithoutFees: classesWithoutFees.map(c => ({ id: c.id, name: c.name, form: c.form, stream: c.stream })),
        },
        { status: 422 }
      );
    }
  }
  // ── End pre-flight ──────────────────────────────────────────────────────────

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
        useCsvInvoice: useCsvInvoice ?? false,
        createdById: user.id,
        // startDate / endDate are now optional — set a sentinel so existing
        // ledger queries that ORDER BY startDate still compile
        startDate: new Date(academicYear, 0, 1),
        endDate:   new Date(academicYear, 11, 31),
      },
      select: {
        id: true, name: true, termNameId: true, academicYear: true,
        isActive: true, useCsvInvoice: true, invoicingCompletedAt: true, createdAt: true,
        termName: { select: { id: true, name: true } },
      },
    });
  } catch (err) {
    console.error("[FINANCE/TERMS POST] create failed", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }

  // When useCsvInvoice is set, skip auto-invoicing — the school supplies
  // invoice amounts via CSV upload (Finance > Imports > Opening Balance).
  if (useCsvInvoice) {
    return NextResponse.json(
      {
        term,
        invoicing: null,
        csvInvoiceMode: true,
      },
      { status: 201 }
    );
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
        carriedForward:     invoicingResult.carriedForward,
        errors:             invoicingResult.errors,
        classesWithoutFees: invoicingResult.classesWithoutFees,
      },
    },
    { status: 201 }
  );
}
