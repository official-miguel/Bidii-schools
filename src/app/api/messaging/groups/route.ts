import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";

export async function GET() {
  const user = await requireSchoolPermission("COMMUNICATION", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groups = await prisma.recipientGroup.findMany({
    where:   { schoolId: user.schoolId },
    orderBy: { name: "asc" },
    include: { _count: { select: { members: true } } },
  });

  return NextResponse.json(groups);
}

const createSchema = z.object({
  name:        z.string().trim().min(2, "Name must be at least 2 characters."),
  description: z.string().trim().optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const group = await prisma.recipientGroup.create({
      data: {
        schoolId:    user.schoolId,
        name:        parsed.data.name,
        description: parsed.data.description || null,
      },
      include: { _count: { select: { members: true } } },
    });
    return NextResponse.json(group, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A group with that name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not create group." }, { status: 500 });
  }
}
