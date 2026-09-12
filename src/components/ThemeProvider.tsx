"use client";

/**
 * src/components/ThemeProvider.tsx
 *
 * Manages the dark / light theme:
 *  - Always defaults to light mode, regardless of OS/device preference.
 *  - Only switches to dark mode when user explicitly chooses it.
 *  - Persists user's choice in localStorage.
 *  - Applies / removes the "dark" class on <html> without a flash.
 *  - Exposes useTheme() hook so any component can read the theme.
 *
 * Design decision: System always opens in light mode unless the user has
 * previously switched to dark mode. Device dark mode settings are ignored.
 *
 * Flash prevention:
 *   A tiny inline <script> (injected by ThemeScript below) runs before React
 *   hydration and applies the correct class immediately — same technique used
 *   by next-themes, shadcn/ui, etc. This component must be rendered inside
 *   <head> or very early in <body>.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ThemeContext = createContext<ThemeContextValue>({
  theme:    "light",
  toggle:   () => {},
  setTheme: () => {},
});

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const STORAGE_KEY = "bidii_theme";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Hydration-safe: initialise with a static value; localStorage is read only
  // in useEffect which runs client-side only, preventing SSR/CSR mismatch.
  const [theme, setThemeState] = useState<Theme>("light");

  // On mount: read saved preference first, fall back to light mode (never OS).
  useEffect(() => {
    let saved: Theme | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    } catch {}
    // Always default to light mode unless user explicitly chose dark mode
    const resolved: Theme = saved ?? "light";
    applyTheme(resolved);
    setThemeState(resolved);
  }, []);

  // Removed OS preference listener — we ignore device dark mode settings
  // and only respect explicit user choice via the theme toggle

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// ---------------------------------------------------------------------------
// Apply helper — adds/removes "dark" on <html>, briefly suppresses
// transitions so the switch is instant rather than animating.
// ---------------------------------------------------------------------------

function applyTheme(theme: Theme) {
  const html = document.documentElement;

  // Suppress transitions during the class swap to avoid a colour flash.
  html.classList.add("no-transitions");

  if (theme === "dark") {
    html.classList.add("dark");
  } else {
    html.classList.remove("dark");
  }

  // Re-enable transitions on the next animation frame.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      html.classList.remove("no-transitions");
    });
  });
}

// ---------------------------------------------------------------------------
// ThemeScript — inline script injected into <head> to prevent flash.
// Render this as a Server Component inside <head> in layout.tsx.
// ---------------------------------------------------------------------------

/**
 * Inline script that runs before React hydration to apply the saved theme
 * class immediately. Prevents the white → dark flash on page load.
 *
 * Usage in layout.tsx:
 *   <head>
 *     <ThemeScript />
 *   </head>
 */
export function ThemeScript() {
  const script = `
(function () {
  try {
    var saved = localStorage.getItem('bidii_theme');
    // Always default to light mode, ignore OS preference
    var isDark = saved === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
    document.documentElement.classList.add('no-transitions');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.documentElement.classList.remove('no-transitions');
      });
    });
  } catch (e) {}
})();
`.trim();

  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
