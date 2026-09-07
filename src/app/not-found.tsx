import Link from "next/link";

/**
 * not-found.tsx  (app-level)
 *
 * Rendered by Next.js whenever notFound() is called or a route cannot be
 * matched. No "use client" required — this is a server component.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      {/* Large 404 */}
      <p className="mb-2 text-8xl font-extrabold leading-none text-teal opacity-20 select-none">
        404
      </p>

      <h1 className="mb-2 text-2xl font-bold text-ink dark:text-dark-text">
        Page not found
      </h1>

      <p className="mb-8 max-w-sm text-sm leading-relaxed text-text-secondary">
        The page you&apos;re looking for doesn&apos;t exist or may have been
        moved. Check the URL, or head back home.
      </p>

      <Link
        href="/"
        className="rounded-lg bg-teal px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
      >
        Go home
      </Link>
    </div>
  );
}
