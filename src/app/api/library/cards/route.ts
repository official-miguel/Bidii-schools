/**
 * GET /api/library/cards
 *
 * Lists all library cards with student info. Supports:
 *   ?q=          — search by name or admission number
 *   ?status=     — filter by card status (ACTIVE/SUSPENDED/ALUMNI/TRANSFERRED)
 *   ?hasFine=true — only students with outstanding fines
 *   ?take=       — page size (max 200)
 *   ?cursor=     — pagination cursor (card id)
 *
 * POST /api/library/cards
 *
 * Provision library cards for all eligible students who don't yet have one.
 * Respects LibrarySettings.eligibleFromForm threshold.
 * Idempotent — safe to call repeatedly.
 */
import { NextRequest, NextResponse } from "next/server";
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
// Card number generator  LIB-YYYY-NNNNN
// ---------------------------------------------------------------------------

async function generateCardNumber(schoolId: string): Promise<string> {
  const year = new Date().getFullYear();
  const last = await prisma.libraryCard.findFirst({
    where: { schoolId, cardNumber: { startsWith: `LIB-${year}-` } },
    orderBy: { createdAt: "desc" },
    select: { cardNumber: true },
  });
  let seq = 1;
  if (last?.cardNumber) {
    const m = last.cardNumber.match(/(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `LIB-${year}-${String(seq).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp       = req.nextUrl.searchParams;
  const q        = sp.get("q")?.trim() ?? "";
  const status   = sp.get("status") ?? undefined;
  const hasFine  = sp.get("hasFine") === "true";
  const take     = Math.min(Number(sp.get("take") ?? "100"), 200);
  const cursor   = sp.get("cursor") ?? undefined;

  const cards = await prisma.libraryCard.findMany({
    where: {
      schoolId: user.schoolId!,
      ...(status  ? { status: status as never } : {}),
      ...(hasFine ? { fineBalance: { gt: 0 } } : {}),
      ...(q ? {
        student: {
          OR: [
            { fullName:        { contains: q, mode: "insensitive" } },
            { admissionNumber: { contains: q, mode: "insensitive" } },
          ],
        },
      } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true, cardNumber: true, status: true, suspensionReason: true,
      expiresAt: true, fineBalance: true, totalFinesPaid: true,
      currentBorrowCount: true, totalBorrowCount: true,
      createdAt: true, updatedAt: true,
      student: {
        select: {
          id: true, fullName: true, admissionNumber: true,
          dateOfBirth: true, archivedAt: true, archiveType: true,
          schoolClass: { select: { id: true, name: true, form: true, stream: true } },
          files: {
            where: { mimeType: { startsWith: "image/" } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, mimeType: true },
          },
        },
      },
    },
  });

  const hasMore  = cards.length > take;
  const data     = hasMore ? cards.slice(0, take) : cards;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return NextResponse.json({ items: data, nextCursor });
}

// ---------------------------------------------------------------------------
// POST — provision cards for all eligible students
// ---------------------------------------------------------------------------

export async function POST(_req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.librarySettings.findUnique({
    where: { schoolId: user.schoolId! },
  });

  const eligibleFromForm = settings?.eligibleFromForm ?? null;
  const cardValidityDays = settings?.cardValidityDays ?? null;

  // Find all active (non-archived) students without a library card
  const students = await prisma.student.findMany({
    where: {
      schoolId: user.schoolId!,
      archivedAt: null,
      libraryCard: null,
      ...(eligibleFromForm !== null
        ? { schoolClass: { form: { gte: eligibleFromForm } } }
        : {}),
    },
    select: {
      id: true,
      schoolClass: { select: { form: true } },
    },
  });

  if (students.length === 0)
    return NextResponse.json({ provisioned: 0, message: "All eligible students already have cards." });

  let provisioned = 0;

  for (const student of students) {
    const cardNumber = await generateCardNumber(user.schoolId!);
    const expiresAt = cardValidityDays
      ? new Date(Date.now() + cardValidityDays * 86_400_000)
      : null;

    await prisma.libraryCard.create({
      data: {
        schoolId: user.schoolId!,
        studentId: student.id,
        cardNumber,
        status: "ACTIVE" as never,
        expiresAt,
      },
    });
    provisioned++;
  }

  emitSSE(user.schoolId!, "libraryCards.provisioned", { provisioned });
  return NextResponse.json({ provisioned });
}
