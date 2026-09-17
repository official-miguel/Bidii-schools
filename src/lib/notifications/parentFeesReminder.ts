/**
 * Mid-term fees reminder for parents.
 *
 * The school's rule: once a term reaches its halfway point, every parent whose
 * child still owes money gets one reminder that the fees are due.
 *
 * There is no explicit "fee due date" column anywhere in the schema — a term
 * carries startDate and endDate, and what is owed lives in
 * StudentFinanceAccount.currentBalance (negative = the student owes the
 * school). "Mid-term" is therefore computed as the midpoint between those two
 * dates, and the reminder fires on the first 7am Kenyan pass on or after it.
 *
 * Firing on-or-after rather than exactly on the midpoint day matters: if the
 * cron is down that morning, the reminder still goes out the next day instead
 * of being skipped for the whole term. The per-(term, student) dedup key is
 * what keeps that from becoming a daily nag.
 */

import { prisma } from "@/lib/prisma";
import { notifyParents } from "@/lib/parentNotifications";
import { kenyaHour } from "@/lib/notifications/schoolTime";

/** Format a Decimal-ish balance as e.g. "KES 12,500". */
function formatKes(amount: number): string {
  return `KES ${Math.round(amount).toLocaleString("en-KE")}`;
}

export async function runParentFeesReminderTick(now: Date = new Date()): Promise<number> {
  if (kenyaHour(now) !== 7) return 0;

  const terms = await prisma.term.findMany({
    where: {
      isActive:  true,
      startDate: { not: null },
      endDate:   { not: null },
    },
    select: { id: true, schoolId: true, name: true, academicYear: true, startDate: true, endDate: true },
  });

  let sent = 0;
  for (const term of terms) {
    const start = term.startDate!.getTime();
    const end   = term.endDate!.getTime();
    if (end <= start) continue;

    const midpoint = start + (end - start) / 2;
    // Past the halfway mark, but not after the term has finished — a closed
    // term's arrears are chased by the debtor report, not by this reminder.
    if (now.getTime() < midpoint || now.getTime() > end) continue;

    // currentBalance is negative when the student owes the school.
    const debtors = await prisma.studentFinanceAccount.findMany({
      where:  { schoolId: term.schoolId, currentBalance: { lt: 0 } },
      select: { studentId: true, currentBalance: true },
    });

    for (const account of debtors) {
      const owed = Math.abs(Number(account.currentBalance));
      if (owed <= 0) continue;

      await notifyParents({
        schoolId:  term.schoolId,
        studentId: account.studentId,
        module:    "FEES",
        priority:  "HIGH",
        title:     `Fees due — ${term.name} ${term.academicYear}`,
        body:
          `We are now at mid-term and ${formatKes(owed)} is still outstanding on your child's ` +
          `fees account for ${term.name}. Please clear the balance or contact the school office ` +
          `to arrange a payment plan.`,
        dedupKey:  `fees-midterm:${term.id}:${account.studentId}`,
        metadata:  { termId: term.id, amountDue: owed },
      });
      sent++;
    }
  }

  return sent;
}
