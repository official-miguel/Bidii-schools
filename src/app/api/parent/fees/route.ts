/**
 * GET /api/parent/fees
 *
 * Returns the authenticated parent's active child's fee data:
 *   - currentBalance from StudentFinanceAccount
 *   - last 20 invoices ordered by generatedAt DESC
 *   - last 20 payments ordered by paidAt DESC
 *
 * Requires `?studentId=` query param. Hard ownership check — returns 403
 * if the studentId does not belong to the authenticated parent.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.6
 */

import { NextRequest, NextResponse } from "next/server";
import { requireParent, ownsStudent } from "@/lib/parentAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 1. Auth guard
  const parent = await requireParent();
  if (!parent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(parent.userId)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // 2. Ownership check — hard block, no fallback for fees
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId || !ownsStudent(parent, studentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Fetch balance, invoices, and payments in parallel
  const [account, invoices, payments] = await Promise.all([
    prisma.studentFinanceAccount
      .findUnique({
        where:  { studentId },
        select: { currentBalance: true },
      })
      .catch(() => null),

    prisma.invoice.findMany({
      where:   { studentId },
      orderBy: { generatedAt: "desc" },
      take:    20,
      select: {
        id:            true,
        invoiceNumber: true,
        totalAmount:   true,
        generatedAt:   true,
        termId:        true,
        isProrated:    true,
        term: {
          select: { name: true },
        },
      },
    }),

    prisma.payment.findMany({
      where:   { studentId },
      orderBy: { paidAt: "desc" },
      take:    20,
      select: {
        id:            true,
        receiptNumber: true,
        amount:        true,
        method:        true,
        paidAt:        true,
        reference:     true,
      },
    }),
  ]);

  return NextResponse.json({
    balance:  account ? account.currentBalance.toString() : null,
    invoices: invoices.map((inv) => ({
      id:            inv.id,
      invoiceNumber: inv.invoiceNumber,
      totalAmount:   inv.totalAmount.toString(),
      generatedAt:   inv.generatedAt,
      termName:      inv.term?.name ?? null,
      isProrated:    inv.isProrated,
    })),
    payments: payments.map((p) => ({
      id:            p.id,
      receiptNumber: p.receiptNumber,
      amount:        p.amount.toString(),
      method:        p.method,
      paidAt:        p.paidAt,
      reference:     p.reference ?? null,
    })),
  });
}
