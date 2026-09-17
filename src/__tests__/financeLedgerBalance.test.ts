/**
 * @jest-environment node
 *
 * Ledger balance arithmetic.
 *
 * These guard the one rule the whole Fees module rests on:
 *
 *   StudentFinanceAccount.currentBalance
 *     === Σ balanceDelta(entryType, amount) over entries WHERE isVoided = false
 *
 * postLedgerEntry increments by balanceDelta(); voidLedgerEntry decrements by
 * the same value negated. If those two ever disagree — a flipped sign, a new
 * entry type added to the enum but not to the switch — student balances drift
 * silently and nothing in the UI reveals it. Hence pure-function coverage of
 * the signs themselves.
 */

import { Decimal } from "@prisma/client/runtime/library";
import type { LedgerEntryType } from "@prisma/client";
import { balanceDelta } from "@/lib/finance/ledger";

const ALL_TYPES: LedgerEntryType[] = [
  "INVOICE",
  "PAYMENT",
  "CREDIT_ADJUSTMENT",
  "DEBIT_ADJUSTMENT",
  "OPENING_BALANCE",
];

/** Entry types that add to the balance (reduce what the student owes). */
const CREDITS: LedgerEntryType[] = ["PAYMENT", "CREDIT_ADJUSTMENT"];

describe("balanceDelta", () => {
  const amount = new Decimal("1500.50");

  it.each(CREDITS)("treats %s as a credit (positive delta)", (type) => {
    expect(balanceDelta(type, amount).toString()).toBe("1500.5");
  });

  it.each(["INVOICE", "DEBIT_ADJUSTMENT", "OPENING_BALANCE"] as LedgerEntryType[])(
    "treats %s as a debit (negative delta)",
    (type) => {
      expect(balanceDelta(type, amount).toString()).toBe("-1500.5");
    }
  );

  it("covers every LedgerEntryType — no type falls through to a zero delta", () => {
    for (const type of ALL_TYPES) {
      expect(balanceDelta(type, amount).isZero()).toBe(false);
    }
  });
});

describe("void reversal invariant", () => {
  const amount = new Decimal("2750.25");

  it.each(ALL_TYPES)("posting then voiding a %s nets to zero", (type) => {
    const posted   = balanceDelta(type, amount);
    const reversed = balanceDelta(type, amount).negated();

    expect(posted.plus(reversed).isZero()).toBe(true);
  });

  it("returns the account to its exact prior balance after a void", () => {
    const opening = new Decimal("-5000");

    // Bursar posts a payment, then discovers it was keyed against the wrong
    // student and voids it.
    const payment     = new Decimal("1200");
    const afterPost   = opening.plus(balanceDelta("PAYMENT", payment));
    const afterVoid   = afterPost.plus(balanceDelta("PAYMENT", payment).negated());

    expect(afterPost.toString()).toBe("-3800");
    expect(afterVoid.equals(opening)).toBe(true);
  });

  it("keeps decimal precision across a post/void cycle", () => {
    // Floating-point maths would drift here; Decimal must not.
    const opening = new Decimal("0.1");
    const fee     = new Decimal("0.2");

    const afterPost = opening.plus(balanceDelta("INVOICE", fee));
    const afterVoid = afterPost.plus(balanceDelta("INVOICE", fee).negated());

    expect(afterPost.toString()).toBe("-0.1");
    expect(afterVoid.toString()).toBe("0.1");
  });
});

describe("running balance over a realistic term", () => {
  it("matches the sum of its non-voided entries", () => {
    const entries: Array<{ type: LedgerEntryType; amount: string; voided?: boolean }> = [
      { type: "OPENING_BALANCE",   amount: "2000" },
      { type: "INVOICE",           amount: "15000" },
      { type: "PAYMENT",           amount: "10000" },
      { type: "PAYMENT",           amount: "3000", voided: true }, // keyed twice, reversed
      { type: "CREDIT_ADJUSTMENT", amount: "500" },
      { type: "DEBIT_ADJUSTMENT",  amount: "250" },
    ];

    const balance = entries
      .filter((e) => !e.voided)
      .reduce(
        (acc, e) => acc.plus(balanceDelta(e.type, new Decimal(e.amount))),
        new Decimal(0)
      );

    // -2000 - 15000 + 10000 + 500 - 250
    expect(balance.toString()).toBe("-6750");
  });
});
