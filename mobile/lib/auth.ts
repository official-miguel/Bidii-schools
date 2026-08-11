/**
 * mobile/lib/auth.ts
 *
 * Authentication store — Supabase Email OTP flow.
 *
 * Two-step flow:
 *   1. requestCode(email)  → Supabase sends a 6-digit code to the email.
 *   2. verifyCode(email, token, schoolSlug?) → verifies with Supabase, then
 *      calls our own API to look up the User row and return role + session.
 *
 * Per-school email model is preserved: if the same email exists at multiple
 * schools, the API returns requiresSchoolSlug=true and we re-submit with the
 * school identifier.
 *
 * Session is persisted to AsyncStorage via Zustand persist middleware so the
 * user stays signed in across app restarts.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requestOtp, verifyOtp, mapOtpError } from "./supabase/auth";
import { api } from "@/services/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id:         string;
  email:      string;
  role:       string;
  schoolId:   string;
  fullName?:  string;
  avatarUrl?: string | null;
}

export type LoginStep = "idle" | "code_sent" | "needs_slug" | "authenticated";

interface AuthState {
  user:        AuthUser | null;
  token:       string | null;   // Bidii session token (from our own API)
  step:        LoginStep;
  pendingEmail: string | null;  // email waiting for OTP verification
  isLoading:   boolean;
  error:       string | null;

  // Actions
  requestCode:  (email: string) => Promise<void>;
  verifyCode:   (email: string, token: string, schoolSlug?: string) => Promise<{ requiresSchoolSlug?: boolean }>;
  logout:       () => Promise<void>;
  clearError:   () => void;
  init:         () => Promise<void>;
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user:         null,
      token:        null,
      step:         "idle",
      pendingEmail: null,
      isLoading:    false,
      error:        null,

      // ── Step 1: request OTP ────────────────────────────────────────────────
      requestCode: async (email: string) => {
        set({ isLoading: true, error: null });
        try {
          const err = await requestOtp(email.trim().toLowerCase());
          if (err) {
            set({ isLoading: false, error: mapOtpError(err.message) });
            return;
          }
          set({ isLoading: false, step: "code_sent", pendingEmail: email.trim().toLowerCase() });
        } catch {
          set({ isLoading: false, error: "Couldn't reach the server. Check your connection." });
        }
      },

      // ── Step 2: verify OTP → create app session ────────────────────────────
      verifyCode: async (email: string, token: string, schoolSlug?: string) => {
        set({ isLoading: true, error: null });
        try {
          // Verify with Supabase.
          const err = await verifyOtp(email, token);
          if (err) {
            set({ isLoading: false, error: mapOtpError(err.message) });
            return {};
          }

          // Call our own API to look up the User row + create a Bidii session.
          const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? ""}/api/auth/otp/verify`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ email, token, schoolSlug }),
          });
          const data = await res.json();

          if (!res.ok) {
            if (res.status === 409 && data.requiresSchoolSlug) {
              set({ isLoading: false, step: "needs_slug" });
              return { requiresSchoolSlug: true };
            }
            set({ isLoading: false, error: data.error || "Verification failed." });
            return {};
          }

          // Store the offline token as our session token.
          const sessionToken = data.offlineToken?.userId
            ? JSON.stringify(data.offlineToken)
            : null;

          if (sessionToken) await api.setToken(sessionToken);

          set({
            isLoading:    false,
            step:         "authenticated",
            pendingEmail: null,
            token:        sessionToken,
            user: {
              id:       data.offlineToken?.userId ?? "",
              email,
              role:     data.role ?? "",
              schoolId: data.offlineToken?.schoolId ?? "",
            },
            error: null,
          });
          return {};
        } catch {
          set({ isLoading: false, error: "Couldn't reach the server. Check your connection." });
          return {};
        }
      },

      // ── Logout ──────────────────────────────────────────────────────────────
      logout: async () => {
        await api.clearToken();
        set({ user: null, token: null, step: "idle", pendingEmail: null, error: null, isLoading: false });
      },

      clearError: () => set({ error: null }),

      // ── Init: restore token into API client on app start ──────────────────
      init: async () => {
        const { token } = get();
        if (token) await api.setToken(token);
      },
    }),
    {
      name:       "@bidii:auth",
      storage:    createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ user: s.user, token: s.token }),
    }
  )
);

// ── Role helpers (unchanged API) ──────────────────────────────────────────────

export const ROLES = {
  PRINCIPAL:  "PRINCIPAL",
  ADMIN_STAFF: "ADMIN_STAFF",
  LIBRARIAN:  "ADMIN_STAFF",
  TEACHER:    "TEACHER",
  STUDENT:    "STUDENT",
} as const;

export type UserRole = keyof typeof ROLES;

export function hasRole(allowedRoles: UserRole[]): boolean {
  const user = useAuth.getState().user;
  if (!user) return false;
  return allowedRoles.includes(user.role as UserRole);
}

export const isPrincipal  = () => useAuth.getState().user?.role === "PRINCIPAL";
export const isLibrarian  = () => useAuth.getState().user?.role === "ADMIN_STAFF";
export const isStudent    = () => useAuth.getState().user?.role === "STUDENT";
export const isTeacher    = () => useAuth.getState().user?.role === "TEACHER";
export const getDisplayName = () =>
  useAuth.getState().user?.email.split("@")[0] ?? "User";
