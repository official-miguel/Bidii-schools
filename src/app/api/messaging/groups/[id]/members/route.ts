import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";

const memberSchema = z.union([
  z.object({ teacherId: z.string().cuid() }),
  z.object({ studentId: z.string().cuid() }),
  z.object({ extName: z.string().min(1), extPhone: z.string().min(7) }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = await prisma.recipientGroup.findUnique({ where: { id: params.id } });
  if (!group || group.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = memberSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const data = parsed.data as Record<string, string>;
  const member = await prisma.groupMember.create({
    data: {
      groupId:   params.id,
      teacherId: data.teacherId ?? null,
      studentId: data.studentId ?? null,
      extName:   data.extName   ?? null,
      extPhone:  data.extPhone  ?? null,
    },
    include: {
      teacher: { select: { id: true, fullName: true, staffId: true } },
      student: { select: { id: true, fullName: true, admissionNumber: true } },
    },
  });

  return NextResponse.json(member, { status: 201 });
}
