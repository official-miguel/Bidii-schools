/**
 * /parent/fees
 *
 * Server component. Displays a parent's child fee balance, invoices, and
 * payment history fetched directly from Prisma.
 *
 * Ownership check on ?child= param — if the param is missing and the parent
 * has exactly one linked child, we auto-select that child via a redirect so
 * single-child parents never see the "Please select a child" dead-end.
 * If the param is present but not owned by this parent, the page falls back
 * to the first owned child (multiple children) or shows the selector card
 * (no children linked).
 *
 * Requirements: 7.1, 7.2, 7.3
 */

import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { requireParent, parentStudentIds } from "@/lib/parentAuth";
import { prisma } from "@/lib/prisma";
import FeesBalanceCard from "@/components/parent/FeesBalanceCard";
import InvoiceList from "@/components/parent/InvoiceList";
import PaymentHistory from "@/components/parent/PaymentHistory";

export const dynamic = "force-dynamic";

interface Props {
  searchParams?: { child?: string };
}

export default async function FeesPage({ searchParams }: Props) {
  // 1. Auth guard
  const parent = await requireParent();
  if (!parent) redirect("/login");

  // 2. Get owned student IDs — query directly so we never rely solely on the
  //    eagerly-loaded relation which can return empty if Prisma's include/select
  //    has a type mismatch in the deployed build.
  const [relationIds, directRows] = await Promise.all([
    Promise.resolve([...parentStudentIds(parent)]),
    prisma.parentStudent.findMany({
      where:   { parentId: parent.id },
      orderBy: { createdAt: "asc" },
      select:  { studentId: true },
    }),
  ]);

  // Prefer the direct query (guaranteed fresh), fall back to relation data.
  const ownedIds: string[] =
    directRows.length > 0
      ? directRows.map((r) => r.studentId)
      : relationIds;

  // 3. Resolve which student to show
  const studentId = searchParams?.child ?? null;

  // Build owned set for fast ownership check
  const ownedSet = new Set(ownedIds);
  const validStudentId = studentId && ownedSet.has(studentId) ? studentId : null;

  if (!validStudentId) {
    if (ownedIds.length >= 1) {
      // Auto-select the first (or only) child — no dead-end for any parent
      redirect(`/parent/fees?child=${ownedIds[0]}`);
    }

    // Truly no linked children
    return (
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">Fees</h1>
        <div className="rounded-xl border border-line bg-card p-8 text-center dark:bg-dark-surface dark:border-dark-border">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-xl bg-slate/10 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-slate dark:text-dark-muted" />
            </div>
          </div>
          <p className="text-sm font-semibold text-ink dark:text-dark-text">
            No linked children
          </p>
          <p className="text-xs text-slate dark:text-dark-muted mt-1">
            Contact your school administrator to link your child to this account.
          </p>
        </div>
      </div>
    );
  }

  // Reassign for the rest of the function
  const resolvedStudentId = validStudentId;

  // 3. Fetch student name
  const student = await prisma.student.findUnique({
    where:  { id: resolvedStudentId },
    select: { fullName: true },
  });
  if (!student) redirect("/parent");

  // 4. Fetch fees data in parallel
  const [account, invoiceRows, paymentRows] = await Promise.all([
    prisma.studentFinanceAccount
      .findUnique({
        where:  { studentId: resolvedStudentId },
        select: { currentBalance: true, totalInvoiced: true, totalPaid: true },
      })
      .catch(() => null),

    prisma.invoice.findMany({
      where:   { studentId: resolvedStudentId, schoolId: parent.schoolId },
      orderBy: { generatedAt: "desc" },
      take:    20,
      select: {
        id:            true,
        invoiceNumber: true,
        totalAmount:   true,
        generatedAt:   true,
        term:          { select: { name: true } },
      },
    }),

    prisma.payment.findMany({
      where:   { studentId: resolvedStudentId, schoolId: parent.schoolId },
      orderBy: { paidAt: "desc" },
      take:    20,
      select: {
        id:            true,
        receiptNumber: true,
        amount:        true,
        method:        true,
        paidAt:        true,
      },
    }),
  ]);

  // 5. Serialise Decimal values for the client components
  const currentBalance =
    account?.currentBalance != null
      ? parseFloat(account.currentBalance.toString())
      : null;

  const totalInvoiced =
    account?.totalInvoiced != null
      ? parseFloat(account.totalInvoiced.toString())
      : null;

  const totalPaid =
    account?.totalPaid != null
      ? parseFloat(account.totalPaid.toString())
      : null;

  const invoices = invoiceRows.map((inv) => ({
    id:            inv.id,
    invoiceNumber: inv.invoiceNumber,
    totalAmount:   parseFloat(inv.totalAmount.toString()),
    generatedAt:   inv.generatedAt.toISOString(),
    termName:      inv.term?.name ?? null,
  }));

  const payments = paymentRows.map((p) => ({
    id:            p.id,
    receiptNumber: p.receiptNumber,
    amount:        parseFloat(p.amount.toString()),
    method:        p.method,
    paidAt:        p.paidAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">
        Fees — {student.fullName}
      </h1>

      {/* Balance card */}
      <FeesBalanceCard
        currentBalance={currentBalance}
        totalInvoiced={totalInvoiced}
        totalPaid={totalPaid}
      />

      {/* Invoices */}
      <section>
        <h2 className="text-base font-semibold text-ink dark:text-dark-text mb-3">
          Invoices
        </h2>
        <InvoiceList invoices={invoices} />
      </section>

      {/* Payment history */}
      <section>
        <h2 className="text-base font-semibold text-ink dark:text-dark-text mb-3">
          Payment History
        </h2>
        <PaymentHistory payments={payments} />
      </section>
    </div>
  );
}
