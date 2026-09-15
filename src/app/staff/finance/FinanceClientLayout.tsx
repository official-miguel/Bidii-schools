"use client";

import { useState } from "react";
import FinanceSidebarNav from "@/components/finance/FinanceSidebarNav";
import { Menu } from "lucide-react";

export default function FinanceClientLayout({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <FinanceSidebarNav 
        drawerOpen={drawerOpen} 
        onDrawerClose={() => setDrawerOpen(false)} 
      />
      {/* Mobile menu button - shows on mobile to open finance drawer */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="md:hidden fixed bottom-6 right-6 z-20 flex items-center justify-center h-14 w-14 rounded-full bg-teal text-white shadow-xl hover:bg-teal/90 transition-colors"
        aria-label="Open finance menu"
      >
        <Menu className="h-6 w-6" />
      </button>
      {/* No padding here - ShellContentWrapper already handles it */}
      {children}
    </>
  );
}
