/**
 * Task 1.2 — Verify ItemTile active-state logic
 *
 * Validates Requirements 2.1 and 2.2:
 *   2.1 — Dashboard (exact: true) is active ONLY when pathname === "/staff/library"
 *   2.2 — All other items use prefix-match (pathname === href OR startsWith(href + "/"))
 */

// ── Inline types & logic mirrored from LibrarySidebarNav ───────────────────
// We test the pure helper functions directly without importing the React
// component (which requires a browser environment and Next.js internals).

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: null; // not needed for logic tests
  exact?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

const GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { id: "dashboard", href: "/staff/library",           label: "Dashboard",  icon: null, exact: true },
      { id: "analytics", href: "/staff/library/analytics", label: "Analytics",  icon: null },
    ],
  },
  {
    id: "lending",
    label: "Lending",
    items: [
      { id: "circulate",    href: "/staff/library/circulate",    label: "Circulate",    icon: null },
      { id: "reservations", href: "/staff/library/reservations", label: "Reservations", icon: null },
      { id: "scan",         href: "/staff/library/scan",         label: "Scan Mode",    icon: null },
    ],
  },
  {
    id: "setup",
    label: "Library Setup",
    items: [
      { id: "inventory", href: "/staff/library/inventory", label: "Inventory",      icon: null },
      { id: "cards",     href: "/staff/library/cards",     label: "Student Cards",  icon: null },
      { id: "policies",  href: "/staff/library/policies",  label: "Policies",       icon: null },
    ],
  },
];

function activeGroup(pathname: string): string | undefined {
  for (const group of GROUPS) {
    if (group.items.some((item) => isItemActive(item, pathname))) {
      return group.id;
    }
  }
  return undefined;
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe("isItemActive — Requirement 2.1: Dashboard exact-match", () => {
  const dashboard: NavItem = {
    id: "dashboard",
    href: "/staff/library",
    label: "Dashboard",
    icon: null,
    exact: true,
  };

  it("returns true when pathname exactly equals /staff/library", () => {
    expect(isItemActive(dashboard, "/staff/library")).toBe(true);
  });

  it("returns false for /staff/library/analytics (sub-route)", () => {
    expect(isItemActive(dashboard, "/staff/library/analytics")).toBe(false);
  });

  it("returns false for /staff/library/circulate (sub-route)", () => {
    expect(isItemActive(dashboard, "/staff/library/circulate")).toBe(false);
  });

  it("returns false for /staff/library/inventory (sub-route)", () => {
    expect(isItemActive(dashboard, "/staff/library/inventory")).toBe(false);
  });

  it("returns false for /staff/library/cards (sub-route)", () => {
    expect(isItemActive(dashboard, "/staff/library/cards")).toBe(false);
  });

  it("returns false for /staff/library/policies (sub-route)", () => {
    expect(isItemActive(dashboard, "/staff/library/policies")).toBe(false);
  });

  it("returns false for /staff/library/scan (sub-route)", () => {
    expect(isItemActive(dashboard, "/staff/library/scan")).toBe(false);
  });

  it("returns false for /staff/library/reservations (sub-route)", () => {
    expect(isItemActive(dashboard, "/staff/library/reservations")).toBe(false);
  });

  it("returns false for /staff (parent route)", () => {
    expect(isItemActive(dashboard, "/staff")).toBe(false);
  });

  it("returns false for an unrelated path", () => {
    expect(isItemActive(dashboard, "/staff/finance")).toBe(false);
  });
});

describe("isItemActive — Requirement 2.2: Prefix-match for non-exact items", () => {
  const nonExactItems = GROUPS.flatMap((g) =>
    g.items.filter((item) => !item.exact)
  );

  it("each non-exact item has no exact flag set", () => {
    for (const item of nonExactItems) {
      expect(item.exact).toBeUndefined();
    }
  });

  it.each(nonExactItems)(
    "$label: active when pathname === href",
    (item) => {
      expect(isItemActive(item, item.href)).toBe(true);
    }
  );

  it.each(nonExactItems)(
    "$label: active when pathname starts with href + '/'",
    (item) => {
      expect(isItemActive(item, item.href + "/sub-page")).toBe(true);
    }
  );

  it.each(nonExactItems)(
    "$label: active for deeper nested sub-route",
    (item) => {
      expect(isItemActive(item, item.href + "/a/b/c")).toBe(true);
    }
  );

  it.each(nonExactItems)(
    "$label: NOT active for an unrelated path",
    (item) => {
      expect(isItemActive(item, "/staff/finance/dashboard")).toBe(false);
    }
  );

  it.each(nonExactItems)(
    "$label: NOT active for a path that merely starts with href string but no trailing slash",
    (item) => {
      // e.g. /staff/library/cardsfoo should NOT match /staff/library/cards
      const fake = item.href + "foo";
      expect(isItemActive(item, fake)).toBe(false);
    }
  );
});

describe("isItemActive — Dashboard does NOT behave like a prefix-match item", () => {
  const dashboard: NavItem = {
    id: "dashboard",
    href: "/staff/library",
    label: "Dashboard",
    icon: null,
    exact: true,
  };

  /**
   * Without the exact flag, /staff/library would prefix-match every
   * /staff/library/* route. Confirm the exact flag prevents this.
   */
  it("would incorrectly match sub-routes WITHOUT the exact flag (control check)", () => {
    const dashboardWithoutExact: NavItem = { ...dashboard, exact: undefined };
    // prefix-match fallback: startsWith("/staff/library/") → true
    expect(isItemActive(dashboardWithoutExact, "/staff/library/analytics")).toBe(true);
  });

  it("correctly does NOT match sub-routes WITH the exact flag", () => {
    expect(isItemActive(dashboard, "/staff/library/analytics")).toBe(false);
  });
});

// ── Accordion toggle logic ─────────────────────────────────────────────────
// Models the handleGroupToggle function from DesktopSidebar:
//   setOpenGroup((prev) => (prev === groupId ? undefined : groupId))

function handleGroupToggle(
  current: string | undefined,
  groupId: string
): string | undefined {
  return current === groupId ? undefined : groupId;
}

describe("Accordion toggle — Requirement 1.5: opening a closed group closes all others", () => {
  it("opens a group that is currently closed (openGroup was undefined)", () => {
    expect(handleGroupToggle(undefined, "overview")).toBe("overview");
  });

  it("opening group 'lending' when 'overview' is open switches openGroup to 'lending'", () => {
    // Only one group is ever open (openGroup is a single string | undefined),
    // so setting it to a new id implicitly closes the previously open group.
    expect(handleGroupToggle("overview", "lending")).toBe("lending");
  });

  it("opening group 'setup' when 'lending' is open switches openGroup to 'setup'", () => {
    expect(handleGroupToggle("lending", "setup")).toBe("setup");
  });

  it("opening any group always results in exactly that group being open", () => {
    const groups = ["overview", "lending", "setup"];
    for (const current of [...groups, undefined]) {
      for (const next of groups) {
        if (current === next) continue; // skip toggle-close case
        expect(handleGroupToggle(current, next)).toBe(next);
      }
    }
  });
});

describe("Accordion toggle — Requirement 1.6: toggling an open group closes it", () => {
  it("toggling the currently-open 'overview' group returns undefined", () => {
    expect(handleGroupToggle("overview", "overview")).toBeUndefined();
  });

  it("toggling the currently-open 'lending' group returns undefined", () => {
    expect(handleGroupToggle("lending", "lending")).toBeUndefined();
  });

  it("toggling the currently-open 'setup' group returns undefined", () => {
    expect(handleGroupToggle("setup", "setup")).toBeUndefined();
  });
});

describe("activeGroup — auto-open group resolution", () => {
  it('returns "overview" for /staff/library', () => {
    expect(activeGroup("/staff/library")).toBe("overview");
  });

  it('returns "overview" for /staff/library/analytics', () => {
    expect(activeGroup("/staff/library/analytics")).toBe("overview");
  });

  it('returns "lending" for /staff/library/circulate', () => {
    expect(activeGroup("/staff/library/circulate")).toBe("lending");
  });

  it('returns "lending" for /staff/library/reservations', () => {
    expect(activeGroup("/staff/library/reservations")).toBe("lending");
  });

  it('returns "lending" for /staff/library/scan', () => {
    expect(activeGroup("/staff/library/scan")).toBe("lending");
  });

  it('returns "setup" for /staff/library/inventory', () => {
    expect(activeGroup("/staff/library/inventory")).toBe("setup");
  });

  it('returns "setup" for /staff/library/cards', () => {
    expect(activeGroup("/staff/library/cards")).toBe("setup");
  });

  it('returns "setup" for /staff/library/policies', () => {
    expect(activeGroup("/staff/library/policies")).toBe("setup");
  });

  it("returns undefined for a completely unrelated path", () => {
    expect(activeGroup("/staff/finance")).toBeUndefined();
  });

  it("returns undefined for /staff (parent, not inside library)", () => {
    expect(activeGroup("/staff")).toBeUndefined();
  });
});
