/**
 * src/middleware.ts
 *
 * Runs on every matched request before the page/route handler.
 * Responsibilities:
 *   1. Check whether the user has a valid Bidii session cookie and redirect
 *      to /login for protected routes if not.
 *
 * Authentication:
 * • We use CUSTOM password-based auth with Prisma + bcrypt (not Supabase Auth).
 * • Supabase is used ONLY for Postgres database and Storage.
 * • The `bidii_session` cookie is our auth gate (opaque token verified
 *   server-side via Prisma).
 * • Middleware runs on the Edge runtime — no Prisma here. Real auth
 *   verification happens in layouts via getCurrentUser().
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
// Note: createMiddlewareClient import removed since we don't use Supabase Auth

const SESSION_COOKIE = "bidii_session";

const PROTECTED_PREFIXES = [
  "/principal",
  "/teacher",
  "/staff",
  "/parent",
  "/results",
  "/assessments",
  "/super-admin",
];

export async function middleware(request: NextRequest) {
  // Build the base response first — the Supabase middleware client needs to
  // write refreshed cookies onto it.
  const response = NextResponse.next({ request });

  // NOTE: Supabase Auth is NOT used for authentication in this app.
  // We use custom password-based auth with Prisma + bcrypt.
  // Supabase is only used for Postgres database and Storage.
  // The Supabase Auth middleware refresh has been disabled.
  
  // If you need to re-enable Supabase Auth in the future, uncomment below:
  // if (
  //   process.env.NEXT_PUBLIC_SUPABASE_URL &&
  //   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // ) {
  //   try {
  //     const supabase = createMiddlewareClient(request, response);
  //     await supabase.auth.getUser();
  //   } catch {
  //     // Non-fatal
  //   }
  // }

  // ── Route protection via our own session cookie ─────────────────────────
  const { pathname } = request.nextUrl;
  const hasSession   = request.cookies.has(SESSION_COOKIE);
  const isProtected  = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (!hasSession && isProtected) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico, sitemap.xml, robots.txt
     * - /api/auth/* (auth routes must be public)
     * - /login, /signup (public pages)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth|api/finance/c2b|login|signup|staff-login|parent-login).*)",
  ],
};
