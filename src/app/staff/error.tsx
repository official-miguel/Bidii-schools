"use client";

import Link from "next/link";

/**
 * error.tsx — Staff portal error boundary
 *
 * Catches any unhandled error within the /staff route segment.
 * Shows a friendly recovery UI without exposing internal details.
 */
export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-5 text-5xl" aria-hidden="true">
        ⚠️
      </div>

      <h1 className="mb-2 text-2xl font-bold text-ink dark:text-dark-text">
        Something went wrong — Staff portal
      </h1>

      <p className="mb-8 max-w-sm text-sm leading-relaxed text-slate">
        An unexpected error occurred in the staff portal. You can try again or
        head back to your dashboard.
      </p>

      {process.env.NODE_ENV === "development" && error.message && (
        <pre className="mb-6 max-w-md overflow-auto rounded-lg border border-line bg-paper px-4 py-3 text-left font-mono text-xs text-danger">
          {error.message}
        </pre>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-teal px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        >
          Try again
        </button>

        <Link
          href="/staff"
          className="rounded-lg border border-teal px-5 py-2.5 text-sm font-semibold text-teal transition-colors hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
