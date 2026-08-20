/**
 * GET  /api/finance/academic-term-names  — List all financial term name definitions
 * POST /api/finance/academic-term-names  — Create a new term name
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

const createSchema = z.object({
  name: z.string().trim().min(1, "Term name is required.").max(80),
});

export async function GET() {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const termNames = await prisma.financialTermName.findMany({
    where:   { schoolId },
    orderBy: { createdAt: "asc" },
    select:  { id: true, name: true, createdAt: true },
  });

  return NextResponse.json({ termNames });
}

export async function POST(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Principals cannot create term names." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const termName = await prisma.financialTermName.create({
      data: { schoolId, name: parsed.data.name },
      select: { id: true, name: true, createdAt: true },
    });
    return NextResponse.json({ termName }, { status: 201 });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return NextResponse.json({ error: "A term name with that label already exists." }, { status: 409 });
    }
    console.error("[FINANCE/ACADEMIC-TERM-NAMES POST]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
