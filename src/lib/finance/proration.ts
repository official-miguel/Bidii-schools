/**
 * src/lib/finance/proration.ts
 *
 * Proration utilities for the Fees & Ledger module.
 *
 * Used when:
 *  - A student joins mid-term (prorated base fee)
 *  - An expense is attached mid-term (prorated expense charge)
 *
 * Granularity: daily proration = remaining days / total term days × price.
 * Returns 0 when today is on or after the term end date.
 */

import { Decimal } from "@prisma/client/runtime/library";

/**
 * Returns the number of full calendar days between two dates.
 * Uses UTC dates to avoid DST edge cases.
 */
export function daysBetween(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const fromUtc  = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc    = Date.UTC(to.getFullYear(),   to.getMonth(),   to.getDate());
  return Math.max(0, Math.floor((toUtc - fromUtc) / msPerDay));
}

/**
 * Computes the prorated amount for a given price over a term period.
 *
 * Formula: (remaining days / total term days) × price, rounded to 2 d.p.
 *
 * @param term        - Object with startDate and endDate
 * @param price       - Full price (Decimal or number)
 * @param today       - Proration date; defaults to now
 * @returns           - Prorated amount as Decimal, minimum 0
 */
export function computeProratedAmount(
  term: { startDate: Date; endDate: Date },
  price: Decimal | number,
  today: Date = new Date()
): Decimal {
  const priceDecimal  = new Decimal(price.toString());
  const totalDays     = daysBetween(term.startDate, term.endDate);
  const remainingDays = daysBetween(today, term.endDate);

  // Guard: no proration possible if term has zero length or today is past end
  if (totalDays <= 0 || remainingDays <= 0) {
    return new Decimal(0);
  }

  return priceDecimal
    .mul(remainingDays)
    .div(totalDays)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Returns the prorated amount as a number (for use in display/formatting).
 */
export function computeProratedAmountAsNumber(
  term: { startDate: Date; endDate: Date },
  price: number,
  today: Date = new Date()
): number {
  return computeProratedAmount(term, price, today).toNumber();
}
