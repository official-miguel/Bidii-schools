import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";

const updateSchema = z.object({
  name: z.string().trim().min(1, "Stream name is required.").max(50),
});

// ---------------------------------------------------------------------------
// PATCH /api/streams/[id]  — rename a stream (Principal-only)
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.stream.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Stream not found." }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  try {
    const stream = await prisma.stream.update({
      where: { id: params.id },
      data: { name: parsed.data.name },
    });
    return NextResponse.json(stream);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: `A stream named "${parsed.data.name}" already exists.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Couldn't update stream." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/streams/[id]  — delete a stream (Principal-only)
// Classes that reference this stream will have their streamId set to null
// due to the FK onDelete: SetNull semantics — but Prisma requires explicit
// nullification here since we're using a nullable FK without SetNull on the
// Stream side. We manually clear it.
// ---------------------------------------------------------------------------
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.stream.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Stream not found." }, { status: 404 });

  // Detach classes from this stream before deleting
  await prisma.$transaction([
    prisma.schoolClass.updateMany({
      where: { streamId: params.id, schoolId: user.schoolId },
      data: { streamId: null },
    }),
    prisma.stream.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
