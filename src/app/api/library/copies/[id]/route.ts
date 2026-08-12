/**
 * GET    /api/library/copies/[id]  — fetch single copy detail
 * PATCH  /api/library/copies/[id]  — update condition / status / location
 * DELETE /api/library/copies/[id]  — archive copy (soft-delete)
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

  const copy = await prisma.libraryCopy.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: {
      catalogue: {
        select: {
          id: true, title: true, bookNumber: true, subject: true,
          form: true, author: true, edition: true, publisher: true,
        },
      },
    },
  });
  if (!copy) return NextResponse.json({ error: "Copy not found." }, { status: 404 });
  return NextResponse.json(copy);
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  condition:       z.enum(["EXCELLENT", "GOOD", "FAIR", "DAMAGED", "LOST"]).optional(),
  status:          z.enum(["AVAILABLE", "BORROWED", "RESERVED", "UNDER_REPAIR", "ARCHIVED"]).optional(),
  barcode:         z.string().trim().optional().or(z.literal("")),
  acquisitionDate: z.string().optional().nullable(),
  cost:            z.coerce.number().min(0).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const copy = await prisma.libraryCopy.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    select: { id: true, status: true, archivedAt: true },
  });
  if (!copy) return NextResponse.json({ error: "Copy not found." }, { status: 404 });
  if (copy.archivedAt) return NextResponse.json({ error: "Copy is archived." }, { status: 409 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );

  const d = parsed.data;

  // Cannot manually set status to BORROWED — that's done through borrow routes
  if (d.status === "BORROWED")
    return NextResponse.json(
      { error: "Status BORROWED is set automatically by the borrowing workflow." },
      { status: 400 }
    );

  const updated = await prisma.libraryCopy.update({
    where: { id: params.id },
    data: {
      ...(d.condition       !== undefined && { condition:       d.condition as never }),
      ...(d.status          !== undefined && { status:          d.status    as never }),
      ...(d.barcode         !== undefined && { barcode:         d.barcode   || null }),
      ...(d.acquisitionDate !== undefined && {
        acquisitionDate: d.acquisitionDate ? new Date(d.acquisitionDate) : null,
      }),
      ...(d.cost !== undefined && { cost: d.cost }),
    },
  });

  emitSSE(user.schoolId, "libraryCopy.updated", updated);
  return NextResponse.json(updated);
}

// ---------------------------------------------------------------------------
// DELETE — archive
// ---------------------------------------------------------------------------

const deleteSchema = z.object({
  archiveReason: z.string().trim().optional().or(z.literal("")),
});

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const copy = await prisma.libraryCopy.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    select: { id: true, catalogueId: true, archivedAt: true, status: true },
  });
  if (!copy) return NextResponse.json({ error: "Copy not found." }, { status: 404 });
  if (copy.archivedAt) return NextResponse.json({ error: "Already archived." }, { status: 409 });

  if (copy.status === "BORROWED")
    return NextResponse.json(
      { error: "Cannot archive a copy that is currently borrowed." },
      { status: 409 }
    );

  const body = await req.json().catch(() => ({}));
  const { archiveReason } = deleteSchema.parse(body);

  const archived = await prisma.$transaction(async (tx) => {
    const c = await tx.libraryCopy.update({
      where: { id: params.id },
      data: {
        archivedAt: new Date(),
        status: "ARCHIVED" as never,
        archiveReason: archiveReason || null,
      },
    });
    // Decrement catalogue totalCopies
    await tx.libraryCatalogue.update({
      where: { id: copy.catalogueId },
      data: { totalCopies: { decrement: 1 } },
    });
    return c;
  });

  emitSSE(user.schoolId, "libraryCopy.archived", { id: params.id, catalogueId: copy.catalogueId });
  return NextResponse.json(archived);
}
