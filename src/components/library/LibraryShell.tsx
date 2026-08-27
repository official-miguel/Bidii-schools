"use client";

/**
 * LibraryShell
 * Client wrapper that owns the mobile drawer open state and wires
 * the hamburger button into FinanceTopBar (shared top bar).
 */

import { useState } from "react";
import LibrarySidebarNav, { LibraryMobileMenuButton } from "@/components/library/LibrarySidebarNav";
import FinanceTopBar from "@/components/finance/FinanceTopBar";

interface Props {
  schoolName:   string;
  roleLabel:    string;
  userInitials: string;
  children:     React.ReactNode;
}

export default function LibraryShell({ schoolName, roleLabel, userInitials, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <LibrarySidebarNav schoolName={schoolName} drawerOpen={drawerOpen} onDrawerClose={() => setDrawerOpen(false)} />
      <FinanceTopBar
        roleLabel={roleLabel}
        userInitials={userInitials}
        mobileMenuButton={
          <LibraryMobileMenuButton open={drawerOpen} onToggle={() => setDrawerOpen(v => !v)} />
        }
      />
      <div className="pt-16">{children}</div>
    </>
  );
}
