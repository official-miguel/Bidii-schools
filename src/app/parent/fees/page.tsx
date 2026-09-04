/**
 * /parent/fees
 *
 * Server component. Displays a parent's child fee balance, invoices, and
 * payment history fetched directly from Prisma.
 *
 * HARD ownership check on ?child= param — no fallback. If the param is
 * missing or the student is not owned by the authenticated parent, the page
 * shows a "Please select a child" message instead of data.
 *
 * Requirements: 7.1, 7.2, 7.3
 */

import { redirect } from "next/navigation";
import { requireParent, ownsStudent } from "@/lib/parentAuth";
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

  // 2. HARD ownership check — require ?child= and verify ownership
  const studentId = searchParams?.child ?? null;

  if (!studentId || !ownsStudent(parent, studentId)) {
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
