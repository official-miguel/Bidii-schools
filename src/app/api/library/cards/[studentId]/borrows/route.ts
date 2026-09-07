/**
 * GET /api/library/cards/[studentId]/borrows
 *
 * Returns the full borrow history for a student's library card,
 * ordered most-recent first. Active borrows (returnedAt = null) are
 * listed at the top of each page.
 *
 * Query params:
 *   page    — 1-based page (default 1)
 *   perPage — page size (default 30, max 100)
 *   active  — if "true", return only unreturned borrows
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

type Params = { params: { studentId: string } };

async function guard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"));
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp      = req.nextUrl.searchParams;
  const page    = Math.max(1, Number(sp.get("page")    ?? "1"));
  const perPage = Math.min(100, Math.max(1, Number(sp.get("perPage") ?? "30")));
  const activeOnly = sp.get("active") === "true";

  // Verify the card belongs to this school
  const card = await prisma.libraryCard.findFirst({
    where: { studentId: params.studentId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!card)
    return NextResponse.json({ error: "Library card not found." }, { status: 404 });

  const where: any = {
    cardId: card.id,
    ...(activeOnly ? { returnedAt: null } : {}),
  };

  const [total, borrows] = await Promise.all([
    prisma.libraryBorrow.count({ where }),
    prisma.libraryBorrow.findMany({
      where,
      orderBy: [{ returnedAt: "asc" }, { borrowedAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        copy: {
          select: {
            id:              true,
            accessionNumber: true,
            condition:       true,
            catalogue: {
              select: { id: true, title: true, author: true, bookNumber: true },
            },
          },
        },
        book: {
          select: { id: true, title: true, author: true, isbn: true },
        },
      },
    }),
  ]);

  return NextResponse.json({ borrows, total, page, perPage });
}