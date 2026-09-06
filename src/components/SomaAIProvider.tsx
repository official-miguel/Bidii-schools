"use client";

/**
 * src/components/SomaAIProvider.tsx
 *
 * Wraps each role layout. Responsibilities:
 *
 *   1. Renders SomaAIButton (FAB) — always visible
 *   2. Renders the SomaAIChatPanel in a portal (avoids stacking-context issues)
 *   3. Provides responsive panel layout:
 *        lg+  → right side panel (slides in from right, 420px wide)
 *        md   → bottom sheet (slides up, ~72vh)
 *        <md  → full-screen overlay
 *   4. Registers keyboard shortcut Ctrl+/ (or ⌘+/) to toggle
 *   5. Syncs session context (role, school, page path) from props
 *   6. Adds backdrop on mobile/sheet views
 *   7. Manages body scroll lock when panel is open on mobile
 *
 * The panel itself is rendered via React Portal into document.body so it sits
 * above all page content regardless of z-index stacking contexts in layouts.
 */

import {
  useEffect,
  useState,
  useCallback,
  createContext,
  useContext,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useSomaAIStore } from "@/lib/soma-ai/store";
import SomaAIChatPanel from "@/components/SomaAIChatPanel";
import SomaAIButton from "@/components/SomaAIButton";

// ---------------------------------------------------------------------------
// Context — lets TopAppBar button toggle the same state
// ---------------------------------------------------------------------------

interface SomaAIContextValue {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

const SomaAIContext = createContext<SomaAIContextValue>({
  isOpen: false,
  toggle: () => {},
  open: () => {},
  close: () => {},
});

export function useSomaAI() {
  return useContext(SomaAIContext);
}

// ---------------------------------------------------------------------------
// Panel shell — handles responsive layout + animation
// ---------------------------------------------------------------------------

type PanelVariant = "side" | "sheet" | "fullscreen";

function usePanelVariant(): PanelVariant {
  const [variant, setVariant] = useState<PanelVariant>("side");

  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      if (w >= 1024) setVariant("side");
      else if (w >= 640) setVariant("sheet");
      else setVariant("fullscreen");
    }
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  return variant;
}

function PanelShell({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const variant = usePanelVariant();

  // Body scroll lock on mobile
  useEffect(() => {
    if (!isOpen) return;
    if (variant !== "side") {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen, variant]);

  if (!isOpen) return null;

  // ── Side panel (lg+) ──────────────────────────────────────────────────────
  if (variant === "side") {
    return (
      <div
        className="fixed top-0 right-0 bottom-0 z-50
                   w-[420px] max-w-[calc(100vw-5rem)]
                   shadow-xl border-l border-line dark:border-dark-border
                   animate-soma-slide-in-right
                   flex flex-col overflow-hidden"
        role="none"
      >
        {children}
      </div>
    );
  }

  // ── Bottom sheet (sm–lg) ──────────────────────────────────────────────────
  if (variant === "sheet") {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-ink/30 dark:bg-black/50 animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
        {/* Sheet */}
        <div
          className="fixed bottom-[calc(60px+env(safe-area-inset-bottom,0px))] md:bottom-0
                     left-0 right-0 z-50
                     h-[72vh] rounded-t-2xl overflow-hidden
                     shadow-xl border-t border-line dark:border-dark-border
                     animate-soma-slide-in-up
                     flex flex-col"
          role="none"
        >
          {/* Drag handle */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2
                          w-10 h-1 rounded-full bg-line dark:bg-dark-border"
            aria-hidden="true"
          />
          {children}
        </div>
      </>
    );
  }

  // ── Full screen (xs/mobile) ───────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 animate-fade-in flex flex-col overflow-hidden"
      role="none"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface SomaAIProviderProps {
  children: React.ReactNode;
  role: string;
  schoolName?: string;
}

export default function SomaAIProvider({
  children,
  role,
  schoolName,
}: SomaAIProviderProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  const { isOpen, open, close } = useSomaAIStore();

  // Hydration guard for portals
  useEffect(() => setMounted(true), []);

  // Sync session context whenever props or path changes.
  // Access setSessionContext via getState() — it's a Zustand action and
  // would produce a new function reference on every state update if subscribed
  // reactively, causing this effect to loop forever.
  useEffect(() => {
    useSomaAIStore.getState().setSessionContext({
      role,
      schoolName,
      pagePath: pathname,
      pageTitle: getPageTitle(pathname),
    });
  }, [role, schoolName, pathname]);

  // Keyboard shortcut: Ctrl+/ or ⌘+/
  // Same reasoning — access toggleOpen via getState() to keep the effect stable.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        useSomaAIStore.getState().toggleOpen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = useCallback(() => useSomaAIStore.getState().toggleOpen(), []);

  const ctx: SomaAIContextValue = { isOpen, toggle, open, close };

  return (
    <SomaAIContext.Provider value={ctx}>
      {children}

      {/* FAB — always rendered (SSR-safe) */}
      <SomaAIButton isOpen={isOpen} onClick={toggle} />

      {/* Panel — portal into body */}
      {mounted &&
        createPortal(
          <PanelShell isOpen={isOpen} onClose={close}>
            <SomaAIChatPanel onClose={close} />
          </PanelShell>,
          document.body
        )}
    </SomaAIContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Page title helper — extracts a human-readable label from the URL path
// ---------------------------------------------------------------------------

function getPageTitle(path: string): string {
  const parts = path.replace(/^\//, "").split("/");
  // e.g. /principal/students/123  →  "Students"
  // e.g. /teacher/attendance      →  "Attendance"
  const segment = parts[1] ?? parts[0] ?? "";
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Dashboard";
}
