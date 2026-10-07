/**
 * DEPRECATED — self-service signup has been removed.
 *
 * All school accounts are created by the Super Admin (see /signup, which
 * redirects to /login). This endpoint used to stay live after the page was
 * retired, and it would create a school — or a Principal account for any
 * existing school without an active Principal — and sign the caller straight
 * in, with no verification at all.
 *
 * Kept as a stub so any stale client receives a clear error rather than a 404.
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Self-service signup is no longer available. Your school account is set up by Bidii." },
    { status: 410 }
  );
}
