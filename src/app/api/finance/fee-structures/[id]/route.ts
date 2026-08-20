/**
 * GET    /api/finance/fee-structures/[id]  — Fetch a single fee structure
 * PUT    /api/finance/fee-structures/[id]  — Update a fee structure
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

const updateSchema = z.object({
  amountPerTerm: z.number().positive("Basic school fees must be a positive amount.").optional(),
  stream:        z.string().trim().optional().nullable(),
  termNameId:    z.string().optional().nullable(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const structure = await prisma.feeStructure.findFirst({
    where:  { id: params.id, schoolId },
    select: {
      id: true, form: true, stream: true, termNameId: true, amountPerTerm: true, createdAt: true,
      termName: { select: { id: true, name: true } },
    },
  });

  if (!structure) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({
    feeStructure: { ...structure, amountPerTerm: structure.amountPerTerm.toString() },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Principals cannot edit fee structures." }, { status: 403 });
  }

  const existing = await prisma.feeStructure.findFirst({
    where:  { id: params.id, schoolId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { termNameId, ...rest } = parsed.data;

  // Verify the termNameId belongs to this school if provided
  if (termNameId) {
    const tn = await prisma.financialTermName.findFirst({ where: { id: termNameId, schoolId } });
    if (!tn) return NextResponse.json({ error: "Selected term not found." }, { status: 400 });
  }

  try {
    const updated = await prisma.feeStructure.update({
      where:  { id: params.id },
      data:   { ...rest, termNameId: termNameId ?? null },
      select: {
        id: true, form: true, stream: true, termNameId: true, amountPerTerm: true, createdAt: true,
        termName: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      feeStructure: { ...updated, amountPerTerm: updated.amountPerTerm.toString() },
    });
  } catch (err) {
    console.error("[FINANCE/FEE-STRUCTURES PUT]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE() {
  return NextResponse.json({ error: "Fee structures cannot be deleted." }, { status: 405 });
}
