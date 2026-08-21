# Design Document

## Library Sidebar Layout

### Overview

This design describes the implementation of the accordion sidebar navigation for the Library Management module. The work mirrors the Finance module pattern exactly: a dedicated fixed w-64 sidebar replaces the generic HubSidebar for all `/staff/library/*` routes, and the permission system redirects library-managing teachers directly into the portal.

The implementation is largely complete. The design records the intended architecture so that the task list can target the remaining gaps and verify correctness of the existing code.

---

### Architecture

#### Component Topology

```
DashboardShell
  ConditionalHubSidebar      // hides when pathname starts with /staff/library
  ShellContentWrapper        // applies md:pl-64 for /staff/library

/staff/library/layout.tsx    (LibraryLayout — server component)
  LibrarySidebarNav          // client component: DesktopSidebar + MobileTopBar
  FinanceTopBar              // reused from finance module (left-64 offset)
  {children}                 // wrapped in pt-16

src/lib/permissions.ts
  resolveModulePortal()      // returns "/staff/library" when LIBRARY.canManage
  getTeacherEffectivePermissions()  // Source 6 picks up LIBRARY.canManage
```

#### File Map

| File | Status | Role |
|---|---|---|
| `src/components/library/LibrarySidebarNav.tsx` | Complete | Accordion sidebar UI |
| `src/app/staff/library/layout.tsx` | Complete | Permission guard + layout shell |
| `src/components/ConditionalHubSidebar.tsx` | Complete | Suppresses HubSidebar on /staff/library |
| `src/components/ShellContentWrapper.tsx` | Complete | Applies md:pl-64 offset |
| `src/lib/permissions.ts` | Complete | resolveModulePortal returns /staff/library |

---

### LibrarySidebarNav — Accordion Design

#### Group / Item Structure

```
Overview
  Dashboard       → /staff/library          (exact match)
  Analytics       → /staff/library/analytics

Lending
  Circulate       → /staff/library/circulate
  Reservations    → /staff/library/reservations
  Scan Mode       → /staff/library/scan

Library Setup
  Inventory       → /staff/library/inventory
  Student Cards   → /staff/library/cards
  Policies        → /staff/library/policies
```

#### Accordion Behaviour

- One group open at a time (state: `openGroup: string | undefined`).
- On mount, the group containing the active route is auto-opened via `useEffect`.
- Smooth collapse using CSS `max-height` transition (`200ms ease-in-out`).
- Tile height budget: `52px × itemCount` used for `maxHeight` calculation.

#### Active State

- Exact match for Dashboard (`item.exact = true`).
- Prefix match (`pathname.startsWith(item.href + "/")`) for all other items.
- Active tile: `bg-white/15 text-white`.
- Inactive tile: `text-white/70 hover:text-white hover:bg-white/10`.

#### Color Scheme

Matches FinanceSidebarNav exactly:

```css
background: linear-gradient(160deg, #0e6b5e 0%, #084d43 60%, #063b33 100%)
```

Header bottom border: `rgba(255,255,255,0.1)`.  
Footer top border: `rgba(255,255,255,0.1)`.  
Decorative panel: `rgba(255,255,255,0.06)`.  
Badge: `rgba(255,255,255,0.2)` background, white text.

#### Mobile Behaviour

- Below `md` breakpoint: desktop sidebar hidden, `MobileTopBar` shown.
- Top-bar button shows current item icon + label, chevron toggles.
- Dropdown lists all groups with their items; closes on navigation.

---

### Permission Guard — LibraryLayout

Resolution logic (mirrors FinanceLayout exactly):

```
TEACHER       → needs LIBRARY.canManage  → else redirect /teacher
PRINCIPAL     → always admitted
ADMIN_STAFF   → needs LIBRARY.canView    → else redirect /staff
BURSAR        → redirect /staff (no library permission)
```

School name fetched from `prisma.school.findUnique` for sidebar header.  
User initials derived from email prefix split on `[._-]`.

---

### Teacher Portal Redirect

`resolveModulePortal()` in `src/lib/permissions.ts`:

- TEACHER path: checks `perms.LIBRARY?.canManage` → returns `"/staff/library"`.
- Called by `src/app/teacher/page.tsx` and `src/app/page.tsx` (root dispatcher).
- When redirected, teacher sees ONLY the LibrarySidebarNav items (8 items across 3 groups). The HubSidebar is suppressed by ConditionalHubSidebar.

---

### Shell Integration

**ConditionalHubSidebar**:  
`MODULE_SIDEBAR_PATHS = ["/staff/finance", "/staff/library"]`  
Hidden when `pathname.startsWith("/staff/library")`.

**ShellContentWrapper**:  
`{ prefix: "/staff/library", cls: "md:pl-64" }`  
Content offset matches the sidebar width.

---

### Correctness Properties

**Property 1: Accordion mutual exclusivity**  
For any user interaction sequence, at most one group is open at any time. Formally: `openGroup` is `string | undefined`; toggling an already-open group sets it to `undefined`.

**Property 2: Active-group auto-open consistency**  
On any route change to a `/staff/library/*` path, the group containing that route's item is always the open group after render. There is no reachable state where a user is on a route but its group is closed.

**Property 3: Permission guard completeness**  
For every combination of `user.role` ∈ {TEACHER, PRINCIPAL, ADMIN_STAFF, BURSAR, STUDENT, PARENT}, the layout either renders or redirects — there is no unhandled role that falls through to an unguarded render.

**Property 4: Shell offset consistency**  
For all `pathname` values starting with `/staff/library`, ShellContentWrapper returns `md:pl-64` and ConditionalHubSidebar returns null. There is no pathname in this prefix space that produces a different combination.
