"use client";

/**
 * FinanceShell
 * Client wrapper that owns the mobile drawer open state and wires
 * the hamburger button into FinanceTopBar.
 */

import { useState } from "react";
import FinanceSidebarNav, { FinanceMobileMenuButton } from "@/components/finance/FinanceSidebarNav";
import FinanceTopBar from "@/components/finance/FinanceTopBar";

interface Props {
  schoolName:   string;
  roleLabel:    string;
  userInitials: string;
  children:     React.ReactNode;
}

export default function FinanceShell({ schoolName, roleLabel, userInitials, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <FinanceSidebarNav schoolName={schoolName} drawerOpen={drawerOpen} onDrawerClose={() => setDrawerOpen(false)} />
      <FinanceTopBar
        roleLabel={roleLabel}
        userInitials={userInitials}
        mobileMenuButton={
          <FinanceMobileMenuButton open={drawerOpen} onToggle={() => setDrawerOpen(v => !v)} />
        }
      />
      <div className="pt-16">{children}</div>
    </>
  );
}
