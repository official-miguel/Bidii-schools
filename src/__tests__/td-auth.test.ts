/**
 * src/__tests__/td-auth.test.ts
 *
 * The one-time pass from the Trillionaire Designs app must only be accepted
 * when it is signed with the shared secret, meant for Bidii, and fresh.
 *
 * @jest-environment node
 */

import { createHmac } from "crypto";
import { verifySsoTicket, verifyTdToken } from "@/lib/td-auth";

const SECRET = "x".repeat(48);
const NOW = 1_800_000_000;

function sign(payload: Record<string, unknown>, secret = SECRET, alg = "HS256") {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${enc({ alg, typ: "JWT" })}.${enc(payload)}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

const good = {
  iss: "trillionaire-designs",
  aud: "bidii-super-admin",
  email: "Miguel@Example.com",
  jti: "0123456789abcdef0123",
  iat: NOW,
  exp: NOW + 60,
};

describe("verifySsoTicket", () => {
  beforeEach(() => {
    process.env.TD_SSO_SECRET = SECRET;
  });

  it("accepts a fresh pass and lower-cases the email", () => {
    expect(verifySsoTicket(sign(good), NOW + 5)).toEqual({ email: "miguel@example.com", jti: good.jti, exp: NOW + 60 });
  });

  it("refuses a pass signed with another secret", () => {
    expect(verifySsoTicket(sign(good, "y".repeat(48)), NOW)).toBeNull();
  });

  it("refuses an expired pass", () => {
    expect(verifySsoTicket(sign(good), NOW + 61)).toBeNull();
  });

  it("refuses a pass that lives longer than two minutes", () => {
    expect(verifySsoTicket(sign({ ...good, exp: NOW + 3600 }), NOW)).toBeNull();
  });

  it("refuses a pass meant for something else", () => {
    expect(verifySsoTicket(sign({ ...good, aud: "other" }), NOW)).toBeNull();
    expect(verifySsoTicket(sign({ ...good, iss: "someone" }), NOW)).toBeNull();
  });

  it("refuses a tampered payload", () => {
    const [h, , s] = sign(good).split(".");
    const forged = Buffer.from(JSON.stringify({ ...good, email: "attacker@example.com" })).toString("base64url");
    expect(verifySsoTicket(`${h}.${forged}.${s}`, NOW)).toBeNull();
  });

  it("keeps sign-in passes and account checks apart", () => {
    const check = sign({ ...good, aud: "bidii-account-check" });
    expect(verifySsoTicket(check, NOW)).toBeNull();
    expect(verifyTdToken(check, "bidii-account-check", NOW)?.email).toBe("miguel@example.com");
    expect(verifyTdToken(sign(good), "bidii-account-check", NOW)).toBeNull();
  });

  it("keeps password checks apart from sign-in passes", () => {
    const check = sign({ ...good, aud: "bidii-password-check" });
    expect(verifySsoTicket(check, NOW)).toBeNull();
    expect(verifyTdToken(check, "bidii-password-check", NOW)?.email).toBe("miguel@example.com");
    expect(verifyTdToken(sign(good), "bidii-password-check", NOW)).toBeNull();
  });

  it("refuses everything when the secret is missing or short", () => {
    process.env.TD_SSO_SECRET = "short";
    expect(verifySsoTicket(sign(good, "short"), NOW)).toBeNull();
    delete process.env.TD_SSO_SECRET;
    expect(verifySsoTicket(sign(good), NOW)).toBeNull();
  });
});
