/**
 * POST /api/library/catalogue/import
 *
 * Bulk-import Books and Copies from a pre-parsed JSON array.
 * The mobile client parses the CSV file and submits validated rows here.
 *
 * CSV column spec (case-insensitive):
 *   title*   — required; title-level field
 *   author   — optional
 *   edition  — optional
 *   level    — optional (free-text level, e.g. "Form 3", "Grade 7")
 *   subject  — optional
 *   copies*  — required integer; how many physical copies to create
 *
 * For each valid row:
 *   1. Find-or-create a LibraryCatalogue (Book) matching
 *      title + author (if given) + edition (if given).
 *   2. Create exactly `copies` new LibraryCopy rows, each with:
 *        - sequential school-scoped bookNumber  (BK-NNNNN, never reused)
 *        - sequential accessionNumber           (ACC-NNNNN)
 *        - signed HMAC-SHA256 qrToken
 *
 * Preview mode (?preview=true):
 *   Runs all validation but commits NOTHING.  Returns
 *   { preview: true, totalRows, totalCopies, errors }.
 *
 * Per-row error isolation:
 *   A row failing validation is added to `errors[]` and skipped;
 *   all other rows continue to be processed.
 *
 * Response (commit):
 *   {
 *     imported:    number,   // books created or reused
 *     copiesAdded: number,   // total physical copies created
 *     skipped:     number,   // rows with errors that were skipped
 *     errors: [{ row: number; error: string }]
 *   }
 *
 * Response (preview):
 *   {
 *     preview:     true,
 *     totalRows:   number,
 *     totalCopies: number,   // sum of copies column across valid rows
 *     errors: [{ row: number; error: string }]
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";
import { mintQrToken } from "@/lib/library/qr";
import { bookNumberSequencer } from "@/lib/library/bookNumber";

async function manageGuard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"))
  );
}

// ---------------------------------------------------------------------------
// Row schema
// ---------------------------------------------------------------------------

const rowSchema = z.object({
  title:   z.string().trim().min(1, "Title is required"),
  author:  z.string().trim().optional().or(z.literal("")),
  edition: z.string().trim().optional().or(z.literal("")),
  level:   z.string().trim().optional().or(z.literal("")),
  subject: z.string().trim().optional().or(z.literal("")),
  copies:  z.coerce
    .number({ invalid_type_error: 'copies must be a number' })
    .int("copies must be a whole number")
    .min(1, "copies must be at least 1")
    .max(500, "copies cannot exceed 500 per row"),
});

const bodySchema = z.object({
  rows: z.array(z.unknown()).min(1).max(5000),
});

// ---------------------------------------------------------------------------
// Accession number sequencer (internal ACC-NNNNN counter)
// ---------------------------------------------------------------------------

async function accessionSequencer(schoolId: string): Promise<() => string> {
  const last = await prisma.libraryCopy.findFirst({
    where:   { schoolId },
    orderBy: { createdAt: "desc" },
    select:  { accessionNumber: true },
  });
  let seq = 1;
  if (last) {
    const m = last.accessionNumber.match(/(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return () => `ACC-${String(seq++).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Book (catalogue) find-or-create helper
// ---------------------------------------------------------------------------

interface BookInput {
  title:   string;
  author:  string | null;
  edition: string | null;
  level:   string | null;
  subject: string | null;
}

/** Composite match key used for in-memory dedup within the same import */
function bookKey(b: BookInput): string {
  return [
    b.title.toLowerCase().trim(),
    (b.author  ?? "").toLowerCase().trim(),
    (b.edition ?? "").toLowerCase().trim(),
  ].join("|");
}

async function findOrCreateBook(
  schoolId: string,
  input: BookInput
): Promise<string /* catalogue id */> {
  // Match on title + author + edition (nulls treated as empty string for matching)
  const existing = await prisma.libraryCatalogue.findFirst({
    where: {
      schoolId,
      title:   { equals: input.title,          mode: "insensitive" },
      author:  input.author  ? { equals: input.author,  mode: "insensitive" } : null,
      edition: input.edition ? { equals: input.edition, mode: "insensitive" } : null,
    },
    select: { id: true },
  });

  if (existing) {
    // Optionally backfill level/subject if they were blank before
    if (input.level || input.subject) {
      await prisma.libraryCatalogue.update({
        where: { id: existing.id },
        data: {
          ...(input.level   ? { level:   input.level   } : {}),
          ...(input.subject ? { subject: input.subject } : {}),
        },
      });
    }
    return existing.id;
  }

  const created = await prisma.libraryCatalogue.create({
    data: {
      schoolId,
      title:      input.title,
      author:     input.author   || null,
      edition:    input.edition  || null,
      level:      input.level    || null,
      subject:    input.subject  || null,
      category:   "TEXTBOOK" as never,
      totalCopies: 0,
    },
    select: { id: true },
  });

  return created.id;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isPreview = req.nextUrl.searchParams.get("preview") === "true";

  const body      = await req.json().catch(() => null);
  const topParsed = bodySchema.safeParse(body);
  if (!topParsed.success)
    return NextResponse.json(
      { error: topParsed.error.errors[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );

  const { rows: rawRows } = topParsed.data;

  // ── Validate all rows first — collect errors without committing ──────────
  const validatedRows: Array<{
    index:  number;
    data:   z.infer<typeof rowSchema>;
  }> = [];
  const errors: Array<{ row: number; error: string }> = [];

  for (let i = 0; i < rawRows.length; i++) {
    const parsed = rowSchema.safeParse(rawRows[i]);
    if (!parsed.success) {
      errors.push({ row: i + 1, error: parsed.error.errors[0]?.message ?? "Invalid row" });
    } else {
      validatedRows.push({ index: i + 1, data: parsed.data });
    }
  }

  // ── Preview mode: return stats without writing ───────────────────────────
  if (isPreview) {
    const totalCopies = validatedRows.reduce((sum, r) => sum + r.data.copies, 0);
    return NextResponse.json({
      preview:     true,
      totalRows:   validatedRows.length,
      totalCopies,
      errors,
    });
  }

  // ── Commit mode ──────────────────────────────────────────────────────────
  const nextAccession = await accessionSequencer(user.schoolId!);
  const nextBookNum   = await bookNumberSequencer(user.schoolId!);

  // In-memory catalogue cache to avoid duplicate find-or-create within batch
  const catalogueCache = new Map<string, string>(); // bookKey → catalogueId

  let imported    = 0;
  let copiesAdded = 0;
  let skipped     = 0;

  for (const { index, data: d } of validatedRows) {
    const input: BookInput = {
      title:   d.title,
      author:  d.author  || null,
      edition: d.edition || null,
      level:   d.level   || null,
      subject: d.subject || null,
    };
    const key = bookKey(input);

    try {
      let catalogueId = catalogueCache.get(key);
      let isNew = false;

      if (!catalogueId) {
        // Check if this book already existed before this import
        const beforeCount = await prisma.libraryCatalogue.count({
          where: { schoolId: user.schoolId! },
        });
        catalogueId = await findOrCreateBook(user.schoolId!, input);
        const afterCount = await prisma.libraryCatalogue.count({
          where: { schoolId: user.schoolId! },
        });
        isNew = afterCount > beforeCount;
        catalogueCache.set(key, catalogueId);
      }

      // Create the requested number of physical copies
      for (let c = 0; c < d.copies; c++) {
        const accessionNumber = nextAccession();
        const bookNumber      = nextBookNum();
        const now             = new Date();

        await prisma.$transaction(async (tx) => {
          const copy = await tx.libraryCopy.create({
            data: {
              schoolId:       user.schoolId!,
              catalogueId,
              accessionNumber,
              bookNumber,
              qrCode:         `BIDII:${accessionNumber}`,
              qrToken:        null, // patched below
              qrIssuedAt:     null,
              condition:      "GOOD" as never,
              status:         "AVAILABLE" as never,
            },
          });

          const qrToken = mintQrToken(copy.id, user.schoolId!);
          await tx.libraryCopy.update({
            where: { id: copy.id },
            data:  { qrToken, qrIssuedAt: now },
          });
        });
      }

      // Keep catalogue totalCopies in sync
      await prisma.libraryCatalogue.update({
        where: { id: catalogueId },
        data:  { totalCopies: { increment: d.copies } },
      });

      if (isNew) imported++;
      copiesAdded += d.copies;
    } catch (err) {
      errors.push({
        row:   index,
        error: err instanceof Error ? err.message : "Database error",
      });
      skipped++;
    }
  }

  // Count reused books (rows that matched an existing catalogue)
  const reused = validatedRows.length - skipped - imported;
  void reused; // available for logging; not in response shape

  if (copiesAdded > 0) {
    emitSSE(user.schoolId!, "libraryCatalogue.bulkImported", {
      imported,
      copiesAdded,
    });
  }

  return NextResponse.json({ imported, copiesAdded, skipped, errors }, { status: 200 });
}
