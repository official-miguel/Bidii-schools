/**
 * POST /api/finance/ledger/[entryId]/void — Reverse a mis-posted ledger entry.
 *
 * The ledger is immutable, so nothing is deleted: the entry is flagged
 * `isVoided`, its effect is backed out of the student's balance, and any
 * matching Payment receipt is flagged in the same transaction. See
 * src/lib/finance/void.ts for the invariant this preserves.
 *
 * Access: Bursar or Principal. Voiding is a supervisory correction, so the
 * Principal is deliberately allowed here (matching reconciliation/resolve)
 * rather than blocked as in payment posting — otherwise a school with one
 * bursar would have nobody able to fix that bursar's mistake.
 *
 * Body: { reason: string } — required, so a reversal is never anonymous.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";
import { voidLedgerEntry, VoidLedgerEntryError } from "@/lib/finance/void";

const voidSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Please give a reason for voiding this entry.")
    .max(500, "Reason must be 500 characters or fewer."),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { entryId: string } }
) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId, user } = auth;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = voidSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  try {
    const { entry, reversal } = await prisma.$transaction((tx) =>
      voidLedgerEntry(tx, {
        schoolId,
        entryId:    params.entryId,
        voidedById: user.id,
        reason:     parsed.data.reason,
      })
    );

    return NextResponse.json({
      ok:            true,
      ledgerEntryId: entry.id,
      studentId:     entry.studentId,
      entryType:     entry.entryType,
      amount:        entry.amount.toString(),
      reversalDelta: reversal.toString(),
    });
  } catch (err) {
    if (err instanceof VoidLedgerEntryError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === "NOT_FOUND" ? 404 : 409 }
      );
    }
    console.error("[finance/ledger/void] failed:", err);
    return NextResponse.json({ error: "Could not void this entry." }, { status: 500 });
  }
}
