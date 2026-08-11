/**
 * src/lib/supabase/client.ts
 *
 * Browser-side Supabase client. Import this in Client Components ("use client").
 * Uses @supabase/ssr's createBrowserClient so the session cookie is handled
 * consistently with the server client and middleware client.
 *
 * The anon key is safe here — RLS on every table enforces per-school isolation.
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
