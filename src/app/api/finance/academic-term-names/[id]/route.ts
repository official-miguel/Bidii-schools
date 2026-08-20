/**
 * PUT    /api/finance/academic-term-names/[id]  — Rename a term name definition
 * DELETE /api/finance/academic-term-names/[id]  — Remove a term name definition
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

const updateSchema = z.object({
  name: z.string().trim().min(1, "Term name is required.").max(80),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Principals cannot edit term names." }, { status: 403 });
  }

  const existing = await prisma.financialTermName.findFirst({
    where: { id: params.id, schoolId },
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

  try {
    const termName = await prisma.financialTermName.update({
      where:  { id: params.id },
      data:   { name: parsed.data.name },
      select: { id: true, name: true, createdAt: true },
    });
    return NextResponse.json({ termName });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return NextResponse.json({ error: "A term name with that label already exists." }, { status: 409 });
    }
    console.error("[FINANCE/ACADEMIC-TERM-NAMES PUT]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  if (user.role === "PRINCIPAL") {
    return NextResponse.json({ error: "Principals cannot delete term names." }, { status: 403 });
  }

  const existing = await prisma.financialTermName.findFirst({
    where: { id: params.id, schoolId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Check if any terms reference this name
  const usedBy = await prisma.term.count({ where: { termNameId: params.id } });
  if (usedBy > 0) {
    return NextResponse.json(
      { error: `Cannot delete — this term name is used by ${usedBy} financial term(s). Remove those terms first.` },
      { status: 409 }
    );
  }

  await prisma.financialTermName.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
