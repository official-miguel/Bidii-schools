/**
 * GET   /api/finance/terms/[termId]  — Fetch a single term
 * PUT   /api/finance/terms/[termId]  — Update a term (locked once invoicing completes)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

const updateSchema = z.object({
  name:         z.string().trim().min(1, "Name is required.").optional(),
  academicYear: z.number().int().min(2000).max(2100).optional(),
  startDate:    z.string().datetime({ message: "Invalid start date." }).optional(),
  endDate:      z.string().datetime({ message: "Invalid end date." }).optional(),
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
    select: { id: true, name: true, academicYear: true, startDate: true, endDate: true, isActive: true, invoicingCompletedAt: true, createdAt: true },
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

  const { startDate, endDate, ...rest } = parsed.data;

  if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
    return NextResponse.json({ error: "End date must be after start date." }, { status: 400 });
  }

  try {
    const term = await prisma.term.update({
      where: { id: params.termId },
      data:  {
        ...rest,
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate   ? { endDate:   new Date(endDate)   } : {}),
      },
      select: { id: true, name: true, academicYear: true, startDate: true, endDate: true, isActive: true, invoicingCompletedAt: true, createdAt: true },
    });
    return NextResponse.json({ term });
  } catch (err) {
    console.error("[FINANCE/TERMS PUT]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
