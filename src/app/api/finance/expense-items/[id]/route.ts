/**
 * GET   /api/finance/expense-items/[id]  — Fetch a single expense item
 * PATCH /api/finance/expense-items/[id]  — Update name, description, or price
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

const updateSchema = z.object({
  name:         z.string().trim().min(1).optional(),
  description:  z.string().trim().optional().nullable(),
  currentPrice: z.number().positive().optional(),
  termNameId:   z.string().optional().nullable(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const item = await prisma.expenseItem.findFirst({
    where:  { id: params.id, schoolId },
    select: {
      id:           true,
      name:         true,
      description:  true,
      currentPrice: true,
      isActive:     true,
      termNameId:   true,
      termName:     { select: { id: true, name: true } },
      category:     { select: { name: true } },
    },
  });

  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({
    item: { ...item, currentPrice: item.currentPrice.toString() },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const existing = await prisma.expenseItem.findFirst({
    where: { id: params.id, schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const updated = await prisma.expenseItem.update({
      where:  { id: params.id },
      data:   {
        ...parsed.data,
        ...(parsed.data.termNameId !== undefined ? { termNameId: parsed.data.termNameId ?? null } : {}),
      },
      select: {
        id:           true,
        name:         true,
        description:  true,
        currentPrice: true,
        isActive:     true,
        categoryId:   true,
        termNameId:   true,
        termName:     { select: { id: true, name: true } },
        updatedAt:    true,
      },
    });
    return NextResponse.json({ item: { ...updated, currentPrice: updated.currentPrice.toString() } });
  } catch (err) {
    console.error("[FINANCE/EXPENSE-ITEMS PATCH]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
