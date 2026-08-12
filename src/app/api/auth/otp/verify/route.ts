/**
 * DEPRECATED — OTP login has been removed.
 *
 * Teachers now log in with their email/phone + school username as the initial
 * password, then set a personal password on first login.
 *
 * This file is kept as a stub so any stale clients receive a clear error
 * rather than a 404.  It can be deleted once all clients are updated.
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "OTP login is no longer available. Please use your email/phone and password to sign in." },
    { status: 410 }
  );
}
