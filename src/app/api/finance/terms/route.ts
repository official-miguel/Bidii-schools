/**
 * GET  /api/finance/terms  — List all terms
 * POST /api/finance/terms  — Create a new term
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

const createSchema = z.object({
  name:         z.string().trim().min(1, "Name is required."),
  academicYear: z.number().int().min(2000).max(2100),
  startDate:    z.string().datetime({ message: "Invalid start date." }),
  endDate:      z.string().datetime({ message: "Invalid end date." }),
  isActive:     z.boolean().optional().default(true),
});

export async function GET() {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const terms = await prisma.term.findMany({
    where:   { schoolId },
    orderBy: [{ academicYear: "desc" }, { startDate: "desc" }],
    select:  { id: true, name: true, academicYear: true, startDate: true, endDate: true, isActive: true, invoicingCompletedAt: true, createdAt: true },
  });

  return NextResponse.json({ terms });
}

export async function POST(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;
  if (user.role === "PRINCIPAL") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  const { name, academicYear, startDate, endDate, isActive } = parsed.data;

  if (new Date(endDate) <= new Date(startDate)) {
    return NextResponse.json({ error: "End date must be after start date." }, { status: 400 });
  }

  try {
    const term = await prisma.term.create({
      data: { schoolId, name, academicYear, startDate: new Date(startDate), endDate: new Date(endDate), isActive, createdById: user.id },
      select: { id: true, name: true, academicYear: true, startDate: true, endDate: true, isActive: true, invoicingCompletedAt: true, createdAt: true },
    });
    return NextResponse.json({ term }, { status: 201 });
  } catch (err) {
    console.error("[FINANCE/TERMS POST]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
