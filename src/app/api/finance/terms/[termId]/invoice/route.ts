/**
 * POST /api/finance/terms/[termId]/invoice — Trigger batch invoicing for a term
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { runBatchInvoicing } from "@/lib/finance/invoicing";

export async function POST(_req: NextRequest, { params }: { params: { termId: string } }) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;
  if (user.role === "PRINCIPAL") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const term = await prisma.term.findFirst({
    where:  { id: params.termId, schoolId },
    select: { id: true, name: true, invoicingCompletedAt: true },
  });
  if (!term) return NextResponse.json({ error: "Term not found." }, { status: 404 });

  try {
    const result = await runBatchInvoicing(params.termId, schoolId, user.id);

    // Mark invoicing as completed
    await prisma.term.update({ where: { id: params.termId }, data: { invoicingCompletedAt: new Date() } });

    return NextResponse.json({ succeeded: result.succeeded, skipped: result.skipped, errors: result.errors });
  } catch (err) {
    console.error("[FINANCE/TERMS/INVOICE POST]", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
