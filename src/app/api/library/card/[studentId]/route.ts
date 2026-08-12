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

/** GET /api/library/card/[studentId]
 *  Returns the student's library card and all borrow records (active + history).
 *  Auto-creates the card if it doesn't exist yet.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify student belongs to this school
  const student = await prisma.student.findFirst({
    where: { id: params.studentId, schoolId: user.schoolId },
    select: {
      id: true,
      fullName: true,
      admissionNumber: true,
      schoolClass: { select: { name: true } },
    },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  // Upsert card
  const card = await prisma.libraryCard.upsert({
    where: { studentId: params.studentId },
    create: { schoolId: user.schoolId, studentId: params.studentId },
    update: {},
    include: {
      borrows: {
        orderBy: { borrowedAt: "desc" },
        include: {
          book: {
            select: { id: true, title: true, author: true, isbn: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ student, card });
}

const borrowSchema = z.object({
  bookId: z.string().min(1, "Book is required."),
});

/** POST /api/library/card/[studentId]
 *  Issue a book to the student. Creates the card if it doesn't exist.
 *  Enforces: unpaid fines, max books, and copy availability.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const student = await prisma.student.findFirst({
    where: { id: params.studentId, schoolId: user.schoolId },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const parsed = borrowSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  // Load settings
  const settings = await prisma.librarySettings.findUnique({
    where: { schoolId: user.schoolId },
  });
  const maxBooks = settings?.maxBooksPerStudent ?? 3;
  const maxDays = settings?.maxBorrowDays ?? 14;

  // Upsert card
  const card = await prisma.libraryCard.upsert({
    where: { studentId: params.studentId },
    create: { schoolId: user.schoolId, studentId: params.studentId },
    update: {},
    include: {
      borrows: { where: { returnedAt: null } },
    },
  });

  // Block if unpaid fines exist
  if (card.fineBalance > 0) {
    return NextResponse.json(
      { error: `Student has an outstanding fine of ${card.fineBalance.toFixed(2)}. Pay fine before issuing more books.` },
      { status: 422 }
    );
  }

  // Block if at max books
  if (card.borrows.length >= maxBooks) {
    return NextResponse.json(
      { error: `Student already has ${card.borrows.length} book${card.borrows.length === 1 ? "" : "s"} out (maximum is ${maxBooks}).` },
      { status: 422 }
    );
  }

  // Verify book exists and has copies available
  const book = await prisma.libraryBook.findFirst({
    where: { id: parsed.data.bookId, schoolId: user.schoolId },
    include: {
      _count: { select: { borrowRecords: { where: { returnedAt: null } } } },
    },
  });
  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

  const available = book.totalCopies - book._count.borrowRecords;
  if (available <= 0) {
    return NextResponse.json(
      { error: `No copies of "${book.title}" are currently available.` },
      { status: 422 }
    );
  }

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + maxDays);

  const borrow = await prisma.libraryBorrow.create({
    data: {
      schoolId: user.schoolId,
      cardId: card.id,
      bookId: parsed.data.bookId,
      dueAt,
    },
    include: {
      book: { select: { id: true, title: true, author: true, isbn: true } },
    },
  });

  emitSSE(user.schoolId, "libraryBorrow.issued", borrow);
  // Also emit a card update so other tabs refresh the fine balance / borrow count.
  const updatedCard = await prisma.libraryCard.findUnique({ where: { id: card.id } });
  if (updatedCard) emitSSE(user.schoolId, "libraryCard.updated", updatedCard);

  return NextResponse.json(borrow, { status: 201 });
}
