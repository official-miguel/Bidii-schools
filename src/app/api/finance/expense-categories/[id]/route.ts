/**
 * PUT    /api/finance/expense-categories/[id]  — Update an expense category
 * DELETE /api/finance/expense-categories/[id]  — Delete an expense category
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

const updateSchema = z.object({
  name:        z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  icon:        z.string().trim().optional().nullable(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const existing = await prisma.expenseCategory.findFirst({
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
    const updated = await prisma.expenseCategory.update({
      where:  { id: params.id },
      data:   parsed.data,
      select: { id: true, name: true, description: true, icon: true },
    });
    return NextResponse.json({ category: updated });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return NextResponse.json({ error: "An expense category with that name already exists." }, { status: 409 });
    }
    console.error("[FINANCE/EXPENSE-CATEGORIES PUT]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const existing = await prisma.expenseCategory.findFirst({
    where: { id: params.id, schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.expenseCategory.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
