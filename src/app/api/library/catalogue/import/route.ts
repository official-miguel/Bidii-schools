/**
 * POST /api/library/catalogue/import
 *
 * Bulk-import catalogue entries from JSON (parsed from Excel/CSV client-side).
 * Each row may contain multiple copies (numCopies field).
 *
 * Duplicate detection: a catalogue row is considered duplicate if an entry
 * with the same schoolId + bookNumber already exists (when bookNumber is
 * provided), or same title + edition + form combination.
 *
 * Returns:
 *   { imported: number, skipped: number, errors: { row: number, error: string }[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";

async function manageGuard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"))
  );
}

// ---------------------------------------------------------------------------
// Row schema — maps Excel/CSV columns to catalogue fields
// ---------------------------------------------------------------------------

const rowSchema = z.object({
  title:        z.string().trim().min(1, "Title is required"),
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
  costPerCopy:  z.coerce.number().min(0).optional().nullable(),
  numCopies:    z.coerce.number().int().min(1).max(1000).optional(),
});

const bodySchema = z.object({
  rows: z.array(z.unknown()).min(1).max(5000),
});

// ---------------------------------------------------------------------------
// Accession number helper (same logic as copies route)
// ---------------------------------------------------------------------------

async function nextAccessionSeq(schoolId: string): Promise<() => string> {
  const last = await prisma.libraryCopy.findFirst({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
    select: { accessionNumber: true },
  });
  let seq = 1;
  if (last) {
    const m = last.accessionNumber.match(/(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return () => `ACC-${String(seq++).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const topParsed = bodySchema.safeParse(body);
  if (!topParsed.success)
    return NextResponse.json(
      { error: topParsed.error.errors[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );

  const { rows: rawRows } = topParsed.data;

  // Pre-load existing bookNumbers and (title+edition+form) combos for duplicate check
  const existingCatalogues = await prisma.libraryCatalogue.findMany({
    where: { schoolId: user.schoolId! },
    select: { bookNumber: true, title: true, edition: true, form: true },
  });
  const existingBookNumbers = new Set(
    existingCatalogues.map((c: { bookNumber: string | null }) => c.bookNumber).filter(Boolean)
  );
  // Composite key: title|edition|form
  const existingComposites = new Set(
    existingCatalogues.map((c: { title: string; edition: string | null; form: number | null }) =>
      `${c.title.toLowerCase()}|${(c.edition ?? "").toLowerCase()}|${c.form ?? ""}`
    )
  );

  const getAccession = await nextAccessionSeq(user.schoolId!);

  let imported = 0;
  let skipped  = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const parsed = rowSchema.safeParse(rawRows[i]);
    if (!parsed.success) {
      errors.push({ row: i + 1, error: parsed.error.errors[0]?.message ?? "Invalid row" });
      continue;
    }

    const d = parsed.data;
    const compositeKey = `${d.title.toLowerCase()}|${(d.edition ?? "").toLowerCase()}|${d.form ?? ""}`;

    // Duplicate check
    if (d.bookNumber && existingBookNumbers.has(d.bookNumber)) {
      skipped++;
      continue;
    }
    if (!d.bookNumber && existingComposites.has(compositeKey)) {
      skipped++;
      continue;
    }

    try {
      const numCopies = d.numCopies ?? 1;

      const catalogue = await prisma.libraryCatalogue.create({
        data: {
          schoolId: user.schoolId!,
          title:       d.title,
          bookNumber:  d.bookNumber  || null,
          subject:     d.subject     || null,
          form:        d.form        ?? null,
          author:      d.author      || null,
          publisher:   d.publisher   || null,
          edition:     d.edition     || null,
          isbn:        d.isbn        || null,
          category:    (d.category ?? "TEXTBOOK") as never,
          shelf:       d.shelf       || null,
          shelfRow:    d.shelfRow    || null,
          language:    d.language    || "English",
          publishYear: d.publishYear ?? null,
          costPerCopy: d.costPerCopy ?? null,
          totalCopies: numCopies,
        },
      });

      // Create physical copies
      for (let c = 0; c < numCopies; c++) {
        const accessionNumber = getAccession();
        await prisma.libraryCopy.create({
          data: {
            schoolId: user.schoolId!,
            catalogueId: catalogue.id,
            accessionNumber,
            qrCode:  `BIDII:${accessionNumber}`,
            condition: "GOOD" as never,
            status:    "AVAILABLE" as never,
            cost: d.costPerCopy ?? null,
          },
        });
      }

      // Track to avoid intra-batch duplicates
      if (d.bookNumber) existingBookNumbers.add(d.bookNumber);
      existingComposites.add(compositeKey);

      imported++;
    } catch (err) {
      errors.push({
        row: i + 1,
        error: err instanceof Error ? err.message : "Database error",
      });
    }
  }

  if (imported > 0) {
    emitSSE(user.schoolId!, "libraryCatalogue.bulkImported", { imported });
  }

  return NextResponse.json({ imported, skipped, errors }, { status: 200 });
}
