# Requirements Document

## Introduction

This feature delivers a dedicated sidebar navigation layout for the Library Management module (`/staff/library`). The sidebar mirrors the structure and visual style of the Finance (fees) module sidebar — fixed w-64 panel with dark teal gradient — but uses an accordion layout where navigation items are grouped into collapsible sections with only one section open at a time. When a teacher is assigned a role with the `LIBRARY.canManage` permission, the system drops their default teacher sidebar and replaces it with the library-specific sidebar and layout, matching the exact same behaviour that `FEES.canManage` produces for the finance module.

## Glossary

- **LibrarySidebarNav**: The client-side React component that renders the accordion sidebar for the Library module (`src/components/library/LibrarySidebarNav.tsx`).
- **LibraryLayout**: The Next.js route segment layout at `src/app/staff/library/layout.tsx` that wraps all `/staff/library/*` pages.
- **ConditionalHubSidebar**: Client component (`src/components/ConditionalHubSidebar.tsx`) that suppresses the generic HubSidebar on module-specific routes.
- **ShellContentWrapper**: Client component (`src/components/ShellContentWrapper.tsx`) that applies the correct `md:pl-*` offset for modules with their own sidebar.
- **FinanceTopBar**: Existing top bar component reused for the library module.
- **Accordion Group**: A collapsible section header inside LibrarySidebarNav; only one group may be open at a time.
- **NavItem Tile**: A link rendered inside an open accordion group.
- **LIBRARY.canManage**: The permission flag that grants a teacher or staff member full library management access and redirects them into the library module portal.

---

## Requirements

### Requirement 1 — Accordion Sidebar Structure

**User Story:** As a librarian or library-managing teacher, I want a grouped accordion sidebar so that I can navigate between library sections without visual clutter.

#### Acceptance Criteria

1. THE LibrarySidebarNav SHALL render exactly three accordion groups: "Overview", "Lending", and "Library Setup".
2. THE LibrarySidebarNav SHALL populate the "Overview" group with two items: Dashboard (`/staff/library`) and Analytics (`/staff/library/analytics`).
3. THE LibrarySidebarNav SHALL populate the "Lending" group with three items: Circulate (`/staff/library/circulate`), Reservations (`/staff/library/reservations`), and Scan Mode (`/staff/library/scan`).
4. THE LibrarySidebarNav SHALL populate the "Library Setup" group with three items: Inventory (`/staff/library/inventory`), Student Cards (`/staff/library/cards`), and Policies (`/staff/library/policies`).
5. WHEN a group header is clicked and that group is currently closed, THE LibrarySidebarNav SHALL open that group and close all other groups.
6. WHEN a group header is clicked and that group is currently open, THE LibrarySidebarNav SHALL close that group.
7. WHEN the current pathname matches an item inside a group, THE LibrarySidebarNav SHALL automatically open that group on initial render.

---

### Requirement 2 — Active State and Item Highlighting

**User Story:** As a user navigating the library module, I want the active page to be visually indicated so that I always know my current location.

#### Acceptance Criteria

1. WHEN the current pathname exactly matches `/staff/library`, THE LibrarySidebarNav SHALL render the Dashboard item with the active style (`bg-white/15 text-white`).
2. WHEN the current pathname equals an item's href or starts with that href followed by `/`, THE LibrarySidebarNav SHALL render that item with the active style.
3. WHILE a NavItem Tile is not active, THE LibrarySidebarNav SHALL render it with muted style (`text-white/70`) and apply hover highlight (`hover:text-white hover:bg-white/10`).

---

### Requirement 3 — Visual Design — Dark Teal Gradient

**User Story:** As a school administrator, I want the library sidebar to visually match the fees sidebar so that the product feels consistent.

#### Acceptance Criteria

1. THE LibrarySidebarNav desktop panel SHALL apply the CSS gradient `linear-gradient(160deg, #0e6b5e 0%, #084d43 60%, #063b33 100%)` as the background.
2. THE LibrarySidebarNav SHALL be a fixed panel, `w-64`, anchored `top-0 left-0`, with `z-40` and `h-screen`.
3. THE LibrarySidebarNav SHALL render the school name in the header alongside a "LIB" badge and the label "Library Management".
4. THE LibrarySidebarNav SHALL include a decorative bottom illustration area and a sign-out footer button matching the FinanceSidebarNav layout.

---

### Requirement 4 — Mobile Responsive Behaviour

**User Story:** As a user on a mobile device, I want a collapsible top bar instead of the fixed sidebar so that screen space is preserved.

#### Acceptance Criteria

1. WHILE the viewport width is below the `md` breakpoint, THE LibrarySidebarNav SHALL hide the desktop sidebar and display a collapsible top-bar button instead.
2. WHEN the mobile top-bar button is tapped, THE LibrarySidebarNav SHALL reveal a dropdown listing all groups and their items with group label headings.
3. WHEN a navigation item in the mobile dropdown is selected, THE LibrarySidebarNav SHALL close the dropdown and navigate to the selected route.

---

### Requirement 5 — Library Layout and Permission Guard

**User Story:** As a system, I want the library layout to enforce access control so that only authorised users can reach library management pages.

#### Acceptance Criteria

1. WHEN a user with role TEACHER accesses any `/staff/library/*` route and does not have `LIBRARY.canManage`, THE LibraryLayout SHALL redirect the user to `/teacher`.
2. WHEN a user with role PRINCIPAL accesses any `/staff/library/*` route, THE LibraryLayout SHALL render the layout without a permission redirect.
3. WHEN a user with a non-TEACHER, non-PRINCIPAL role accesses any `/staff/library/*` route and does not have `LIBRARY.canView`, THE LibraryLayout SHALL redirect the user to `/staff`.
4. THE LibraryLayout SHALL render LibrarySidebarNav with the school's name fetched from the database.
5. THE LibraryLayout SHALL render FinanceTopBar with the user's role label and derived initials, positioned at `left-0 md:left-64`.

---

### Requirement 6 — Teacher Role Portal Redirect

**User Story:** As a teacher assigned the Librarian role, I want to land directly in the library module when I log in so that I do not see the default teacher sidebar.

#### Acceptance Criteria

1. WHEN a TEACHER with `LIBRARY.canManage` is resolved by `resolveModulePortal`, THE system SHALL return `/staff/library` as the portal destination.
2. WHEN a TEACHER navigates to `/staff/library`, THE ConditionalHubSidebar SHALL suppress the generic HubSidebar so that only LibrarySidebarNav is visible.
3. THE library-managing teacher's sidebar SHALL contain exactly: Dashboard, Circulate, Inventory, Student Cards, Reservations, Analytics, Policies, and Scan Mode — no other items.

---

### Requirement 7 — Shell Integration (ConditionalHubSidebar and ShellContentWrapper)

**User Story:** As a developer, I want the shell components to be aware of the library module so that the layout offset and sidebar suppression work correctly.

#### Acceptance Criteria

1. THE ConditionalHubSidebar SHALL include `/staff/library` in `MODULE_SIDEBAR_PATHS` so that the generic HubSidebar is hidden for all `/staff/library/*` routes.
2. THE ShellContentWrapper SHALL include `{ prefix: "/staff/library", cls: "md:pl-64" }` in `MODULE_PADDING` so that content is offset correctly alongside the w-64 library sidebar.
