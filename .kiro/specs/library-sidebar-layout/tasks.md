# Implementation Plan: Library Sidebar Layout

## Overview

The core implementation is largely in place (LibrarySidebarNav, LibraryLayout, ConditionalHubSidebar, ShellContentWrapper, resolveModulePortal). The remaining work is to verify and polish the existing code, strip the last ContextNavigation occurrences from the analytics sub-pages, wire a LibraryTopBar (or confirm FinanceTopBar works cleanly for library), and add a smoke test to confirm the teacher permission redirect path end-to-end.

---

## Tasks

- [x] 1. Verify and harden the existing LibrarySidebarNav component
  - [x] 1.1 Audit LibrarySidebarNav accordion mutual exclusivity and active-group auto-open
    - Confirm the `openGroup` state is always `string | undefined` (never holds two values)
    - Confirm `useEffect` watching `pathname` calls `activeGroup(pathname)` and calls `setOpenGroup` correctly on every route change
    - Confirm toggling an already-open group sets `openGroup` to `undefined`
    - Fix any bugs found; no functional changes needed if logic is correct
    - _Requirements: 1.5, 1.6, 1.7_

  - [x] 1.2 Verify ItemTile active-state logic covers the exact-match Dashboard case
    - The Dashboard item uses `exact: true`; confirm `isItemActive` returns true only when `pathname === "/staff/library"` and false for `/staff/library/anything`
    - Confirm all other items use prefix-match (`pathname.startsWith(item.href + "/")`)
    - _Requirements: 2.1, 2.2_

  - [x] 1.3 Verify dark teal gradient values exactly match FinanceSidebarNav
    - Compare `linear-gradient(160deg, #0e6b5e 0%, #084d43 60%, #063b33 100%)` in both files
    - Confirm header badge reads "LIB" and sub-label reads "Library Management"
    - Confirm mobile top-bar uses `linear-gradient(135deg, #0e6b5e 0%, #084d43 100%)`
    - Fix any colour or badge text mismatches found
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 2. Remove ContextNavigation strips from analytics sub-pages
  - [x] 2.1 Remove `<ContextNavigation items={analyticsNavItems} />` from the analytics overview page
    - File: `src/app/staff/library/analytics/page.tsx`
    - Delete the `import ContextNavigation` line and the `<ContextNavigation ... />` JSX element
    - Keep the `analyticsNavItems` import only if the file uses it elsewhere; remove it otherwise
    - _Requirements: 1.1, 1.2, 1.3, 1.4_ (accordion sidebar is the sole nav for all /staff/library routes)

  - [x] 2.2 Remove ContextNavigation from the six analytics sub-pages
    - Files: `borrowing/page.tsx`, `books/page.tsx`, `fines/page.tsx`, `inventory/page.tsx`, `students/page.tsx`, `reports/page.tsx`
    - For each file: delete the `import ContextNavigation` line and the `<ContextNavigation ... />` JSX element
    - _Requirements: 1.1 – 1.4_

- [x] 3. Verify LibraryLayout permission guard completeness
  - [x] 3.1 Audit LibraryLayout for all user role cases
    - Confirm TEACHER without `LIBRARY.canManage` → redirect `/teacher`
    - Confirm PRINCIPAL → no redirect, layout renders
    - Confirm ADMIN_STAFF without `LIBRARY.canView` → redirect `/staff`
    - Confirm BURSAR → redirects to `/staff` (no LIBRARY permission in the BURSAR block)
    - Fix any unhandled role that could fall through without a redirect or explicit admission
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 3.2 Verify school name fetch and top bar props in LibraryLayout
    - Confirm `prisma.school.findUnique` is called with `user.schoolId` and passed as `schoolName` to `LibrarySidebarNav`
    - Confirm `FinanceTopBar` receives `roleLabel` and `userInitials` derived from `user.email` using the same logic as `FinanceLayout`
    - _Requirements: 5.4, 5.5_

- [x] 4. Verify teacher portal redirect wiring
  - [x] 4.1 Confirm resolveModulePortal returns "/staff/library" for LIBRARY.canManage
    - Read `src/lib/permissions.ts` → `resolveModulePortal` function
    - Confirm the TEACHER branch checks `perms.LIBRARY?.canManage` and returns `"/staff/library"`
    - Confirm the ADMIN_STAFF branch also checks `perms.LIBRARY?.canManage` after the broad-role guard
    - _Requirements: 6.1_

  - [x] 4.2 Confirm teacher/page.tsx and root page.tsx both call resolveModulePortal
    - Read `src/app/teacher/page.tsx` — confirm `resolveModulePortal` is called and its result is redirected
    - Read `src/app/page.tsx` — confirm the root dispatcher also calls `resolveModulePortal` for TEACHER and ADMIN_STAFF
    - If root page.tsx is missing the library portal check, add it following the same pattern as the finance check
    - _Requirements: 6.1_

- [x] 5. Verify shell integration
  - [x] 5.1 Confirm ConditionalHubSidebar suppresses HubSidebar for /staff/library
    - Read `src/components/ConditionalHubSidebar.tsx`
    - Confirm `MODULE_SIDEBAR_PATHS` contains `"/staff/library"`
    - Confirm the `hidden` check uses `pathname.startsWith(p)` so all sub-routes are covered
    - _Requirements: 7.1, 6.2_

  - [x] 5.2 Confirm ShellContentWrapper applies md:pl-64 for /staff/library
    - Read `src/components/ShellContentWrapper.tsx`
    - Confirm `MODULE_PADDING` contains `{ prefix: "/staff/library", cls: "md:pl-64" }`
    - _Requirements: 7.2_

- [x] 6. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 7. Smoke-test the full navigation flow
  - [x] 7.1 Write a unit test for the accordion toggle and auto-open logic
    - Test: toggling a closed group opens it and closes all others
    - Test: toggling an open group closes it (`openGroup` becomes `undefined`)
    - Test: `activeGroup("/staff/library/circulate")` returns `"lending"`
    - Test: `activeGroup("/staff/library")` returns `"overview"`
    - Test: `isItemActive({ href: "/staff/library", exact: true }, "/staff/library/analytics")` returns `false`
    - _Requirements: 1.5, 1.6, 1.7, 2.1_

  - [ ]* 7.2 Write a unit test for resolveModulePortal teacher branch
    - Mock `getTeacherEffectivePermissions` to return `{ LIBRARY: { canManage: true, ... } }`
    - Assert `resolveModulePortal(teacherUser)` resolves to `"/staff/library"`
    - Mock to return `{ FEES: { canManage: true } }` — assert resolves to `"/staff/finance"`
    - Mock to return `{}` — assert resolves to `null`
    - _Requirements: 6.1_

  - [ ]* 7.3 Write a unit test for the permission guard role matrix
    - Simulate TEACHER without LIBRARY.canManage → expect redirect to `/teacher`
    - Simulate PRINCIPAL → expect no redirect
    - Simulate ADMIN_STAFF with LIBRARY.canView → expect no redirect
    - Simulate ADMIN_STAFF without any LIBRARY permission → expect redirect to `/staff`
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 8. Final checkpoint — Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for an MVP pass.
- The `analyticsNavItems` in `_shared.tsx` include a "← Library" back-link; after removing ContextNavigation, this array may become unused — remove it from the import but keep the `_shared.tsx` file intact for its other exports.
- FinanceTopBar is shared between finance and library layouts. No library-specific top bar is needed unless the user later wants a student search scoped to library.
- The BURSAR role has no LIBRARY permission in `getEffectivePermissions`, so it will fall through to the `role !== "PRINCIPAL"` branch and get redirected to `/staff` — this is correct and intentional.
- All eight sidebar items required for the library-managing teacher (Dashboard, Circulate, Inventory, Student Cards, Reservations, Analytics, Policies, Scan Mode) are already defined in LibrarySidebarNav's `GROUPS` constant; no additions needed.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "3.1", "3.2", "4.1", "5.1", "5.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "4.2"] },
    { "id": 2, "tasks": ["7.1", "7.2", "7.3"] }
  ]
}
```
