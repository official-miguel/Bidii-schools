/**
 * GET    /api/finance/fee-structures  — List all fee structures for the school
 * POST   /api/finance/fee-structures  — Create a new fee structure
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

const createSchema = z.object({
  form:          z.number().int().min(1),
  stream:        z.string().trim().optional().nullable(),
  termNameId:    z.string().optional().nullable(),
  amountPerTerm: z.number().positive("Basic school fees must be a positive amount."),
});

export async function GET() {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const structures = await prisma.feeStructure.findMany({
    where:   { schoolId },
    orderBy: [{ form: "asc" }, { stream: "asc" }],
    select:  {
      id: true, form: true, stream: true, termNameId: true, amountPerTerm: true, createdAt: true,
      termName: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    feeStructures: structures.map((s) => ({
      ...s,
      amountPerTerm: s.amountPerTerm.toString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Principals cannot create fee structures." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { form, stream, termNameId, amountPerTerm } = parsed.data;

  // Verify the termNameId belongs to this school if provided
  if (termNameId) {
    const tn = await prisma.financialTermName.findFirst({ where: { id: termNameId, schoolId } });
    if (!tn) return NextResponse.json({ error: "Selected term not found." }, { status: 400 });
  }

  // Uniqueness check: one fee structure per (form, stream, termNameId) per school
  const conflict = await prisma.feeStructure.findFirst({
    where: {
      schoolId,
      form,
      stream:     stream ?? null,
      termNameId: termNameId ?? null,
    },
  });
  if (conflict) {
    return NextResponse.json(
      { error: "A fee structure for this class, stream, and term already exists." },
      { status: 409 }
    );
  }

  try {
    const structure = await prisma.feeStructure.create({
      data: {
        schoolId,
        form,
        stream:        stream ?? null,
        boardingStatus: null,
        termNameId:    termNameId ?? null,
        amountPerTerm,
        createdById:   user.id,
      },
      select: {
        id: true, form: true, stream: true, termNameId: true, amountPerTerm: true, createdAt: true,
        termName: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(
      { feeStructure: { ...structure, amountPerTerm: structure.amountPerTerm.toString() } },
      { status: 201 }
    );
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return NextResponse.json({ error: "A fee structure with these parameters already exists." }, { status: 409 });
    }
    console.error("[FINANCE/FEE-STRUCTURES POST]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

