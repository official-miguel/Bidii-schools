/**
 * GET    /api/library/catalogue/[id]  — fetch single catalogue + its copies
 * PATCH  /api/library/catalogue/[id]  — update catalogue fields
 * DELETE /api/library/catalogue/[id]  — archive (soft-delete)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";

type Params = { params: { id: string } };

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

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cat = await prisma.libraryCatalogue.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    include: {
      copies: {
        orderBy: { accessionNumber: "asc" },
        select: {
          id: true, accessionNumber: true, qrCode: true, barcode: true,
          condition: true, status: true, acquisitionDate: true, cost: true,
          archivedAt: true, archiveReason: true, createdAt: true, updatedAt: true,
        },
      },
    },
  });

  if (!cat) return NextResponse.json({ error: "Catalogue entry not found." }, { status: 404 });

  return NextResponse.json({
    ...cat,
    totalCopies:     cat.copies.filter((c: { archivedAt: unknown }) => !c.archivedAt).length,
    availableCopies: cat.copies.filter((c: { status: string; archivedAt: unknown }) => c.status === "AVAILABLE" && !c.archivedAt).length,
  });
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  title:        z.string().trim().min(1).optional(),
  bookNumber:   z.string().trim().optional().or(z.literal("")),
  subject:      z.string().trim().optional().or(z.literal("")),
  form:         z.coerce.number().int().min(1).max(8).optional().nullable(),
  author:       z.string().trim().optional().or(z.literal("")),
  publisher:    z.string().trim().optional().or(z.literal("")),
  edition:      z.string().trim().optional().or(z.literal("")),
  isbn:         z.string().trim().optional().or(z.literal("")),
  category:     z.string().optional(),
  shelf:        z.string().trim().optional().or(z.literal("")),
  shelfRow:     z.string().trim().optional().or(z.literal("")),
  language:     z.string().trim().optional(),
  publishYear:  z.coerce.number().int().min(1000).max(2100).optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  costPerCopy:  z.coerce.number().min(0).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cat = await prisma.libraryCatalogue.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    select: { id: true, bookNumber: true },
  });
  if (!cat) return NextResponse.json({ error: "Catalogue entry not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );

  const d = parsed.data;

  // Check bookNumber uniqueness if changed
  if (d.bookNumber && d.bookNumber !== cat.bookNumber) {
    const exists = await prisma.libraryCatalogue.findFirst({
      where: { schoolId: user.schoolId!, bookNumber: d.bookNumber, id: { not: params.id } },
      select: { id: true },
    });
    if (exists)
      return NextResponse.json(
        { error: `Book number "${d.bookNumber}" already exists.` },
        { status: 409 }
      );
  }

  const updated = await prisma.libraryCatalogue.update({
    where: { id: params.id },
    data: {
      ...(d.title       !== undefined && { title:       d.title }),
      ...(d.bookNumber  !== undefined && { bookNumber:  d.bookNumber  || null }),
      ...(d.subject     !== undefined && { subject:     d.subject     || null }),
      ...(d.form        !== undefined && { form:        d.form }),
      ...(d.author      !== undefined && { author:      d.author      || null }),
      ...(d.publisher   !== undefined && { publisher:   d.publisher   || null }),
      ...(d.edition     !== undefined && { edition:     d.edition     || null }),
      ...(d.isbn        !== undefined && { isbn:        d.isbn        || null }),
      ...(d.category    !== undefined && { category:    d.category as never }),
      ...(d.shelf       !== undefined && { shelf:       d.shelf       || null }),
      ...(d.shelfRow    !== undefined && { shelfRow:    d.shelfRow    || null }),
      ...(d.language    !== undefined && { language:    d.language }),
      ...(d.publishYear !== undefined && { publishYear: d.publishYear }),
      ...(d.purchaseDate !== undefined && {
        purchaseDate: d.purchaseDate ? new Date(d.purchaseDate) : null,
      }),
      ...(d.costPerCopy !== undefined && { costPerCopy: d.costPerCopy }),
    },
  });

  emitSSE(user.schoolId!, "libraryCatalogue.updated", updated);
  return NextResponse.json(updated);
}

// ---------------------------------------------------------------------------
// DELETE — soft-delete (archive)
// ---------------------------------------------------------------------------

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cat = await prisma.libraryCatalogue.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    select: { id: true, archivedAt: true },
  });
  if (!cat) return NextResponse.json({ error: "Catalogue entry not found." }, { status: 404 });
  if (cat.archivedAt) return NextResponse.json({ error: "Already archived." }, { status: 409 });

  // Block if any copies are actively borrowed
  // Uses raw SQL because LibraryBorrow.copyId FK is added by the v2 migration
  // and Prisma client may not yet reflect that relation.
  const activeBorrowsRaw = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "LibraryBorrow" lb
    JOIN "LibraryCopy" lc ON lc.id = lb."copyId"
    WHERE lc."catalogueId" = ${params.id}
      AND lb."returnedAt" IS NULL
  `.catch(() => [{ count: BigInt(0) }]);
  const activeBorrows = Number(activeBorrowsRaw[0]?.count ?? 0);
  if (activeBorrows > 0)
    return NextResponse.json(
      { error: `Cannot archive — ${activeBorrows} cop${activeBorrows === 1 ? "y" : "ies"} still out.` },
      { status: 409 }
    );

  const archived = await prisma.libraryCatalogue.update({
    where: { id: params.id },
    data: { archivedAt: new Date() },
  });

  emitSSE(user.schoolId!, "libraryCatalogue.archived", { id: params.id });
  return NextResponse.json(archived);
}
