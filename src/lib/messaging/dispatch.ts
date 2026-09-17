/**
 * src/lib/messaging/dispatch.ts
 *
 * Provider-agnostic message dispatch wrapper.
 *
 * Two public entry points:
 *   dispatchMessage(schoolId, channel, phone, body)
 *     — per-school path: reads the school's own WhatsApp/SMS credentials from
 *       SchoolIntegration, set by a super admin on that school's SMS tab.
 *       Everything the Communication Centre sends goes through here, so each
 *       school bills its own Mobivas account.
 *
 *   dispatchPlatformSms(phone, body)
 *     — platform path: reads the single PlatformSmsConfig row instead of a
 *       per-school key. Reserved for forgot-password OTP, which has to work
 *       before anyone is logged into a school and is paid for centrally.
 *       Configured under /super-admin/settings (owner only).
 *
 * The actual HTTP call to SMSMobivas lives in one private helper —
 * sendViaSMSMobivas — shared by both paths so there is exactly one
 * implementation.
 *
 * SERVER-SIDE ONLY.
 */

import type { MessageChannel } from "@prisma/client";
import { getSchoolIntegrationKey } from "@/lib/integrations";
import { getPlatformSmsKey }        from "@/lib/platform-sms";

export type DispatchResult = {
  phone:         string;
  providerMsgId: string | null;
  status:        "SENT" | "FAILED";
  errorDetail?:  string;
};

/**
 * Hard cap on how long we wait for a provider's HTTP response.
 *
 * Neither adapter used to pass a `signal`, so a slow or hanging gateway
 * blocked the request indefinitely — for OTP that meant the forgot-password
 * endpoint could sit there until the platform itself killed the function
 * (a bare 504, with no way to tell whether the code actually went out).
 * 8s leaves headroom under the 15s maxDuration set for that route while
 * still being generous for a normal SMS/WhatsApp API call.
 */
const PROVIDER_TIMEOUT_MS = 8_000;

function timeoutErrorDetail(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") {
    return `Provider did not respond within ${PROVIDER_TIMEOUT_MS / 1000}s.`;
  }
  return err instanceof Error ? err.message : "Unknown dispatch error.";
}

// ---------------------------------------------------------------------------
// Shared SMSMobivas HTTP helper (one implementation, two callers)
// ---------------------------------------------------------------------------

async function sendViaSMSMobivas(
  phone:    string,
  body:     string,
  apiKey:   string,
  metadata: Record<string, unknown> | null
): Promise<DispatchResult> {
  const clientId = (metadata?.clientId as string) ?? "";
  const senderId = (metadata?.senderId as string) ?? "";

  if (!clientId || !senderId) {
    return {
      phone,
      providerMsgId: null,
      status: "FAILED" as const,
      errorDetail: "Missing clientId or senderId in platform SMS config.",
    };
  }

  // SMSMobivas expects phone numbers without the leading +
  const cleanPhone = phone.replace(/^\+/, "");

  const params = new URLSearchParams({
    ApiKey:       apiKey,
    ClientId:     clientId,
    SenderId:     senderId,
    Message:      body,
    MobileNumbers: cleanPhone,
  });

  const url = `https://user.smsmobivas.co.ke/api/v2/SendSMS?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method:  "GET",
      headers: { Accept: "application/json" },
      signal:  AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (err) {
    return { phone, providerMsgId: null, status: "FAILED" as const, errorDetail: timeoutErrorDetail(err) };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { phone, providerMsgId: null, status: "FAILED" as const, errorDetail: text };
  }

  const json = await res.json() as {
    ErrorCode?: number;
    ErrorDescription?: string;
    Data?: { MobileNumber?: string; MessageId?: string }[];
  };

  const errorCode = json.ErrorCode ?? -1;
  const ok = errorCode === 0;
  const msgId = json.Data?.[0]?.MessageId ?? null;

  return {
    phone,
    providerMsgId: msgId,
    status: ok ? ("SENT" as const) : ("FAILED" as const),
    errorDetail: ok ? undefined : (json.ErrorDescription ?? `Error code ${errorCode}`),
  };
}

// ---------------------------------------------------------------------------
// WhatsApp adapter (360dialog / Meta Cloud API shape) — unchanged
// ---------------------------------------------------------------------------

async function dispatchWhatsApp(
  phone:    string,
  body:     string,
  apiKey:   string,
  metadata: Record<string, unknown> | null
): Promise<DispatchResult> {
  // Normalise to E.164 without leading +
  const to      = phone.replace(/^\+/, "").replace(/\D/g, "");
  const baseUrl = (metadata?.baseUrl as string) ?? "https://waba.360dialog.io/v1/messages";

  let res: Response;
  try {
    res = await fetch(baseUrl, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "D360-API-KEY": apiKey,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (err) {
    return { phone, providerMsgId: null, status: "FAILED", errorDetail: timeoutErrorDetail(err) };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { phone, providerMsgId: null, status: "FAILED", errorDetail: text };
  }

  const json  = await res.json() as { messages?: { id?: string }[] };
  const msgId = json?.messages?.[0]?.id ?? null;
  return { phone, providerMsgId: msgId, status: "SENT" };
}

// ---------------------------------------------------------------------------
// Per-school dispatch (legacy SMS path + WhatsApp — unchanged behaviour)
// ---------------------------------------------------------------------------

export async function dispatchMessage(
  schoolId: string,
  channel:  MessageChannel,
  phone:    string,
  body:     string
): Promise<DispatchResult> {
  const provider    = channel === "SMS" ? "SMS" : "WHATSAPP";
  const integration = await getSchoolIntegrationKey(schoolId, provider);

  if (!integration) {
    return {
      phone,
      providerMsgId: null,
      status:        "FAILED",
      errorDetail:   `${provider} integration is not configured for this school.`,
    };
  }

  if (!phone || !/\d{7,}/.test(phone.replace(/[^0-9+]/g, ""))) {
    return {
      phone,
      providerMsgId: null,
      status:        "FAILED",
      errorDetail:   "Invalid phone number format.",
    };
  }

  try {
    if (channel === "SMS") {
      return await sendViaSMSMobivas(phone, body, integration.apiKey, integration.metadata);
    } else {
      return await dispatchWhatsApp(phone, body, integration.apiKey, integration.metadata);
    }
  } catch (err) {
    return {
      phone,
      providerMsgId: null,
      status:        "FAILED",
      errorDetail:   err instanceof Error ? err.message : "Unknown dispatch error.",
    };
  }
}

// ---------------------------------------------------------------------------
// Platform SMS dispatch (centralised key — Communication Centre + OTP)
// ---------------------------------------------------------------------------

export async function dispatchPlatformSms(
  phone: string,
  body:  string
): Promise<DispatchResult> {
  const config = await getPlatformSmsKey();

  if (!config) {
    return {
      phone,
      providerMsgId: null,
      status:        "FAILED",
      errorDetail:   "Platform SMS is not configured. Ask a Super Admin to set the API key in Settings → SMS.",
    };
  }

  if (!phone || !/\d{7,}/.test(phone.replace(/[^0-9+]/g, ""))) {
    return {
      phone,
      providerMsgId: null,
      status:        "FAILED",
      errorDetail:   "Invalid phone number format.",
    };
  }

  try {
    return await sendViaSMSMobivas(phone, body, config.apiKey, config.metadata);
  } catch (err) {
    return {
      phone,
      providerMsgId: null,
      status:        "FAILED",
      errorDetail:   err instanceof Error ? err.message : "Unknown dispatch error.",
    };
  }
}
