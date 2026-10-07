/**
 * DEPRECATED — served the retired signup form.
 *
 * It answered, for any email, whether that school existed and whether it had
 * an active Principal — which told anyone exactly which schools the old
 * signup endpoint could be used to take over.
 *
 * Kept as a stub so any stale client receives a clear error rather than a 404.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Self-service signup is no longer available." },
    { status: 410 }
  );
}
