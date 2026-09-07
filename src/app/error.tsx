"use client";

import Link from "next/link";

/**
 * error.tsx  (app-level)
 *
 * Catches errors from any page/layout segment below the root layout.
 * Renders inside the existing layout — no html/body needed.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      {/* Icon */}
      <div className="mb-5 text-5xl" aria-hidden="true">
        🏫
      </div>

      <h1 className="mb-2 text-2xl font-bold text-ink dark:text-dark-text">
        Something went wrong
      </h1>

      <p className="mb-8 max-w-sm text-sm leading-relaxed text-text-secondary">
        An unexpected error occurred. Try refreshing the page, or head back to
        the home screen.
      </p>

      {/* Dev-only: show error message */}
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
          href="/"
          className="rounded-lg border border-teal px-5 py-2.5 text-sm font-semibold text-teal transition-colors hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
