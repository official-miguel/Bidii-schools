/**
 * mobile/lib/supabase/client.ts
 *
 * Supabase client for React Native. Uses AsyncStorage for session persistence
 * instead of localStorage (which doesn't exist on native).
 *
 * detectSessionInUrl is disabled — deep-link OAuth is not used; we use
 * email OTP only.
 */

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? "";
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.warn(
    "[Supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is not set. " +
    "Add them to mobile/.env"
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:             AsyncStorage,
    autoRefreshToken:    true,
    persistSession:      true,
    detectSessionInUrl:  false,
  },
});
