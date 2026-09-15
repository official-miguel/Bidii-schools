"use client";

import { useState } from "react";
import LibrarySidebarNav from "@/components/library/LibrarySidebarNav";
import { Menu } from "lucide-react";

export default function LibraryClientLayout({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <LibrarySidebarNav 
        drawerOpen={drawerOpen} 
        onDrawerClose={() => setDrawerOpen(false)} 
      />
      {/* Mobile menu button - shows on mobile to open library drawer */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="md:hidden fixed bottom-6 right-6 z-20 flex items-center justify-center h-14 w-14 rounded-full bg-teal text-white shadow-xl hover:bg-teal/90 transition-colors"
        aria-label="Open library menu"
      >
        <Menu className="h-6 w-6" />
      </button>
      {/* No padding here - ShellContentWrapper already handles it */}
      {children}
    </>
  );
}
