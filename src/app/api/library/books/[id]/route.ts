import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function manageGuard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"))
  );
}

const updateSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").optional(),
  author: z.string().trim().optional().or(z.literal("")),
  isbn: z.string().trim().optional().or(z.literal("")),
  publisher: z.string().trim().optional().or(z.literal("")),
  publishYear: z.coerce.number().int().min(1000).max(2100).optional().nullable(),
  totalCopies: z.coerce.number().int().min(1).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const book = await prisma.libraryBook.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const updated = await prisma.libraryBook.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.author !== undefined && { author: parsed.data.author || null }),
      ...(parsed.data.isbn !== undefined && { isbn: parsed.data.isbn || null }),
      ...(parsed.data.publisher !== undefined && { publisher: parsed.data.publisher || null }),
      ...(parsed.data.publishYear !== undefined && { publishYear: parsed.data.publishYear }),
      ...(parsed.data.totalCopies !== undefined && { totalCopies: parsed.data.totalCopies }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const book = await prisma.libraryBook.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

  // Block delete if any copies are currently out
  const outCount = await prisma.libraryBorrow.count({
    where: { bookId: params.id, returnedAt: null },
  });
  if (outCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${outCount} cop${outCount === 1 ? "y" : "ies"} still out.` },
      { status: 409 }
    );
  }

  await prisma.libraryBook.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
