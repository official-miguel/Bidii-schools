/**
 * src/middleware.ts
 *
 * Runs on every matched request before the page/route handler.
 * Responsibilities:
 *   1. Refresh the Supabase session cookie (keeps the JWT alive without a
 *      client-side round-trip).
 *   2. Check whether the user has a valid Bidii session cookie and redirect
 *      to /login for protected routes if not.
 *
 * Notes:
 * • We still use our own `bidii_session` cookie as the auth gate (the same
 *   opaque token verified server-side via Prisma) rather than reading the
 *   Supabase JWT. This keeps the rest of the app (layouts, API routes)
 *   unchanged.
 * • The Supabase middleware client is required by @supabase/ssr so that
 *   Server Components always receive a refreshed session — without it, the
 *   session can expire silently mid-request.
 * • Middleware runs on the Edge runtime — no Prisma here. Real auth
 *   verification happens in layouts via getCurrentUser().
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

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

  // Refresh the Supabase session cookie on every request.
  // This is a no-op when Supabase env vars are not set (dev without Supabase).
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    try {
      const supabase = createMiddlewareClient(request, response);
      // getUser() triggers the token refresh and writes updated cookies.
      await supabase.auth.getUser();
    } catch {
      // Non-fatal — if Supabase is unreachable we still want the request to
      // proceed using our own session cookie gate below.
    }
  }

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
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth|login|signup).*)",
  ],
};
