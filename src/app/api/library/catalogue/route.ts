/**
 * GET  /api/library/catalogue   — list/search catalogue records
 * POST /api/library/catalogue   — create a new catalogue entry
 *
 * GET supports two response modes via ?view= param:
 *   view=list    (default) — summary rows, no copy details
 *   view=grouped           — each title row includes its copies array with
 *                            per-copy status, condition, bookNumber, etc.
 *                            Used by the circulation-search UI so results
 *                            show "1 title × N copies" rather than N rows.
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
// GET — list / search
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const q        = sp.get("q")?.trim() ?? "";
  const subject  = sp.get("subject") ?? undefined;
  const form     = sp.get("form") ? Number(sp.get("form")) : undefined;
  const level    = sp.get("level") ?? undefined;
  const category = sp.get("category") ?? undefined;
  const shelf    = sp.get("shelf") ?? undefined;
  const archived = sp.get("archived") === "true";
  const view     = sp.get("view") ?? "list";           // "list" | "grouped"
  const take     = Math.min(Number(sp.get("take") ?? "200"), 500);
  const cursor   = sp.get("cursor") ?? undefined;

  const rows = await prisma.libraryCatalogue.findMany({
    where: {
      schoolId: user.schoolId!,
      archivedAt: archived ? { not: null } : null,
      ...(subject ? { subject } : {}),
      ...(form !== undefined ? { form } : {}),
      ...(level   ? { level: { contains: level, mode: "insensitive" } } : {}),
      ...(category ? { category: category as never } : {}),
      ...(shelf    ? { shelf    } : {}),
      ...(q ? {
        OR: [
          { title:      { contains: q, mode: "insensitive" } },
          { author:     { contains: q, mode: "insensitive" } },
          { bookNumber: { contains: q, mode: "insensitive" } },
          { isbn:       { contains: q, mode: "insensitive" } },
          { subject:    { contains: q, mode: "insensitive" } },
          { level:      { contains: q, mode: "insensitive" } },
          { edition:    { contains: q, mode: "insensitive" } },
        ],
      } : {}),
    },
    orderBy: { title: "asc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      _count: { select: { copies: true } },
      copies: {
        where:  { archivedAt: null },
        select: {
          id:              true,
          bookNumber:      true,
          accessionNumber: true,
          status:          true,
          condition:       true,
        },
        orderBy: { bookNumber: "asc" },
      },
    },
  });

  const hasMore    = rows.length > take;
  const data       = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (data as any[]).map((c) => {
    const copies = c.copies as Array<{
      id: string; bookNumber: string | null;
      accessionNumber: string; status: string; condition: string;
    }>;

    const base = {
      id:              c.id,
      title:           c.title,
      author:          c.author,
      edition:         c.edition,
      level:           c.level,
      subject:         c.subject,
      form:            c.form,
      bookNumber:      c.bookNumber,
      category:        c.category,
      shelf:           c.shelf,
      shelfRow:        c.shelfRow,
      language:        c.language,
      totalCopies:     copies.length,
      availableCopies: copies.filter((x) => x.status === "AVAILABLE").length,
      checkedOut:      copies.filter((x) => x.status === "BORROWED").length,
      reserved:        copies.filter((x) => x.status === "RESERVED").length,
      lost:            copies.filter((x) => x.status === "ARCHIVED" || x.status === "LOST").length,
      archivedAt:      c.archivedAt,
      createdAt:       c.createdAt,
      updatedAt:       c.updatedAt,
    };

    // Grouped view: attach copies list for circulation search
    if (view === "grouped") {
      return { ...base, copies };
    }
    return base;
  });

  return NextResponse.json({ items, nextCursor });
}

// ---------------------------------------------------------------------------
// POST — create
// ---------------------------------------------------------------------------

const createSchema = z.object({
  title:       z.string().trim().min(1, "Title is required"),
  bookNumber:  z.string().trim().optional().or(z.literal("")),
  subject:     z.string().trim().optional().or(z.literal("")),
  level:       z.string().trim().optional().or(z.literal("")),
  form:        z.coerce.number().int().min(1).max(8).optional().nullable(),
  author:      z.string().trim().optional().or(z.literal("")),
  publisher:   z.string().trim().optional().or(z.literal("")),
  edition:     z.string().trim().optional().or(z.literal("")),
  isbn:        z.string().trim().optional().or(z.literal("")),
  category:    z.string().optional(),
  shelf:       z.string().trim().optional().or(z.literal("")),
  shelfRow:    z.string().trim().optional().or(z.literal("")),
  language:    z.string().trim().optional(),
  publishYear: z.coerce.number().int().min(1000).max(2100).optional().nullable(),
  purchaseDate:z.string().optional().nullable(),
  costPerCopy: z.coerce.number().min(0).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );

  const d = parsed.data;

  // Duplicate bookNumber check
  if (d.bookNumber) {
    const exists = await prisma.libraryCatalogue.findFirst({
      where: { schoolId: user.schoolId!, bookNumber: d.bookNumber },
      select: { id: true },
    });
    if (exists)
      return NextResponse.json(
        { error: `Book number "${d.bookNumber}" already exists in the catalogue.` },
        { status: 409 }
      );
  }

  const catalogue = await prisma.libraryCatalogue.create({
    data: {
      schoolId: user.schoolId!,
      title:       d.title,
      bookNumber:  d.bookNumber || null,
      subject:     d.subject   || null,
      level:       d.level     || null,
      form:        d.form      ?? null,
      author:      d.author    || null,
      publisher:   d.publisher || null,
      edition:     d.edition   || null,
      isbn:        d.isbn      || null,
      category:    (d.category ?? "TEXTBOOK") as never,
      shelf:       d.shelf     || null,
      shelfRow:    d.shelfRow  || null,
      language:    d.language  || "English",
      publishYear: d.publishYear ?? null,
      purchaseDate:d.purchaseDate ? new Date(d.purchaseDate) : null,
      costPerCopy: d.costPerCopy ?? null,
    },
  });

  emitSSE(user.schoolId!, "libraryCatalogue.created", catalogue);
  return NextResponse.json(catalogue, { status: 201 });
}
