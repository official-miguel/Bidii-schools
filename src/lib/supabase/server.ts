/**
 * src/lib/supabase/server.ts
 *
 * Server-side Supabase client. Import this in Server Components, Route
 * Handlers, and Server Actions. Reads/writes session cookies via next/headers.
 *
 * Use createAdminClient() when you need to bypass RLS (e.g. creating a user
 * record during OTP verification). Never expose the service role key to the
 * browser.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Standard server client — uses the anon key, respects RLS. */
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from Server Components where cookies cannot be
            // mutated. The middleware client handles refresh in that case.
          }
        },
      },
    }
  );
}

/**
 * Admin (service-role) client — bypasses RLS.
 * Only call this server-side in tightly scoped places (e.g. OTP verify,
 * signup, admin operations). Never pass this client to the browser.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
