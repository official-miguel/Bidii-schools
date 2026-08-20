/**
 * GET /api/finance/students — Paginated student finance list with search and filters
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBursarOrPrincipal } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await requireBursarOrPrincipal();
  if (auth.error) return auth.error;
  const { schoolId } = auth;

  const { searchParams } = new URL(req.url);
  const search      = searchParams.get("search") ?? "";
  const form        = searchParams.get("form") ? parseInt(searchParams.get("form")!, 10) : undefined;
  const stream      = searchParams.get("stream");
  const balanceOp   = searchParams.get("balanceOp") as "gt" | "lt" | "between" | null;
  const balanceVal  = searchParams.get("balanceVal")  ? parseFloat(searchParams.get("balanceVal")!)  : undefined;
  const balanceVal2 = searchParams.get("balanceVal2") ? parseFloat(searchParams.get("balanceVal2")!) : undefined;
  const page        = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize    = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10)));

  // Build balance filter for StudentFinanceAccount
  let balanceFilter: Record<string, unknown> | undefined;
  if (balanceOp && balanceVal !== undefined) {
    if (balanceOp === "gt")      balanceFilter = { gt: balanceVal };
    else if (balanceOp === "lt") balanceFilter = { lt: balanceVal };
    else if (balanceOp === "between" && balanceVal2 !== undefined)
      balanceFilter = { gte: Math.min(balanceVal, balanceVal2), lte: Math.max(balanceVal, balanceVal2) };
  }

  const classWhere = {
    schoolId,
    ...(form   ? { form }   : {}),
    ...(stream ? { stream } : {}),
  };

  const baseWhere = {
    schoolId,
    archivedAt: null,
    ...(search ? {
      OR: [
        { fullName:        { contains: search, mode: "insensitive" as const } },
        { admissionNumber: { contains: search, mode: "insensitive" as const } },
      ],
    } : {}),
    schoolClass: { ...classWhere },
    ...(balanceFilter ? { financeAccount: { currentBalance: balanceFilter } } : {}),
  };

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where:   baseWhere,
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      orderBy: { fullName: "asc" },
      select: {
        id: true, fullName: true, admissionNumber: true,
        schoolClass:    { select: { name: true, form: true, stream: true } },
        financeAccount: { select: { currentBalance: true, financeSetupCompletedAt: true, totalInvoiced: true, totalPaid: true } },
      },
    }),
    prisma.student.count({ where: baseWhere }),
  ]);

  return NextResponse.json({
    students: students.map((s) => ({
      ...s,
      financeAccount: s.financeAccount ? {
        ...s.financeAccount,
        currentBalance: s.financeAccount.currentBalance.toString(),
        totalInvoiced:  s.financeAccount.totalInvoiced.toString(),
        totalPaid:      s.financeAccount.totalPaid.toString(),
        financePending: !s.financeAccount.financeSetupCompletedAt,
      } : { financePending: true },
    })),
    total,
    page,
    pageSize,
  });
}
