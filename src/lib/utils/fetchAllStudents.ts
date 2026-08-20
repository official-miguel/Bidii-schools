/**
 * src/lib/utils/fetchAllStudents.ts
 *
 * Fetches ALL students from GET /api/students by following the
 * cursor-based pagination the API provides via the X-Next-Cursor
 * response header.
 *
 * The API defaults to returning 200 rows per page (max 500).
 * Without this helper every call site was silently truncated at 200.
 */

export async function fetchAllStudents(): Promise<unknown[]> {
  const all: unknown[] = [];
  let cursor: string | null = null;

  do {
    const url = cursor
      ? `/api/students?limit=500&cursor=${encodeURIComponent(cursor)}`
      : `/api/students?limit=500`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) break;

    const page: unknown[] = await res.json();
    all.push(...page);

    cursor = res.headers.get("X-Next-Cursor");
  } while (cursor);

  return all;
}
