/**
 * GET  /api/finance/expense-items           — List all expense items (optionally filter by ?categoryId=)
 * POST /api/finance/expense-items           — Create a new expense item
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

const createSchema = z.object({
  categoryId:   z.string().trim().min(1, "Category is required."),
  name:         z.string().trim().min(1, "Name is required."),
  description:  z.string().trim().optional().nullable(),
  currentPrice: z.number().positive("Price must be positive."),
});

export async function GET(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");

  const items = await prisma.expenseItem.findMany({
    where:   { schoolId, ...(categoryId ? { categoryId } : {}) },
    orderBy: { name: "asc" },
    select: {
      id:           true,
      name:         true,
      description:  true,
      currentPrice: true,
      isActive:     true,
      categoryId:   true,
      category:     { select: { name: true } },
      createdAt:    true,
      updatedAt:    true,
    },
  });

  return NextResponse.json({
    items: items.map((i) => ({ ...i, currentPrice: i.currentPrice.toString() })),
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  // Verify category belongs to this school
  const category = await prisma.expenseCategory.findFirst({
    where: { id: parsed.data.categoryId, schoolId },
  });
  if (!category) {
    return NextResponse.json({ error: "Expense category not found." }, { status: 404 });
  }

  try {
    const item = await prisma.expenseItem.create({
      data: {
        schoolId,
        categoryId:   parsed.data.categoryId,
        name:         parsed.data.name,
        description:  parsed.data.description ?? null,
        currentPrice: parsed.data.currentPrice,
      },
      select: {
        id:           true,
        name:         true,
        description:  true,
        currentPrice: true,
        isActive:     true,
        categoryId:   true,
        createdAt:    true,
      },
    });
    return NextResponse.json(
      { item: { ...item, currentPrice: item.currentPrice.toString() } },
      { status: 201 }
    );
  } catch (err) {
    console.error("[FINANCE/EXPENSE-ITEMS POST]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
