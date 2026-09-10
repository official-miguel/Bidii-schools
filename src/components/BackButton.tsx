"use client";

/**
 * BackButton — fixed back arrow that stays visible while scrolling.
 *
 * Behaviour:
 *   • At the top of the page (scrollY === 0): rendered as a minimal ghost
 *     icon — no background, no border — so it sits above content without
 *     obscuring any text or cards.
 *   • Once the user scrolls down: gains a frosted-glass pill background so
 *     it remains legible over whatever content is beneath it.
 *
 * Position: top-16 (below TopAppBar) · left-4 on mobile · left-20 on desktop
 * (clears the 64px sidebar rail).
 */

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Dashboard/home routes where the back button should never appear
const DASHBOARD_ROUTES = ["/principal", "/staff", "/teacher", "/parent"];

export default function BackButton() {
  const router   = useRouter();
  const pathname = usePathname();

  const [canGoBack,  setCanGoBack]  = useState(false);
  const [scrolled,   setScrolled]   = useState(false);

  // Re-check history on every navigation
  useEffect(() => {
    setCanGoBack(window.history.length > 1);
    // Reset scroll state when the route changes (new page starts at top)
    setScrolled(false);
  }, [pathname]);

  // Track scroll position
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 10);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Hide on dashboard/home routes
  const isDashboard = DASHBOARD_ROUTES.some((route) => pathname === route);
  if (!canGoBack || isDashboard) return null;

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Go back"
      title="Go back"
      className={`
        fixed z-20
        top-[4.5rem] left-4 md:left-20
        inline-flex items-center gap-1.5
        px-3 py-1.5 rounded-lg
        text-sm font-medium
        transition-all duration-200
        ${scrolled
          ? /* scrolled — pill with frosted background */
            "bg-card/90/90 border border-border shadow-sm backdrop-blur-sm text-slate hover:text-teal hover:border-teal/40 hover:bg-teal-50 dark:hover:text-teal dark:hover:bg-teal/10"
          : /* at top — ghost: visible but non-intrusive, won't cover text */
            "bg-transparent border border-transparent text-slate/70 hover:text-teal dark:hover:text-teal"
        }
      `}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      {!scrolled && <span>Back</span>}
    </button>
  );
}
