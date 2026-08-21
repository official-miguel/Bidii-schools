/**
 * GET /api/finance/expense-items/[itemId] — Fetch a single expense item
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function GET(
  _req: NextRequest,
  { params }: { params: { itemId: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const item = await prisma.expenseItem.findFirst({
    where:  { id: params.itemId, schoolId },
    select: {
      id:           true,
      name:         true,
      description:  true,
      currentPrice: true,
      isActive:     true,
      category:     { select: { name: true } },
    },
  });

  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({
    item: { ...item, currentPrice: item.currentPrice.toString() },
  });
}
