/**
 * mobile/lib/auth.ts
 *
 * Authentication store — email/phone + password login.
 *
 * Flow:
 *   1. login(identifier, password, schoolSlug?)
 *        → POST /api/auth/login
 *        → returns { role, mustChangePassword, offlineToken }
 *        → if mustChangePassword === true, navigate to set-password screen
 *
 *   2. setPassword(newPassword)
 *        → POST /api/auth/change-password
 *        → clears mustChangePassword, rotates session
 *
 * Per-school email model:
 *   Same email at multiple schools → API returns requiresSchoolSlug=true (409).
 *   Client shows the school username field and re-submits.
 *
 * Session is persisted to AsyncStorage via Zustand persist middleware so the
 * user stays signed in across app restarts.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/services/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id:               string;
  email:            string;
  role:             string;
  schoolId:         string;
  fullName?:        string;
  avatarUrl?:       string | null;
  mustChangePassword: boolean;
}

interface AuthState {
  user:      AuthUser | null;
  token:     string | null;
  isLoading: boolean;
  error:     string | null;

  // Actions
  login:       (identifier: string, password: string, schoolSlug?: string) => Promise<{ requiresSchoolSlug?: boolean }>;
  setPassword: (newPassword: string) => Promise<boolean>;
  logout:      () => Promise<void>;
  clearError:  () => void;
  init:        () => Promise<void>;
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user:      null,
      token:     null,
      isLoading: false,
      error:     null,

      // ── Login ──────────────────────────────────────────────────────────────
      login: async (identifier, password, schoolSlug) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(
            `${process.env.EXPO_PUBLIC_API_URL ?? ""}/api/auth/login`,
            {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({
                identifier: identifier.trim().toLowerCase(),
                password,
                ...(schoolSlug ? { schoolSlug: schoolSlug.trim().replace(/^@/, "") } : {}),
              }),
            }
          );
          const data = await res.json();

          if (!res.ok) {
            if (res.status === 409 && data.requiresSchoolSlug) {
              set({ isLoading: false });
              return { requiresSchoolSlug: true };
            }
            set({ isLoading: false, error: data.error || "Incorrect email/phone or password." });
            return {};
          }

          // Store the offline token so API calls can attach it as Bearer
          const sessionToken = data.offlineToken
            ? JSON.stringify(data.offlineToken)
            : null;
          if (sessionToken) await api.setToken(sessionToken);

          set({
            isLoading: false,
            error:     null,
            token:     sessionToken,
            user: {
              id:                 data.offlineToken?.userId  ?? "",
              email:              identifier.trim().toLowerCase(),
              role:               data.role                  ?? "",
              schoolId:           data.offlineToken?.schoolId ?? "",
              mustChangePassword: data.mustChangePassword    ?? false,
            },
          });
          return {};
        } catch {
          set({ isLoading: false, error: "Couldn't reach the server. Check your connection." });
          return {};
        }
      },

      // ── Set password (first-login forced change) ───────────────────────────
      setPassword: async (newPassword) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(
            `${process.env.EXPO_PUBLIC_API_URL ?? ""}/api/auth/change-password`,
            {
              method:  "POST",
              headers: {
                "Content-Type": "application/json",
                // Include the session token so the server knows who is changing
                Authorization: `Bearer ${get().token ?? ""}`,
              },
              body: JSON.stringify({ newPassword }),
            }
          );
          const data = await res.json();
          if (!res.ok) {
            set({ isLoading: false, error: data.error || "Couldn't save password. Try again." });
            return false;
          }
          // Clear the mustChangePassword flag locally
          const user = get().user;
          if (user) set({ user: { ...user, mustChangePassword: false } });
          set({ isLoading: false, error: null });
          return true;
        } catch {
          set({ isLoading: false, error: "Couldn't reach the server. Check your connection." });
          return false;
        }
      },

      // ── Logout ──────────────────────────────────────────────────────────────
      logout: async () => {
        await api.clearToken();
        set({ user: null, token: null, error: null, isLoading: false });
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

// ── Role helpers ──────────────────────────────────────────────────────────────

export const ROLES = {
  PRINCIPAL:   "PRINCIPAL",
  ADMIN_STAFF: "ADMIN_STAFF",
  LIBRARIAN:   "ADMIN_STAFF",
  TEACHER:     "TEACHER",
  STUDENT:     "STUDENT",
} as const;

export type UserRole = keyof typeof ROLES;

export function hasRole(allowedRoles: UserRole[]): boolean {
  const user = useAuth.getState().user;
  if (!user) return false;
  return allowedRoles.includes(user.role as UserRole);
}

export const isPrincipal   = () => useAuth.getState().user?.role === "PRINCIPAL";
export const isLibrarian   = () => useAuth.getState().user?.role === "ADMIN_STAFF";
export const isStudent     = () => useAuth.getState().user?.role === "STUDENT";
export const isTeacher     = () => useAuth.getState().user?.role === "TEACHER";
export const getDisplayName = () =>
  useAuth.getState().user?.email.split("@")[0] ?? "User";
