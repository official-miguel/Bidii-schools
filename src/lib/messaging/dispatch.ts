/**
 * src/lib/messaging/dispatch.ts
 *
 * Provider-agnostic message dispatch wrapper.
 *
 * Two public entry points:
 *   dispatchMessage(schoolId, channel, phone, body)
 *     — per-school path: reads the school's own WhatsApp/SMS key from
 *       SchoolIntegration.  SMS via this path is now legacy; the platform
 *       path below is what the Communication Centre uses.
 *
 *   dispatchPlatformSms(phone, body)
 *     — platform path: reads the single PlatformSmsConfig row instead of
 *       a per-school key.  Used for:
 *         • All Communication Centre bulk-SMS sends (wallet-deducted).
 *         • Forgot-password OTP (never wallet-deducted).
 *
 * The actual HTTP call to Africa's Talking lives in one private helper —
 * sendViaAfricasTalking — shared by both paths so there is exactly one
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

// ---------------------------------------------------------------------------
// Shared Africa's Talking HTTP helper (one implementation, two callers)
// ---------------------------------------------------------------------------

async function sendViaAfricasTalking(
  phone:    string,
  body:     string,
  apiKey:   string,
  metadata: Record<string, unknown> | null
): Promise<DispatchResult> {
  const username = (metadata?.username as string) ?? "sandbox";
  const from     = (metadata?.from     as string) ?? undefined;

  const params = new URLSearchParams({
    username,
    to:      phone,
    message: body,
    ...(from ? { from } : {}),
  });

  const res = await fetch("https://api.africastalking.com/version1/messaging", {
    method:  "POST",
    headers: {
      Accept:         "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      apiKey,
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { phone, providerMsgId: null, status: "FAILED", errorDetail: text };
  }

  const json = await res.json() as {
    SMSMessageData?: { Recipients?: { messageId?: string; status?: string }[] };
  };
  const recipient = json?.SMSMessageData?.Recipients?.[0];
  const msgId     = recipient?.messageId ?? null;
  const ok        = recipient?.status === "Success" || recipient?.status === "Sent";

  return {
    phone,
    providerMsgId: msgId,
    status:        ok ? "SENT" : "FAILED",
    errorDetail:   ok ? undefined : (recipient?.status ?? "Unknown provider status"),
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

  const res = await fetch(baseUrl, {
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
  });

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
      return await sendViaAfricasTalking(phone, body, integration.apiKey, integration.metadata);
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
    return await sendViaAfricasTalking(phone, body, config.apiKey, config.metadata);
  } catch (err) {
    return {
      phone,
      providerMsgId: null,
      status:        "FAILED",
      errorDetail:   err instanceof Error ? err.message : "Unknown dispatch error.",
    };
  }
}
