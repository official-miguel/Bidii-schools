import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolPermission("COMMUNICATION", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = await prisma.recipientGroup.findUnique({
    where:   { id: params.id },
    include: {
      members: {
        include: {
          teacher: { select: { id: true, fullName: true, staffId: true } },
          student: { select: { id: true, fullName: true, admissionNumber: true } },
        },
      },
      _count: { select: { members: true } },
    },
  });

  if (!group || group.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(group);
}

const updateSchema = z.object({
  name:        z.string().trim().min(2).optional(),
  description: z.string().trim().optional().or(z.literal("")),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = await prisma.recipientGroup.findUnique({ where: { id: params.id } });
  if (!group || group.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const updated = await prisma.recipientGroup.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name        ? { name: parsed.data.name }                : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A group with that name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not update group." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = await prisma.recipientGroup.findUnique({ where: { id: params.id } });
  if (!group || group.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Block deletion if any scheduled message targets this group
  const scheduled = await prisma.messageRecipientGroup.count({
    where: {
      groupId: params.id,
      message: { status: "PENDING", scheduledAt: { gt: new Date() } },
    },
  });

  if (scheduled > 0) {
    return NextResponse.json(
      { error: "Cannot delete — scheduled messages reference this group. Cancel them first." },
      { status: 409 }
    );
  }

  await prisma.recipientGroup.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
