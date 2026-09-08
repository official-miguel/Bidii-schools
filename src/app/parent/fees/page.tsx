/**
 * /parent/fees
 *
 * Server component. Displays a parent's child fee balance, invoices, and
 * payment history fetched directly from Prisma. Also renders the
 * MpesaPayButton when the school has the MPESA_DARAJA integration configured
 * and at least one active paybill.
 *
 * Ownership check on ?child= param — if the param is missing and the parent
 * has exactly one linked child, we auto-select that child via a redirect so
 * single-child parents never see the "Please select a child" dead-end.
 * If the param is present but not owned by this parent, the page falls back
 * to the first owned child (multiple children) or shows the selector card
 * (no children linked).
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { requireParent, parentStudentIds } from "@/lib/parentAuth";
import { prisma } from "@/lib/prisma";
import FeesBalanceCard from "@/components/parent/FeesBalanceCard";
import InvoiceList from "@/components/parent/InvoiceList";
import PaymentHistory from "@/components/parent/PaymentHistory";
import MpesaPayButton from "@/components/parent/MpesaPayButton";

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
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Fees</h1>
        <div className="rounded-xl border border-line bg-card p-8 text-center">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-xl bg-slate/10 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-slate" />
            </div>
          </div>
          <p className="text-sm font-semibold text-foreground">
            No linked children
          </p>
          <p className="text-xs text-slate mt-1">
            Contact your school administrator to link your child to this account.
          </p>
        </div>
      </div>
    );
  }

  // Reassign for the rest of the function
  const resolvedStudentId = validStudentId;

  // 3. Fetch student name + admission number
  const student = await prisma.student.findUnique({
    where:  { id: resolvedStudentId },
    select: { fullName: true, admissionNumber: true },
  });
  if (!student) redirect("/parent");

  // 4. Fetch fees data + M-Pesa config in parallel
  const [account, invoiceRows, paymentRows, activePaybill, darajaIntegration] = await Promise.all([
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

    // Active paybill — used to show the paybill number in the pay modal
    prisma.schoolMpesaPaybill.findFirst({
      where:   { schoolId: parent.schoolId, isActive: true },
      orderBy: { createdAt: "asc" },
      select:  { paybillNumber: true },
    }).catch(() => null),

    // Check MPESA_DARAJA integration is configured for this school
    prisma.schoolIntegration.findUnique({
      where: {
        schoolId_provider: { schoolId: parent.schoolId, provider: "MPESA_DARAJA" },
      },
      select: { isActive: true },
    }).catch(() => null),
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

  // M-Pesa pay button is shown only when the school has a configured,
  // active Daraja integration AND at least one active paybill.
  const mpesaEnabled = !!(darajaIntegration?.isActive && activePaybill);
  const paybillNumber = activePaybill?.paybillNumber ?? null;

  // Suggest the outstanding amount (balance is negative = owes money)
  const suggestedAmount =
    currentBalance !== null && currentBalance < 0
      ? Math.abs(currentBalance)
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
        Fees — {student.fullName}
      </h1>

      {/* Balance card */}
      <FeesBalanceCard
        currentBalance={currentBalance}
        totalInvoiced={totalInvoiced}
        totalPaid={totalPaid}
      />

      {/* M-Pesa pay button — only shown when school has Daraja configured */}
      {mpesaEnabled && (
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">
            Make a Payment
          </h2>
          <div className="rounded-xl border border-line bg-card px-5 py-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Pay via M-Pesa
              </p>
              <p className="text-xs text-slate mt-0.5">
                {paybillNumber
                  ? `Paybill ${paybillNumber} · `
                  : ""}
                Enter an amount and your Safaricom number to receive a PIN prompt on your phone.
              </p>
            </div>
            <MpesaPayButton
              studentId={resolvedStudentId}
              studentName={student.fullName}
              admissionNumber={student.admissionNumber}
              paybillNumber={paybillNumber}
              suggestedAmount={suggestedAmount}
            />
          </div>
        </section>
      )}

      {/* Invoices */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">
          Invoices
        </h2>
        <InvoiceList invoices={invoices} />
      </section>

      {/* Payment history */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">
          Payment History
        </h2>
        <PaymentHistory payments={payments} />
      </section>
    </div>
  );
}
