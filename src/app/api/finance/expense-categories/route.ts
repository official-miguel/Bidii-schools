/**
 * GET  /api/finance/expense-categories  — List all expense categories
 * POST /api/finance/expense-categories  — Create a new expense category
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

const createSchema = z.object({
  name:        z.string().trim().min(1, "Name is required."),
  description: z.string().trim().optional().nullable(),
  icon:        z.string().trim().optional().nullable(),
});

export async function GET() {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const categories = await prisma.expenseCategory.findMany({
    where:   { schoolId },
    orderBy: { name: "asc" },
    select: {
      id:          true,
      name:        true,
      description: true,
      icon:        true,
      createdAt:   true,
      _count:      { select: { items: true } },
    },
  });

  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Principals cannot create expense categories." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const category = await prisma.expenseCategory.create({
      data: {
        schoolId,
        name:        parsed.data.name,
        description: parsed.data.description ?? null,
        icon:        parsed.data.icon ?? null,
      },
      select: { id: true, name: true, description: true, icon: true, createdAt: true },
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return NextResponse.json({ error: "An expense category with that name already exists." }, { status: 409 });
    }
    console.error("[FINANCE/EXPENSE-CATEGORIES POST]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
