/**
 * GET   /api/library/catalogue/[id]  — single catalogue entry with copies
 * PATCH /api/library/catalogue/[id]  — update title-level fields
 * DELETE /api/library/catalogue/[id] — soft-archive (sets archivedAt)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";

async function guard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"))
  );
}
async function manageGuard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"))
  );
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const catalogue = await prisma.libraryCatalogue.findFirst({
    where:   { id: params.id, schoolId: user.schoolId! },
    include: {
      copies: {
        orderBy:  { bookNumber: "asc" },
        select: {
          id: true, bookNumber: true, accessionNumber: true,
          status: true, condition: true, archivedAt: true,
          acquisitionDate: true, cost: true, createdAt: true,
        },
      },
    },
  });

  if (!catalogue)
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json(catalogue);
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  title:       z.string().trim().min(1).optional(),
  author:      z.string().trim().optional().or(z.literal("")).nullable(),
  edition:     z.string().trim().optional().or(z.literal("")).nullable(),
  level:       z.string().trim().optional().or(z.literal("")).nullable(),
  subject:     z.string().trim().optional().or(z.literal("")).nullable(),
  form:        z.coerce.number().int().min(1).max(8).optional().nullable(),
  publisher:   z.string().trim().optional().or(z.literal("")).nullable(),
  isbn:        z.string().trim().optional().or(z.literal("")).nullable(),
  category:    z.string().optional(),
  shelf:       z.string().trim().optional().or(z.literal("")).nullable(),
  shelfRow:    z.string().trim().optional().or(z.literal("")).nullable(),
  language:    z.string().trim().optional().nullable(),
  publishYear: z.coerce.number().int().min(1000).max(2100).optional().nullable(),
  costPerCopy: z.coerce.number().min(0).optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.libraryCatalogue.findFirst({
    where:  { id: params.id, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body   = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );

  const d = parsed.data;

  const updated = await prisma.libraryCatalogue.update({
    where: { id: params.id },
    data:  {
      ...(d.title       !== undefined ? { title:       d.title }               : {}),
      ...(d.author      !== undefined ? { author:      d.author      || null } : {}),
      ...(d.edition     !== undefined ? { edition:     d.edition     || null } : {}),
      ...(d.level       !== undefined ? { level:       d.level       || null } : {}),
      ...(d.subject     !== undefined ? { subject:     d.subject     || null } : {}),
      ...(d.form        !== undefined ? { form:        d.form        ?? null } : {}),
      ...(d.publisher   !== undefined ? { publisher:   d.publisher   || null } : {}),
      ...(d.isbn        !== undefined ? { isbn:        d.isbn        || null } : {}),
      ...(d.category    !== undefined ? { category:    d.category as never }   : {}),
      ...(d.shelf       !== undefined ? { shelf:       d.shelf       || null } : {}),
      ...(d.shelfRow    !== undefined ? { shelfRow:    d.shelfRow    || null } : {}),
      ...(d.language    !== undefined ? { language:    d.language    || "English" } : {}),
      ...(d.publishYear !== undefined ? { publishYear: d.publishYear ?? null } : {}),
      ...(d.costPerCopy !== undefined ? { costPerCopy: d.costPerCopy ?? null } : {}),
    },
  });

  emitSSE(user.schoolId!, "libraryCatalogue.updated", updated);
  return NextResponse.json(updated);
}

// ---------------------------------------------------------------------------
// DELETE — soft archive
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.libraryCatalogue.findFirst({
    where:  { id: params.id, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const updated = await prisma.libraryCatalogue.update({
    where: { id: params.id },
    data:  { archivedAt: new Date() },
  });

  emitSSE(user.schoolId!, "libraryCatalogue.archived", { id: params.id });
  return NextResponse.json(updated);
}
