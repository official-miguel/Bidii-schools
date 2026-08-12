/**
 * GET   /api/library/cards/[studentId]
 *   Returns the student's full library card, borrows (active + history),
 *   and student profile. Auto-provisions the card if it doesn't exist yet.
 *
 * PATCH /api/library/cards/[studentId]
 *   Update card status, suspension reason, or renewal of expiry.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";

type Params = { params: { studentId: string } };

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

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const student = await prisma.student.findFirst({
    where: { id: params.studentId, schoolId: user.schoolId },
    select: {
      id: true, fullName: true, admissionNumber: true,
      dateOfBirth: true, archivedAt: true, archiveType: true,
      schoolClass: { select: { id: true, name: true, form: true, stream: true } },
      files: {
        where: { mimeType: { startsWith: "image/" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, mimeType: true, fileName: true },
      },
    },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const settings = await prisma.librarySettings.findUnique({
    where: { schoolId: user.schoolId },
  });

  // Auto-provision card if missing
  let card = await prisma.libraryCard.findUnique({
    where: { studentId: params.studentId },
  });

  if (!card) {
    const cardNumber   = await generateCardNumber(user.schoolId);
    const cardValidity = settings?.cardValidityDays ?? null;
    const expiresAt    = cardValidity
      ? new Date(Date.now() + cardValidity * 86_400_000)
      : null;

    // Determine initial status based on student lifecycle
    let status: "ACTIVE" | "ALUMNI" | "TRANSFERRED" = "ACTIVE";
    if (student.archiveType === "GRADUATION") status = "ALUMNI";
    else if (student.archiveType === "TRANSFER") status = "TRANSFERRED";

    card = await prisma.libraryCard.create({
      data: {
        schoolId: user.schoolId,
        studentId: params.studentId,
        cardNumber,
        status,
        expiresAt,
      },
    });
  }

  // Load borrows with copy + catalogue info
  const borrows = await prisma.libraryBorrow.findMany({
    where: { cardId: card.id },
    orderBy: { borrowedAt: "desc" },
    include: {
      copy: {
        include: {
          catalogue: {
            select: {
              id: true, title: true, author: true, bookNumber: true,
              subject: true, form: true, edition: true,
            },
          },
        },
      },
      book: { select: { id: true, title: true, author: true, isbn: true } },
    },
  });

  return NextResponse.json({
    student,
    card: { ...card, borrows },
    settings: {
      maxBooksPerStudent: settings?.maxBooksPerStudent ?? 3,
      maxBorrowDays:      settings?.maxBorrowDays ?? 14,
      finePerDay:         settings?.finePerDay ?? 5,
      maxRenewals:        settings?.maxRenewals ?? 1,
    },
  });
}

// ---------------------------------------------------------------------------
// PATCH — update card status / suspension / renewal
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  status:          z.enum(["ACTIVE", "SUSPENDED", "ALUMNI", "TRANSFERRED"]).optional(),
  suspensionReason:z.string().trim().optional().or(z.literal("")),
  /** Renew the card expiry by cardValidityDays from today */
  renew:           z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const card = await prisma.libraryCard.findFirst({
    where: { studentId: params.studentId, schoolId: user.schoolId },
  });
  if (!card) return NextResponse.json({ error: "Library card not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );

  const d = parsed.data;

  let expiresAt = card.expiresAt;
  if (d.renew) {
    const settings = await prisma.librarySettings.findUnique({
      where: { schoolId: user.schoolId },
    });
    const days = settings?.cardValidityDays ?? null;
    expiresAt = days ? new Date(Date.now() + days * 86_400_000) : null;
  }

  const updated = await prisma.libraryCard.update({
    where: { id: card.id },
    data: {
      ...(d.status !== undefined && { status: d.status as never }),
      ...(d.status === "ACTIVE"  && { suspensionReason: null }),
      ...(d.suspensionReason !== undefined && { suspensionReason: d.suspensionReason || null }),
      ...(d.renew && { expiresAt }),
    },
  });

  emitSSE(user.schoolId, "libraryCard.updated", updated);
  return NextResponse.json(updated);
}
