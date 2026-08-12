import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission } from "@/lib/permissions";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSchoolPermission("COMMUNICATION", "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const message = await prisma.message.findUnique({
    where: { id: params.id },
    include: {
      sender: { select: { email: true } },
      logs:   {
        select: {
          id:             true,
          channel:        true,
          phone:          true,
          recipientLabel: true,
          status:         true,
          providerMsgId:  true,
          errorDetail:    true,
          createdAt:      true,
          updatedAt:      true,
        },
        orderBy: { recipientLabel: "asc" },
      },
    },
  });

  if (!message || message.schoolId !== user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Mask phone numbers — show only last 4 digits
  const logs = message.logs.map((l) => ({
    ...l,
    phone: l.phone.length > 4 ? `${"*".repeat(l.phone.length - 4)}${l.phone.slice(-4)}` : l.phone,
  }));

  return NextResponse.json({ ...message, logs });
}
