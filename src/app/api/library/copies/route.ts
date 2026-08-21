/**
 * GET  /api/library/copies          — list copies (optionally filtered)
 * POST /api/library/copies          — register new physical copy/copies
 *
 * Each new copy gets:
 *   - accessionNumber  : ACC-NNNNN   (internal sequential ID, unchanged)
 *   - bookNumber       : BK-NNNNN    (human-readable sticker number, never reused)
 *   - qrToken          : signed HMAC-SHA256 token  { copy_id, school_id, issued_at }
 *   - qrCode           : legacy plain payload kept for backward compat
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";
import { mintQrToken } from "@/lib/library/qr";
import { bookNumberSequencer } from "@/lib/library/bookNumber";

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
// Accession number generator — internal sequential (ACC-NNNNN)
// ---------------------------------------------------------------------------

async function nextAccessionNumber(schoolId: string): Promise<string> {
  const last = await prisma.libraryCopy.findFirst({
    where:   { schoolId },
    orderBy: { createdAt: "desc" },
    select:  { accessionNumber: true },
  });

  let next = 1;
  if (last) {
    const match = last.accessionNumber.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `ACC-${String(next).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp          = req.nextUrl.searchParams;
  const catalogueId = sp.get("catalogueId") ?? undefined;
  const status      = sp.get("status") ?? undefined;
  const archived    = sp.get("archived") === "true";
  const q           = sp.get("q")?.trim() ?? undefined;

  const copies = await prisma.libraryCopy.findMany({
    where: {
      schoolId: user.schoolId!,
      ...(catalogueId ? { catalogueId } : {}),
      ...(status      ? { status: status as never } : {}),
      archivedAt: archived ? { not: null } : null,
      ...(q ? {
        OR: [
          { accessionNumber: { contains: q, mode: "insensitive" } },
          { bookNumber:      { contains: q, mode: "insensitive" } },
          { catalogue: { title:      { contains: q, mode: "insensitive" } } },
          { catalogue: { bookNumber: { contains: q, mode: "insensitive" } } },
          { catalogue: { author:     { contains: q, mode: "insensitive" } } },
        ],
      } : {}),
    },
    orderBy: { accessionNumber: "asc" },
    take: q ? 10 : undefined,
    include: {
      catalogue: {
        select: {
          id: true, title: true, bookNumber: true,
          subject: true, form: true, level: true, author: true,
        },
      },
    },
  });

  // Never expose qrToken in list responses — only in single-copy or QR-sheet endpoints
  return NextResponse.json(
    copies.map(({ qrToken: _qrToken, ...c }) => c)
  );
}

// ---------------------------------------------------------------------------
// POST — register new copy/copies
// ---------------------------------------------------------------------------

const createSchema = z.object({
  catalogueId:     z.string().min(1, "Catalogue entry is required"),
  accessionNumber: z.string().trim().optional().or(z.literal("")),
  barcode:         z.string().trim().optional().or(z.literal("")),
  condition:       z.enum(["EXCELLENT", "GOOD", "FAIR", "DAMAGED", "LOST"]).optional(),
  acquisitionDate: z.string().optional().nullable(),
  cost:            z.coerce.number().min(0).optional().nullable(),
  /** Number of copies to register in bulk (default 1, max 500) */
  count:           z.coerce.number().int().min(1).max(500).optional(),
});

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );

  const d     = parsed.data;
  const count = d.count ?? 1;

  // Verify catalogue belongs to this school
  const catalogue = await prisma.libraryCatalogue.findFirst({
    where:  { id: d.catalogueId, schoolId: user.schoolId! },
    select: { id: true, costPerCopy: true },
  });
  if (!catalogue)
    return NextResponse.json({ error: "Catalogue entry not found." }, { status: 404 });

  // Explicit accession number only allowed for single-copy registration
  if (d.accessionNumber && count > 1)
    return NextResponse.json(
      { error: "Specify an accession number only when registering a single copy." },
      { status: 400 }
    );

  // Uniqueness check when explicit accession given
  if (d.accessionNumber) {
    const existing = await prisma.libraryCopy.findFirst({
      where:  { schoolId: user.schoolId!, accessionNumber: d.accessionNumber },
      select: { id: true },
    });
    if (existing)
      return NextResponse.json(
        { error: `Accession number "${d.accessionNumber}" already exists.` },
        { status: 409 }
      );
  }

  // Pre-fetch book-number sequencer so bulk creates avoid N DB round-trips
  const nextBookNum = await bookNumberSequencer(user.schoolId!);
  const now         = new Date();

  const created: Awaited<ReturnType<typeof prisma.libraryCopy.create>>[] = [];

  for (let i = 0; i < count; i++) {
    const accessionNumber =
      count === 1 && d.accessionNumber
        ? d.accessionNumber
        : await nextAccessionNumber(user.schoolId!);

    const bookNumber = nextBookNum();

    // Mint signed QR token — copy_id not known yet, so we use a placeholder
    // and update immediately after create inside a transaction.
    const copy = await prisma.$transaction(async (tx) => {
      const c = await tx.libraryCopy.create({
        data: {
          schoolId:       user.schoolId!,
          catalogueId:    d.catalogueId,
          accessionNumber,
          bookNumber,
          qrCode:         `BIDII:${accessionNumber}`, // legacy plain payload
          qrToken:        null, // set below once we have the id
          qrIssuedAt:     null,
          barcode:        count === 1 ? (d.barcode || null) : null,
          condition:      (d.condition ?? "GOOD") as never,
          status:         "AVAILABLE" as never,
          acquisitionDate: d.acquisitionDate ? new Date(d.acquisitionDate) : null,
          cost:           d.cost ?? catalogue.costPerCopy ?? null,
        },
      });

      // Now we have the copy id — mint the real signed token
      const qrToken = mintQrToken(c.id, user.schoolId!);
      return tx.libraryCopy.update({
        where: { id: c.id },
        data:  { qrToken, qrIssuedAt: now },
      });
    });

    created.push(copy);
  }

  // Increment totalCopies on catalogue
  await prisma.libraryCatalogue.update({
    where: { id: d.catalogueId },
    data:  { totalCopies: { increment: count } },
  });

  emitSSE(user.schoolId!, "libraryCopy.created", { catalogueId: d.catalogueId, count });

  const response = count === 1
    ? { ...created[0], qrToken: undefined } // strip token from standard response
    : { created: created.length, copies: created.map(({ qrToken: _t, ...c }) => c) };

  return NextResponse.json(response, { status: 201 });
}
