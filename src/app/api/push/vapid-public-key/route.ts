import { NextResponse } from "next/server";

// Read the env per request; a GET handler is otherwise prerendered at build.
export const dynamic = "force-dynamic";

/**
 * GET /api/push/vapid-public-key — the Web Push application server key.
 *
 * Public by design (it is also baked into the client bundle). The service
 * worker is a static file with no build-time env, so it reads the key here
 * when it has to re-subscribe after the browser rotates a subscription.
 */
export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || null;
  if (!publicKey) return NextResponse.json({ publicKey: null }, { status: 404 });
  return NextResponse.json({ publicKey });
}
