"use client";

/**
 * src/components/PermissionProvider.tsx
 *
 * Wraps role-based layouts to:
 *   1. Seed the permission cache from the offline token (zero-latency first render)
 *   2. Install the global 403 interceptor for automatic cache invalidation
 *   3. Expose the refresh function + stale indicator through context
 *   4. Show a subtle "permissions refreshed" toast when stale cache is cleared
 *
 * Usage — add inside DashboardShell (or any layout that needs live permissions):
 *   <PermissionProvider schoolId={user.schoolId!} userId={user.id}>
 *     {children}
 *   </PermissionProvider>
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  usePermissionCache,
  installPermission403Interceptor,
  type CachedPermissions,
} from "@/hooks/usePermissionCache";

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

interface PermissionContextValue {
  permissions: CachedPermissions | null;
  loading:     boolean;
  stale:       boolean;
  refresh:     () => Promise<void>;
  /** True if the current user holds this derived kind */
  hasDerived:  (kind: string) => boolean;
  /** True if the current user has this assigned role name (case-insensitive) */
  hasRole:     (roleName: string) => boolean;
}

const PermissionContext = createContext<PermissionContextValue>({
  permissions: null,
  loading:     true,
  stale:       false,
  refresh:     async () => {},
  hasDerived:  () => false,
  hasRole:     () => false,
});

export function usePermissions() {
  return useContext(PermissionContext);
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  children:  ReactNode;
  schoolId:  string;
  userId:    string;
}

export default function PermissionProvider({ children, schoolId, userId }: Props) {
  const { permissions, loading, stale, refresh } = usePermissionCache(schoolId, userId);
  const interceptorRef = useRef(false);

  // Install the 403 interceptor once per mount
  useEffect(() => {
    if (interceptorRef.current) return;
    interceptorRef.current = true;
    installPermission403Interceptor(schoolId, userId);
  }, [schoolId, userId]);

  function hasDerived(kind: string): boolean {
    if (!permissions) return false;
    return permissions.derivedKinds.includes(kind);
  }

  function hasRole(roleName: string): boolean {
    if (!permissions) return false;
    const lower = roleName.toLowerCase();
    return permissions.assignedRoles.some((r) => r.toLowerCase().includes(lower));
  }

  return (
    <PermissionContext.Provider value={{ permissions, loading, stale, refresh, hasDerived, hasRole }}>
      {/* Stale-cache indicator — appears at top of viewport, auto-dismisses */}
      {stale && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 right-4 z-50 flex items-center gap-2 rounded-lg
                     bg-warn-bg border border-warn/30 px-3 py-2 shadow-md text-xs
                     text-warn font-medium animate-fade-in"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-warn animate-pulse shrink-0" />
          Permissions refreshing…
        </div>
      )}
      {children}
    </PermissionContext.Provider>
  );
}
