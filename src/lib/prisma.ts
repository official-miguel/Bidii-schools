import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Connection pool configuration — Supabase Postgres (transaction pooler)
//
// Supabase exposes two pooler endpoints:
//   • Transaction pooler (port 6543) — PgBouncer in transaction mode.
//     Many clients share a small set of real Postgres connections.
//     Each request borrows a connection only for the duration of a transaction.
//     Requires: pgbouncer=true  (disables Prisma's own pooling layer)
//               statement_cache_size=0  (disables prepared statements,
//               which are not supported in PgBouncer transaction mode)
//               connection_limit=1  (one slot per serverless invocation —
//               the shared pool is managed by PgBouncer, not Prisma)
//
//   • Session pooler (port 5432) — one Postgres connection per client session.
//     DO NOT use for runtime queries in a serverless/Next.js environment —
//     each server component render holds a connection for its lifetime,
//     quickly exhausting Supabase's 15-connection pool_size limit.
//     Use the DIRECT_URL (also port 5432 but bypasses PgBouncer entirely)
//     only for `prisma migrate` / `prisma db push` via the Prisma CLI.
//
// DATABASE_URL  → transaction pooler (port 6543) — runtime queries
// DIRECT_URL    → direct connection  (port 5432)  — migrations only
// ---------------------------------------------------------------------------

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function buildDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? "";
  if (!base) return base;
  try {
    const url = new URL(base);

    // Transaction pooler (PgBouncer) mode — required params.
    // Only set these if they are not already present in the URL so that
    // the value in .env is always the source of truth.
    if (!url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    if (!url.searchParams.has("statement_cache_size")) {
      url.searchParams.set("statement_cache_size", "0");
    }
    // In transaction mode PgBouncer manages the real Postgres connections.
    // Each Next.js process gets a small internal pool — 8 is enough for
    // concurrent server-component renders without overwhelming the pooler.
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "8");
    }
    // Give the pooler a reasonable window to hand back a connection.
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "15");
    }
    // How long Prisma waits for a slot in its own internal pool before throwing.
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "20");
    }

    return url.toString();
  } catch {
    // Malformed URL — leave untouched; Prisma will surface the error.
    return base;
  }
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: {
      db: { url: buildDatabaseUrl() },
    },
  });

// Prevent connection exhaustion from Next.js dev-mode hot reload, which
// re-evaluates modules on every file save and would otherwise create a new
// PrismaClient instance (and new connection pool) each time.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
