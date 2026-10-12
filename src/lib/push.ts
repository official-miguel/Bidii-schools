import webpush from "web-push";
import { prisma } from "@/lib/prisma";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT || "mailto:support@example.com";
  if (!publicKey || !privateKey) return; // push simply disabled if unset
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  href?: string | null;
  tag?: string;
}

/** Sends in parallel, but never more than this many requests at once. */
const SEND_CONCURRENCY = 25;

/**
 * How long a push service holds a message for a phone that is off (seconds).
 * Long enough to survive a weekend; short enough that a phone switched on
 * after weeks isn't flooded with stale lesson reminders. The in-app bell
 * keeps every notification regardless.
 */
const TTL_SECONDS = 3 * 24 * 60 * 60;

/**
 * Sends a Web Push message to every device this user has subscribed on.
 * Silently drops (and cleans up) subscriptions the push service reports as
 * gone (410/404) — a stale subscription is expected, not an error.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  await sendPushToUsers([userId], payload);
}

/**
 * Same as sendPushToUser for many users at once — one subscription query and
 * bounded concurrency, so a school-wide announcement doesn't open hundreds of
 * connections in a single serverless invocation.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  ensureConfigured();
  if (!configured || userIds.length === 0) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: [...new Set(userIds)] } },
  });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);

  for (let i = 0; i < subs.length; i += SEND_CONCURRENCY) {
    await Promise.all(
      subs.slice(i, i + SEND_CONCURRENCY).map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
            // "high" wakes Android devices from Doze so the alert shows promptly.
            { TTL: TTL_SECONDS, urgency: "high" }
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            console.error("[push] send failed", statusCode, err);
          }
        }
      })
    );
  }
}
