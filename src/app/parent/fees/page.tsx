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
import { requireParent, ownsStudent, parentStudentIds } from "@/lib/parentAuth";
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

  const ownedIds = [...parentStudentIds(parent)];

  // 2. Resolve which student to show
  let studentId = searchParams?.child ?? null;

  if (!studentId || !ownsStudent(parent, studentId)) {
    if (ownedIds.length === 1) {
      // Single child — redirect to make the URL canonical so nav stays correct
      redirect(`/parent/fees?child=${ownedIds[0]}`);
    }

    if (ownedIds.length > 1 && !studentId) {
      // Multiple children, no param — redirect to the first child
      redirect(`/parent/fees?child=${ownedIds[0]}`);
    }

    // No linked children, or invalid child param with no fallback
    return (
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text">Fees</h1>
        <div className="rounded-xl border border-line bg-card p-8 text-center dark:bg-dark-surface dark:border-dark-border">
          <p className="text-3xl mb-3">💳</p>
          <p className="text-sm font-semibold text-ink dark:text-dark-text">
            Please select a child
          </p>
          <p className="text-xs text-slate dark:text-dark-muted mt-1">
            Use the child switcher to select a child and view their fee details.
          </p>
        </div>
      </div>
    );
  }

  // 3. Fetch student name
  const student = await prisma.student.findUnique({
    where:  { id: studentId },
    select: { fullName: true },
  });
  if (!student) redirect("/parent");

  // 4. Fetch fees data in parallel
  const [account, invoiceRows, paymentRows] = await Promise.all([
    prisma.studentFinanceAccount
      .findUnique({
        where:  { studentId },
        select: { currentBalance: true, totalInvoiced: true, totalPaid: true },
      })
      .catch(() => null),

    prisma.invoice.findMany({
      where:   { studentId, schoolId: parent.schoolId },
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
      where:   { studentId, schoolId: parent.schoolId },
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
