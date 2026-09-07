# Requirements Document

## Introduction

This spec covers a structured six-phase audit and cleanup of the Bidii school management
system. Bidii is a dual-surface product: a Next.js 14 web application (App Router, Prisma,
custom session auth via `bidii_session` cookie) and a React Native / Expo mobile library
app. The goal is to identify and fix every broken interactive element, remove verified-dead
code, resolve structural inconsistencies, and produce a manual-testing checklist — all
without altering any currently-working functionality.

The six phases are executed sequentially. No phase begins implementation until the
preceding phase's findings have been reviewed and approved, except where an individual
phase is explicitly self-contained (Phase 3 fixes follow directly from Phase 2 diagnosis).

---

## Glossary

- **Web App**: The Next.js 14 application in `src/`, served at the root domain.
- **Mobile App**: The Expo / React Native application in `mobile/`, used for library
  management.
- **Interactive Element**: Any button, link, form submit, navigation item, icon-button, or
  tap-target that is meant to produce a user-visible effect.
- **Broken Element**: An interactive element that redirects unexpectedly to `/login`,
  renders an error page, performs no action, or calls an API route that does not exist.
- **Auth Guard**: Any of `getCurrentUser`, `requireRole`, `requireSchoolRole`,
  `requireSchoolPermission`, or the Edge `middleware.ts` cookie check.
- **Dead Code**: Any file, component, function, variable, import, or route that is never
  referenced by any live code path and whose removal would not change observable behaviour.
- **Working Feature**: Any interactive element or data flow that currently behaves as a
  user would expect, with no errors or unintended redirects.
- **PRINCIPAL**: The school-owner role; has unconditional full access to every module.
- **ADMIN_STAFF**: A school staff member whose permissions are resolved from assigned
  `StaffRole` rows.
- **TEACHER**: A teaching staff member; permissions derived from subject assignments,
  class teacher status, HOD status, dorm master status, and optional `StaffRole` rows.
- **BURSAR**: A finance-focused staff role; full `FEES` access plus limited `STUDENTS`
  and `COMMUNICATION`.
- **Phase Findings Report**: A Markdown document produced at the end of each discovery
  phase (1, 2, 4, 5) listing every item found, its location, and its root cause or
  rationale.
- **Approval Gate**: A point at which the Phase Findings Report is presented to the user
  before any changes are made.

---

## Requirements

---

### Requirement 1: Interactive Element Inventory (Phase 1)

**User Story:** As a developer, I want a complete inventory of every interactive element
in the Web App and Mobile App, so that I have a single authoritative reference for what
exists and what its current behaviour is.

#### Acceptance Criteria

1. THE Audit_Tool SHALL traverse every `page.tsx` and `layout.tsx` under `src/app/` and
   every screen file under `mobile/app/` to locate interactive elements.

2. WHEN an interactive element is found, THE Audit_Tool SHALL record: the file path, the
   element type (button / link / form / nav-item / icon-button), the intended action as
   described by its label or `aria-label`, and the actual observed behaviour (working /
   redirects-to-login / shows-error-page / does-nothing / calls-missing-api).

3. THE Audit_Tool SHALL group broken elements by root-cause category: `missing-route`,
   `auth-check-misfiring`, `handler-not-wired`, `api-route-missing`,
   `wrong-permission-check`, or `other`.

4. WHEN Phase 1 is complete, THE Audit_Tool SHALL produce a Phase Findings Report at
   `.kiro/specs/bidii-audit-cleanup/phase1-inventory.md` before any changes are made.

5. THE Phase_1_Report SHALL include a summary count: total elements found, total broken,
   broken by category.

6. IF an interactive element's behaviour cannot be determined statically, THEN THE
   Audit_Tool SHALL flag it as `needs-runtime-verification` and include it in the report.

---

### Requirement 2: Auth and Routing Diagnosis (Phase 2)

**User Story:** As a developer, I want a precise diagnosis of every "redirects to login"
and "shows error page" failure, so that I understand the exact root cause before writing
any fix.

#### Acceptance Criteria

1. WHEN a broken element was categorised as `auth-check-misfiring` in Phase 1, THE
   Audit_Tool SHALL check whether the `bidii_session` cookie presence check in
   `middleware.ts` correctly covers the element's route.

2. WHEN a broken element was categorised as `auth-check-misfiring`, THE Audit_Tool SHALL
   verify that the server-side `getCurrentUser` / `requireSchoolRole` call in the
   corresponding `layout.tsx` or `page.tsx` resolves to a non-null user for the expected
   roles.

3. WHEN a broken element was categorised as `missing-route`, THE Audit_Tool SHALL confirm
   whether the target path exists as a directory with a `page.tsx` under `src/app/` or
   `mobile/app/`.

4. WHEN a broken element was categorised as `api-route-missing`, THE Audit_Tool SHALL
   confirm whether a `route.ts` file exists at the referenced API path under
   `src/app/api/`.

5. THE Audit_Tool SHALL check for error boundaries or missing `error.tsx` / `not-found.tsx`
   files that could cause unhandled errors to surface as blank or crash pages.

6. WHEN Phase 2 is complete, THE Audit_Tool SHALL produce a Phase Findings Report at
   `.kiro/specs/bidii-audit-cleanup/phase2-diagnosis.md` that maps every broken element
   from Phase 1 to its confirmed root cause and proposed fix, before any code changes
   are made.

7. THE Phase_2_Report SHALL specify for each fix: the file(s) to change, the exact change
   needed, and the expected outcome after the fix.

---

### Requirement 3: Broken Element Fixes (Phase 3)

**User Story:** As a developer, I want every broken button and navigation flow fixed so
that all interactive elements behave as intended without altering working features.

#### Acceptance Criteria

1. THE Fix_Tool SHALL apply fixes only to items explicitly listed in the Phase 2 report
   and only after the Phase 2 report has been approved.

2. WHEN fixing a `missing-route` issue, THE Fix_Tool SHALL create the missing `page.tsx`
   (and `layout.tsx` if required) with content sufficient to render the intended screen.

3. WHEN fixing an `auth-check-misfiring` issue, THE Fix_Tool SHALL update only the
   specific guard call or middleware matcher entry responsible, without changing guards
   on other routes.

4. WHEN fixing a `handler-not-wired` issue, THE Fix_Tool SHALL add the missing `onClick`,
   `onPress`, `href`, or `action` binding to the element, pointing to the correct
   handler or route.

5. WHEN fixing an `api-route-missing` issue, THE Fix_Tool SHALL create the missing
   `route.ts` at the correct path, implementing only the handler(s) needed to unblock
   the broken element.

6. THE Fix_Tool SHALL make fixes one root-cause group at a time and present each group's
   diff before proceeding to the next group.

7. IF a proposed fix would change behaviour that is currently working correctly, THEN THE
   Fix_Tool SHALL halt and report the conflict to the user before proceeding.

8. WHEN all fixes in a group are applied, THE Fix_Tool SHALL update
   `phase2-diagnosis.md` to mark those items as resolved.

---

### Requirement 4: Dead Code Identification (Phase 4)

**User Story:** As a developer, I want a comprehensive list of every unused file,
component, function, import, and route in the project, so that I can review and approve
removal before anything is deleted.

#### Acceptance Criteria

1. THE Audit_Tool SHALL scan every file under `src/` and `mobile/` and identify:
   unused imported symbols, exported symbols never imported elsewhere, components never
   rendered, API route files unreachable from any client call, and utility functions with
   no callers.

2. THE Audit_Tool SHALL identify commented-out code blocks and console/debug statements
   (`console.log`, `console.warn`, `console.error` used only for debugging) present in
   production code paths.

3. THE Audit_Tool SHALL identify duplicate implementations: two or more functions or
   components that perform the same task and could be consolidated.

4. WHEN Phase 4 discovery is complete, THE Audit_Tool SHALL produce a Phase Findings
   Report at `.kiro/specs/bidii-audit-cleanup/phase4-dead-code.md` listing every item
   with its file path, symbol name, and the reason it is considered unused.

5. THE Phase_4_Report SHALL separate findings into three tiers:
   - **Tier 1 — Safe to delete**: confirmed zero references, no dynamic import risk.
   - **Tier 2 — Likely unused**: no static references found but pattern suggests possible
     dynamic usage (e.g. string-keyed component lookup).
   - **Tier 3 — Review needed**: commented-out blocks and debug statements that may be
     intentionally kept.

6. THE Fix_Tool SHALL NOT delete any item until the Phase 4 report has been reviewed and
   each item explicitly approved for removal.

7. WHEN an item is approved for removal and removed, THE Fix_Tool SHALL verify the project
   still type-checks (`tsc --noEmit`) before removing the next item.

---

### Requirement 5: Foundation Cleanup (Phase 5)

**User Story:** As a developer, I want a list of low-risk structural improvements so that
the codebase is easier to maintain, without any rewrite or functionality change.

#### Acceptance Criteria

1. THE Audit_Tool SHALL identify hardcoded string values that appear in three or more
   places and should be extracted to a shared constant.

2. THE Audit_Tool SHALL identify inconsistent patterns across parallel sections of the
   codebase (e.g. some API routes using `requireSchoolRole` directly while equivalent
   routes use `guard()` wrappers) and document the inconsistency.

3. THE Audit_Tool SHALL identify missing or inconsistent error handling: API routes that
   return untyped 500 responses, layouts that do not handle null users, and components
   that can receive undefined props without a fallback.

4. THE Audit_Tool SHALL identify `.ts` / `.tsx` files at the root of `src/` or `mobile/`
   that contain no exports used by any other file (orphaned scripts).

5. WHEN Phase 5 discovery is complete, THE Audit_Tool SHALL produce a Phase Findings
   Report at `.kiro/specs/bidii-audit-cleanup/phase5-foundation.md` listing each finding
   with: file path, issue type, severity (low / medium), and a suggested fix of five
   lines or fewer.

6. THE Phase_5_Report SHALL recommend at most one change per finding; no suggestion may
   alter the public interface of a function, rename a database model, or change a route
   path.

7. IF a suggested fix would require changing more than two files, THEN THE Audit_Tool
   SHALL mark it as out-of-scope for this phase.

---

### Requirement 6: Verification Checklist (Phase 6)

**User Story:** As a developer, I want a manual-testing checklist that covers every
interactive element fixed in Phase 3, so that I can confirm all fixes work in the browser
and mobile app without regressions.

#### Acceptance Criteria

1. THE Checklist_Tool SHALL generate a checklist file at
   `.kiro/specs/bidii-audit-cleanup/phase6-verification.md` containing one test case per
   fixed interactive element.

2. WHEN generating a test case, THE Checklist_Tool SHALL specify: the user role required,
   the navigation path to reach the element, the action to perform, and the expected
   result.

3. THE Checklist_Tool SHALL include at least one regression test case for each currently-
   working feature in the same module as a fixed element, confirming it still behaves
   correctly after the fix.

4. THE Checklist_Tool SHALL group test cases by role (PRINCIPAL, ADMIN_STAFF, TEACHER,
   BURSAR, parent, library mobile user) so testers can run all cases for their role in
   sequence.

5. IF a fix touched auth or middleware logic, THEN THE Checklist_Tool SHALL include a
   test case that verifies an unauthenticated user is still redirected to `/login` for
   the affected route.

6. THE Checklist_Tool SHALL include a final sign-off row in the checklist: a declaration
   that all test cases were executed and no regression was found, with a space for the
   tester's name and date.

---

### Requirement 7: Non-Regression Constraint (Cross-Cutting)

**User Story:** As a product owner, I want a firm guarantee that the audit and cleanup
process cannot break any currently-working feature, so that users experience no disruption.

#### Acceptance Criteria

1. THE Fix_Tool SHALL, before applying any change, confirm that the target file's
   currently-passing behaviour is documented in the Phase 2 or Phase 4 report.

2. IF a change would modify a function, component, or route that is referenced by more
   than one call site, THEN THE Fix_Tool SHALL list all call sites in the change
   description and confirm all are safe.

3. THE Fix_Tool SHALL never alter the response schema of an existing API route handler
   that returns data to the client.

4. THE Fix_Tool SHALL never rename a Prisma model field, database table, or environment
   variable.

5. THE Fix_Tool SHALL never remove an exported symbol that has at least one import in the
   codebase, even if that import appears to be within dead code.

6. WHEN any TypeScript compilation error is introduced by a change, THE Fix_Tool SHALL
   revert the change and report the error before proceeding.

7. THE Fix_Tool SHALL make changes incrementally: one logical fix at a time, with a plain-
   language explanation of the change before it is applied.
