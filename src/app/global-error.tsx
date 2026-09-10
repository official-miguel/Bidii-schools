"use client";

/**
 * global-error.tsx
 *
 * Catches errors that bubble up from the root layout itself.
 * Must render a full <html><body> tree because the root layout is unavailable
 * at this point. Keep styles minimal and self-contained (no external CSS).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Something went wrong — Bidii</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: "Inter, system-ui, sans-serif",
          backgroundColor: "var(--color-background, #FAFBFC)", // semantic token with fallback
          color: "var(--color-foreground, #1F2933)", // semantic token with fallback
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            maxWidth: "420px",
          }}
        >
          {/* Brand icon */}
          <div
            style={{
              fontSize: "3rem",
              marginBottom: "1.25rem",
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            ⚠️
          </div>

          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              margin: "0 0 0.5rem",
              color: "var(--color-foreground, #1F2933)", // semantic token with fallback
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              fontSize: "0.9375rem",
              color: "var(--color-muted-foreground, #667085)", // semantic token with fallback
              margin: "0 0 2rem",
              lineHeight: 1.6,
            }}
          >
            An unexpected error occurred. Please try again, or return to the
            home page if the problem persists.
          </p>

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={reset}
              style={{
                padding: "0.5625rem 1.25rem",
                backgroundColor: "var(--color-primary, #2C7F7E)", // brand: logo teal — intentional
                color: "var(--color-primary-foreground, #ffffff)", // semantic token with fallback
                border: "none",
                borderRadius: "8px",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>

            <a
              href="/"
              style={{
                padding: "0.5625rem 1.25rem",
                backgroundColor: "transparent",
                color: "var(--color-primary, #2C7F7E)", // brand: logo teal — intentional
                border: "1.5px solid var(--color-primary, #2C7F7E)", // brand: logo teal — intentional
                borderRadius: "8px",
                fontSize: "0.875rem",
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Go home
            </a>
          </div>

          {/* Digest for support tracing — only shown in dev */}
          {process.env.NODE_ENV === "development" && error.digest && (
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "0.75rem",
                color: "var(--color-muted-foreground, #98A2B3)", // semantic token with fallback
                fontFamily: "monospace",
              }}
            >
              digest: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
