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

/**
 * Sends a Web Push message to every device this user has subscribed on.
 * Silently drops (and cleans up) subscriptions the push service reports as
 * gone (410/404) — a stale subscription is expected, not an error.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  ensureConfigured();
  if (!configured) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
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
