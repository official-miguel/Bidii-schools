/**
 * GET  /api/finance/terms  — List all terms
 * POST /api/finance/terms  — Create a new term
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

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

  try {
    const term = await prisma.term.create({
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
    return NextResponse.json({ term }, { status: 201 });
  } catch (err) {
    console.error("[FINANCE/TERMS POST]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
