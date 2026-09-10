"use client";
/**
 * Optional UX: lets a staff member manually refresh their permission cache
 * if they've just been granted a new role and want to see it immediately
 * without waiting for the 10-minute TTL.
 */
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { usePermissions } from "@/components/PermissionProvider";

export default function RefreshPermissionsButton() {
  const { refresh, loading } = usePermissions();
  const [done, setDone] = useState(false);

  async function handleRefresh() {
    await refresh();
    setDone(true);
    setTimeout(() => setDone(false), 3000);
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={loading}
      aria-label="Refresh permissions"
      title="Refresh your permissions (takes effect immediately)"
      className="flex items-center gap-1.5 text-xs text-slate hover:text-teal
                 transition-colors disabled:opacity-50 min-h-[36px] px-2 rounded-lg
                 hover:bg-teal-50 dark:hover:text-teal
                "
    >
      <RefreshCw
        className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {done ? "Refreshed" : "Refresh permissions"}
    </button>
  );
}
