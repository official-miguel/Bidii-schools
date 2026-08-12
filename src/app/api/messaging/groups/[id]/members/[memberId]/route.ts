import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify group belongs to school
  const group = await prisma.recipientGroup.findUnique({ where: { id: params.id } });
  if (!group || group.schoolId !== user.schoolId!) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const member = await prisma.groupMember.findUnique({ where: { id: params.memberId } });
  if (!member || member.groupId !== params.id) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  await prisma.groupMember.delete({ where: { id: params.memberId } });
  return NextResponse.json({ ok: true });
}
