/**
 * Shared Safaricom Daraja helpers for STK Push.
 *
 * Credentials come from the school's MPESA_DARAJA integration:
 *   encryptedValue: "consumerKey:consumerSecret"
 *   metadata:       { shortcode, passkey, env?: "sandbox" | "production" }
 */

import { getSchoolIntegrationKey } from "@/lib/integrations";

/** Timestamp in YYYYMMDDHHmmss format — Daraja requirement */
export function darajaTimestamp(): string {
  const n = new Date();
  return (
    n.getFullYear().toString() +
    String(n.getMonth() + 1).padStart(2, "0") +
    String(n.getDate()).padStart(2, "0") +
    String(n.getHours()).padStart(2, "0") +
    String(n.getMinutes()).padStart(2, "0") +
    String(n.getSeconds()).padStart(2, "0")
  );
}

/** Daraja password = base64(shortcode + passkey + timestamp) */
export function darajaPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(shortcode + passkey + timestamp).toString("base64");
}

export function darajaBaseUrl(env: "sandbox" | "production"): string {
  return env === "sandbox" ? "https://sandbox.safaricom.co.ke" : "https://api.safaricom.co.ke";
}

/** Bounded so a slow Daraja can never hang a callback. */
const DARAJA_TIMEOUT_MS = 5_000;

/**
 * Outcome of asking Daraja whether an STK Push was actually paid.
 *  PAID     — Daraja confirms ResultCode 0 for this CheckoutRequestID.
 *  NOT_PAID — Daraja answered, and the request did not complete.
 *  UNKNOWN  — no answer (credentials missing, network, still processing).
 */
export type StkQueryOutcome = "PAID" | "NOT_PAID" | "UNKNOWN";

/**
 * Confirms an STK Push with Daraja's STK Query API.
 *
 * The STK callback endpoint is public and authenticated only by the token in
 * its URL, so a callback body proves nothing on its own. Asking Daraja
 * directly is what makes a "paid" callback trustworthy.
 */
export async function queryStkPush(
  schoolId: string,
  checkoutRequestId: string
): Promise<StkQueryOutcome> {
  try {
    const integration = await getSchoolIntegrationKey(schoolId, "MPESA_DARAJA");
    if (!integration) return "UNKNOWN";

    const [consumerKey, consumerSecret] = integration.apiKey.split(":");
    const meta      = (integration.metadata ?? {}) as Record<string, string>;
    const shortcode = meta.shortcode;
    const passkey   = meta.passkey;
    const base      = darajaBaseUrl((meta.env ?? "production") as "sandbox" | "production");
    if (!consumerKey || !consumerSecret || !shortcode || !passkey) return "UNKNOWN";

    const tokenRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      method:  "GET",
      headers: {
        Authorization: "Basic " + Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64"),
      },
      signal: AbortSignal.timeout(DARAJA_TIMEOUT_MS),
    });
    if (!tokenRes.ok) return "UNKNOWN";
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: string };
    if (!accessToken) return "UNKNOWN";

    const timestamp = darajaTimestamp();
    const queryRes = await fetch(`${base}/mpesa/stkpushquery/v1/query`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password:          darajaPassword(shortcode, passkey, timestamp),
        Timestamp:         timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
      signal: AbortSignal.timeout(DARAJA_TIMEOUT_MS),
    });

    const data = (await queryRes.json().catch(() => null)) as
      { ResponseCode?: string | number; ResultCode?: string | number } | null;

    // Daraja answers non-200 with an errorCode while the request is still
    // being processed — that is not a "no", just not an answer yet.
    if (!queryRes.ok || !data || String(data.ResponseCode) !== "0") return "UNKNOWN";
    return String(data.ResultCode) === "0" ? "PAID" : "NOT_PAID";
  } catch {
    return "UNKNOWN";
  }
}
