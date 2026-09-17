/**
 * src/lib/supabase/managementApi.ts
 *
 * Reads the *real* disk usage of the Supabase project this deployment runs on,
 * via the Supabase Management API. This is deliberately separate from the
 * StorageUsage table, which only tracks what the app itself records per school
 * (documents / media / database / backups) and says nothing about how much
 * room is actually left on the Supabase project.
 *
 * Requires two env vars that are NOT set today:
 *   SUPABASE_ACCESS_TOKEN  — a personal access token from
 *                            https://supabase.com/dashboard/account/tokens
 *   SUPABASE_PROJECT_REF   — the project ref (the subdomain in the project URL)
 *
 * Until both are present every caller gets { configured: false } and the UI
 * says so plainly, rather than showing an invented number.
 */

const MANAGEMENT_API = "https://api.supabase.com";

export type SupabaseDiskUsage =
  | { configured: false; reason: string }
  | { configured: true; usedBytes: number; totalBytes: number; fetchedAt: string };

/**
 * Derives the project ref from SUPABASE_PROJECT_REF, falling back to the
 * subdomain of NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co) which is
 * already configured everywhere.
 */
export function getSupabaseProjectRef(): string | null {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;
  try {
    const host = new URL(url).hostname;           // <ref>.supabase.co
    const ref  = host.split(".")[0];
    return ref && ref !== "localhost" ? ref : null;
  } catch {
    return null;
  }
}

/**
 * GET /v1/projects/{ref}/config/disk/util — current disk usage and the size of
 * the project's provisioned disk. Never throws: storage is a dashboard tile,
 * not something worth 500-ing the whole page over.
 */
export async function fetchSupabaseDiskUsage(): Promise<SupabaseDiskUsage> {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const ref   = getSupabaseProjectRef();

  if (!token) {
    return {
      configured: false,
      reason: "SUPABASE_ACCESS_TOKEN is not set — add a Supabase personal access token to read live project disk usage.",
    };
  }
  if (!ref) {
    return {
      configured: false,
      reason: "SUPABASE_PROJECT_REF is not set and could not be derived from NEXT_PUBLIC_SUPABASE_URL.",
    };
  }

  try {
    const res = await fetch(`${MANAGEMENT_API}/v1/projects/${ref}/config/disk/util`, {
      headers: { Authorization: `Bearer ${token}` },
      // Disk usage moves slowly — a minute of caching keeps this off the
      // Management API's rate limit when several tabs are open.
      next:    { revalidate: 60 },
    });

    if (!res.ok) {
      return {
        configured: false,
        reason: `Supabase Management API returned ${res.status} — check that the access token is valid and has access to project "${ref}".`,
      };
    }

    const body = await res.json() as {
      used_bytes?: number; total_bytes?: number;
      usedBytes?:  number; totalBytes?:  number;
    };

    const usedBytes  = body.used_bytes  ?? body.usedBytes;
    const totalBytes = body.total_bytes ?? body.totalBytes;

    if (typeof usedBytes !== "number" || typeof totalBytes !== "number") {
      return {
        configured: false,
        reason: "Supabase Management API responded in an unexpected shape — disk usage could not be read.",
      };
    }

    return { configured: true, usedBytes, totalBytes, fetchedAt: new Date().toISOString() };
  } catch (e) {
    return {
      configured: false,
      reason: `Could not reach the Supabase Management API: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
