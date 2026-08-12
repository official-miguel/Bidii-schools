import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

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

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const books = await prisma.libraryBook.findMany({
    where: {
      schoolId: user.schoolId,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { author: { contains: q, mode: "insensitive" } },
              { isbn: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { title: "asc" },
    include: {
      _count: {
        select: {
          borrowRecords: {
            where: { returnedAt: null },
          },
        },
      },
    },
  });

  // Attach copiesOut count for availability display
  return NextResponse.json(
    books.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      isbn: b.isbn,
      publisher: b.publisher,
      publishYear: b.publishYear,
      totalCopies: b.totalCopies,
      copiesOut: b._count.borrowRecords,
      available: b.totalCopies - b._count.borrowRecords,
      createdAt: b.createdAt,
    }))
  );
}

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  author: z.string().trim().optional().or(z.literal("")),
  isbn: z.string().trim().optional().or(z.literal("")),
  publisher: z.string().trim().optional().or(z.literal("")),
  publishYear: z.coerce.number().int().min(1000).max(2100).optional().nullable(),
  totalCopies: z.coerce.number().int().min(1).default(1),
});

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const { title, author, isbn, publisher, publishYear, totalCopies } = parsed.data;

  // ISBN uniqueness check
  if (isbn) {
    const existing = await prisma.libraryBook.findFirst({
      where: { schoolId: user.schoolId, isbn },
    });
    if (existing) {
      return NextResponse.json(
        { error: `A book with ISBN "${isbn}" already exists.` },
        { status: 409 }
      );
    }
  }

  const book = await prisma.libraryBook.create({
    data: {
      schoolId: user.schoolId,
      title,
      author: author || null,
      isbn: isbn || null,
      publisher: publisher || null,
      publishYear: publishYear ?? null,
      totalCopies,
    },
  });

  return NextResponse.json(book, { status: 201 });
}
