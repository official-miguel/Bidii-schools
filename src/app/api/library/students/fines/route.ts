import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolPermission, requireSchoolRoleForModule } from "@/lib/permissions";

/** GET /api/library/students/fines
 *  Returns all library cards with a positive fine balance, ordered by
 *  balance descending.
 */
export async function GET() {
  const user =
    (await requireSchoolRoleForModule("LIBRARY", "PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cards = await prisma.libraryCard.findMany({
    where: { schoolId: user.schoolId!, fineBalance: { gt: 0 } },
    orderBy: { fineBalance: "desc" },
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          admissionNumber: true,
          schoolClass: { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json(cards);
}

