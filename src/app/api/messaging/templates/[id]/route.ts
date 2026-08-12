import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";

const updateSchema = z.object({
  name:     z.string().trim().min(2).optional(),
  category: z.string().trim().optional().or(z.literal("")),
  body:     z.string().trim().min(1).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tpl = await prisma.messageTemplate.findUnique({ where: { id: params.id } });
  if (!tpl || tpl.schoolId !== user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const updated = await prisma.messageTemplate.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name     ? { name:     parsed.data.name }                : {}),
        ...(parsed.data.body     ? { body:     parsed.data.body }                : {}),
        ...(parsed.data.category !== undefined ? { category: parsed.data.category || null } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A template with that name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not update template." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tpl = await prisma.messageTemplate.findUnique({ where: { id: params.id } });
  if (!tpl || tpl.schoolId !== user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.messageTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
