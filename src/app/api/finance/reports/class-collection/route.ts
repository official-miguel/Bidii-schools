/**
 * GET /api/finance/reports/class-collection — Per-class collection rate percentages
 * Returns data suitable for a Recharts BarChart.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function GET() {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const classes = await prisma.schoolClass.findMany({
    where:  { schoolId },
    select: {
      id:   true,
      name: true,
      students: {
        where:  { archivedAt: null },
        select: { id: true },
      },
    },
  });

  const results = await Promise.all(
    classes.map(async (cls) => {
      const studentIds = cls.students.map((s) => s.id);

      if (!studentIds.length) {
        return {
          className:      cls.name,
          collectionRate: 0,
          totalInvoiced:  "0",
          totalCollected: "0",
        };
      }

      const [invoiced, collected] = await Promise.all([
        prisma.ledgerEntry.aggregate({
          where: { schoolId, studentId: { in: studentIds }, entryType: "INVOICE", isVoided: false },
          _sum:  { amount: true },
        }),
        prisma.ledgerEntry.aggregate({
          where: { schoolId, studentId: { in: studentIds }, entryType: "PAYMENT", isVoided: false },
          _sum:  { amount: true },
        }),
      ]);

      const inv  = new Decimal((invoiced._sum.amount  ?? 0).toString());
      const col  = new Decimal((collected._sum.amount ?? 0).toString());
      const rate = inv.isZero()
        ? 0
        : col.div(inv).mul(100).toDecimalPlaces(1).toNumber();

      return {
        className:      cls.name,
        collectionRate: rate,
        totalInvoiced:  inv.toString(),
        totalCollected: col.toString(),
      };
    })
  );

  return NextResponse.json({ data: results });
}
