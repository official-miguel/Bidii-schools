# Implementation Plan: Bidii Audit & Cleanup

## Overview

Six-phase structured audit and cleanup of the Bidii school management system. Phases
execute sequentially with approval gates between each discovery phase and the next
action phase. All work is static analysis followed by targeted, incremental code changes.
No Prisma models are added or modified. TypeScript compile (`tsc --noEmit`) and lint
(`next lint`) gates are mandatory after every Phase 3 fix group and every Phase 4
deletion.

---

## Tasks

- [x] 1. Phase 1 — Interactive Element Inventory

  - [x] 1.1 Traverse web pages and record interactive elements
    - Recursively read every `src/app/**/page.tsx` and `src/app/**/layout.tsx`
    - For each file identify every `<button>`, `<Button>`, `<Link>`, `<a href>`,
      `router.push(...)`, `<form>`, `onSubmit`, sidebar nav entries, tab-bar items,
      `<IconButton>`, and icon-wrapped click handlers
    - Assign a stable ID (`P1-<n>`) to each element
    - Record: file path, element type, label / `aria-label`, and one of the six
      behaviour codes: `working` / `redirects-to-login` / `shows-error-page` /
      `does-nothing` / `calls-missing-api` / `needs-runtime-verification`
    - For every `redirects-to-login` / `shows-error-page` / `does-nothing` /
      `calls-missing-api` element assign one root-cause category:
      `missing-route` / `auth-check-misfiring` / `handler-not-wired` /
      `api-route-missing` / `wrong-permission-check` / `other`
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

  - [x] 1.2 Traverse mobile screens and record interactive elements
    - Recursively read every `mobile/app/**/*.tsx` (covers `(tabs)/`, `(auth)/`,
      `cards/`, `catalogue/`, `fines/`, `scan-modal.tsx`, `index.tsx`)
    - Apply the same element-type detection and behaviour/root-cause tagging as 1.1
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

  - [x] 1.3 Write phase1-inventory.md report
    - Create `.kiro/specs/bidii-audit-cleanup/phase1-inventory.md`
    - Include a summary table: total elements found, total broken, broken by category
    - Group broken elements by root-cause category
    - Flag any `needs-runtime-verification` items clearly in a dedicated section
    - Use the element record schema: `| ID | File | Element type | Label / aria-label | Behaviour | Root cause |`
    - _Requirements: 1.4, 1.5, 1.6_

- [~] 2. Approval Gate — Phase 1 Report
  - Present `phase1-inventory.md` to the user for review before proceeding.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Phase 2 — Auth and Routing Diagnosis

  - [x] 3.1 Run Check A — middleware coverage for auth-check-misfiring elements
    - For every `auth-check-misfiring` element from Phase 1, read `src/middleware.ts`
    - Verify whether the element's route path starts with a prefix in `PROTECTED_PREFIXES`
      (`/principal`, `/teacher`, `/staff`, `/parent`, `/results`, `/assessments`,
      `/super-admin`)
    - Flag routes that are unintentionally unprotected (prefix missing from list) vs.
      routes where the Edge check passes but server-side guard rejects a valid session
    - _Requirements: 2.1_

  - [x] 3.2 Run Check B — server-side guard resolution for auth-check-misfiring elements
    - For each `auth-check-misfiring` element locate the nearest `layout.tsx` or
      `page.tsx` up the route tree
    - Identify which guard is called: `getCurrentUser`, `requireSchoolRole`,
      `requireRole`, `requireSchoolPermission`, `requirePermission`, `enforceAuth`,
      `requireModuleAccess`, `requirePrincipal`, `requirePrincipalOrPermission`,
      `requireBursarOrPrincipal`
    - Check that the role list passed to the guard includes every role that should
      legitimately access the route (common miss: `requireSchoolRole("PRINCIPAL")` on
      a page that `ADMIN_STAFF` should also reach)
    - _Requirements: 2.2_

  - [x] 3.3 Run Check C — page / screen existence for missing-route elements
    - For each `missing-route` element confirm whether a `page.tsx` exists at the
      referenced path under `src/app/` (web) or `mobile/app/` (mobile)
    - Record the full target path for each missing file
    - _Requirements: 2.3_

  - [x] 3.4 Run Check D — API route existence for api-route-missing elements
    - For each `api-route-missing` element confirm whether a `route.ts` exists at
      the referenced path under `src/app/api/`
    - Record the full target path for each missing file
    - _Requirements: 2.4_

  - [x] 3.5 Run Check E — error boundary coverage scan
    - Grep the entire `src/app/` tree for any existing `error.tsx` or `not-found.tsx`
    - Document each portal root that lacks a root-level `error.tsx`:
      `src/app/principal/`, `src/app/teacher/`, `src/app/staff/`, `src/app/parent/`,
      `src/app/super-admin/`
    - _Requirements: 2.5_

  - [x] 3.6 Write phase2-diagnosis.md report
    - Create `.kiro/specs/bidii-audit-cleanup/phase2-diagnosis.md`
    - For every broken element from Phase 1 write one entry following the schema:
      element ID, file, element type and label, root cause, which checks confirmed it,
      proposed fix (file(s) to change, exact change, expected outcome)
    - Include the error boundary findings from Check E as a separate section
    - _Requirements: 2.6, 2.7_

- [x] 4. Approval Gate — Phase 2 Report
  - Present `phase2-diagnosis.md` to the user for review before proceeding.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Phase 3 — Broken Element Fixes (Group 1: missing-route)

  - [x] 5.1 Create missing web page.tsx files for missing-route items
    - For each `missing-route` web item approved in Phase 2, create the missing
      `page.tsx` (and `layout.tsx` if the route segment has no layout) under `src/app/`
    - Page content must be sufficient to render the intended screen (title, heading,
      and a placeholder body); do not add logic or data fetching not required by the
      element's intent
    - Before touching each file, record every other file that imports or references it
    - _Requirements: 3.2, 7.1, 7.2_

  - [x] 5.2 Create missing mobile screen files for missing-route items
    - For each `missing-route` mobile item, create the missing `.tsx` screen file
      under `mobile/app/` at the correct Expo Router path
    - _Requirements: 3.2, 7.1_

  - [ ]* 5.3 Run tsc --noEmit after Group 1 fixes
    - Execute `npx tsc --noEmit` in the project root
    - If any TypeScript errors appear, revert the last change, report the exact error,
      and propose an alternative before retrying
    - Execute `npx next lint` after a clean compile
    - Mark all Group 1 items as `resolved` in `phase2-diagnosis.md`
    - _Requirements: 3.6, 3.8, 4.7, 7.6_

- [x] 6. Phase 3 — Broken Element Fixes (Group 2: auth-check-misfiring)

  - [x] 6.1 Patch guard calls for auth-check-misfiring items
    - For each `auth-check-misfiring` item, update only the specific guard call in the
      identified `layout.tsx` or `page.tsx` — add missing roles to the role list passed
      to `requireSchoolRole`, `requireRole`, `requireSchoolPermission`, or the
      `middleware.ts` `PROTECTED_PREFIXES` array as appropriate
    - Never change guards on other routes
    - For each changed file record all call sites that import or reference it
    - _Requirements: 3.3, 7.2, 7.3_

  - [ ]* 6.2 Run tsc --noEmit after Group 2 fixes
    - Execute `npx tsc --noEmit`; revert on errors
    - Execute `npx next lint` after clean compile
    - Mark all Group 2 items as `resolved` in `phase2-diagnosis.md`
    - _Requirements: 3.6, 3.8, 7.6_

- [x] 7. Phase 3 — Broken Element Fixes (Group 3: handler-not-wired)

  - [x] 7.1 Add missing event bindings for handler-not-wired items
    - For each `handler-not-wired` item, add the missing `onClick`, `onPress`, `href`,
      or `action` binding to the element, pointing to the correct handler or route
    - Do not introduce new routes or handlers — wire to existing ones confirmed in
      Phase 2
    - _Requirements: 3.4, 7.1, 7.7_

  - [ ]* 7.2 Run tsc --noEmit after Group 3 fixes
    - Execute `npx tsc --noEmit`; revert on errors
    - Execute `npx next lint` after clean compile
    - Mark all Group 3 items as `resolved` in `phase2-diagnosis.md`
    - _Requirements: 3.6, 3.8, 7.6_

- [x] 8. Phase 3 — Broken Element Fixes (Group 4: api-route-missing)

  - [x] 8.1 Create missing route.ts files for api-route-missing items
    - For each `api-route-missing` item, create the missing `route.ts` at the correct
      path under `src/app/api/`
    - Implement only the HTTP verb(s) needed to unblock the broken element
    - Follow the project pattern: call `enforceAuth()` first, then
      `requireModuleAccess()` if school-scoped, then execute the minimal Prisma query
    - Response shape must be new (never alter an existing handler's response schema)
    - Never add extra fields to existing handler responses
    - _Requirements: 3.5, 7.3, 7.4_

  - [ ]* 8.2 Run tsc --noEmit after Group 4 fixes
    - Execute `npx tsc --noEmit`; revert on errors
    - Execute `npx next lint` after clean compile
    - Mark all Group 4 items as `resolved` in `phase2-diagnosis.md`
    - _Requirements: 3.6, 3.8, 7.6_

- [x] 9. Phase 3 — Broken Element Fixes (Group 5: error boundaries)

  - [x] 9.1 Add error.tsx at each portal root that is missing one
    - Create `src/app/principal/error.tsx`, `src/app/teacher/error.tsx`,
      `src/app/staff/error.tsx`, `src/app/parent/error.tsx`,
      `src/app/super-admin/error.tsx`
    - Each file must be a `"use client"` component that renders a user-friendly error
      message and a "Try again" button (calls `reset()`) and a "Go home" link
    - Do not add data fetching or role-specific logic to error boundaries
    - _Requirements: 3.2, 2.5_

  - [ ]* 9.2 Run tsc --noEmit after Group 5 additions
    - Execute `npx tsc --noEmit`; revert on errors
    - Execute `npx next lint` after clean compile
    - Mark error boundary items as `resolved` in `phase2-diagnosis.md`
    - _Requirements: 3.6, 3.8, 7.6_

- [x] 10. Phase 3 — Broken Element Fixes (Group 6: wrong-permission-check)

  - [x] 10.1 Correct wrong permission guard parameters
    - For each `wrong-permission-check` item, update the module or action argument
      passed to `requireSchoolPermission`, `requireModuleAccess`, or
      `requirePermission` in the identified file
    - Verify the corrected call against the permission matrix in the design before
      applying
    - List all call sites for each changed file in the change description
    - _Requirements: 3.3, 7.2_

  - [ ]* 10.2 Run tsc --noEmit after Group 6 fixes
    - Execute `npx tsc --noEmit`; revert on errors
    - Execute `npx next lint` after clean compile
    - Mark all Group 6 items as `resolved` in `phase2-diagnosis.md`
    - _Requirements: 3.6, 3.8, 7.6_

- [x] 11. Phase 3 — Broken Element Fixes (Group 7: other)

  - [x] 11.1 Apply case-by-case fixes for other category items
    - For each `other` category item, apply the specific fix described in
      `phase2-diagnosis.md`, confirmed and approved by the user before any edit
    - Follow the same pre-change call-site audit and post-change tsc/lint gates
    - _Requirements: 3.1, 7.1, 7.7_

  - [ ]* 11.2 Run tsc --noEmit after Group 7 fixes
    - Execute `npx tsc --noEmit`; revert on errors
    - Execute `npx next lint` after clean compile
    - Mark all Group 7 items as `resolved` in `phase2-diagnosis.md`
    - _Requirements: 3.6, 3.8, 7.6_

- [x] 12. Checkpoint — Phase 3 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm `phase2-diagnosis.md` has no unresolved items before proceeding to Phase 4.

- [ ] 13. Phase 4 — Dead Code Identification

  - [~] 13.1 Scan for unused imports and unexported dead symbols
    - Traverse every `.ts` and `.tsx` file under `src/` and `mobile/`
    - Identify imported symbols that are never referenced within the file
    - Identify exported symbols (functions, classes, constants, types) that are never
      imported by any other file in the codebase
    - _Requirements: 4.1_

  - [~] 13.2 Scan for components never rendered and unreachable API routes
    - Identify React components whose JSX tag or `React.createElement` call appears
      nowhere in the codebase outside their own definition file
    - Identify `route.ts` files under `src/app/api/` whose path is never the target of
      a `fetch(...)`, `useSWR(...)`, `useQuery(...)`, or `mutate(...)` call anywhere in
      `src/` or `mobile/`
    - _Requirements: 4.1_

  - [~] 13.3 Scan for utility functions with no callers and duplicate implementations
    - Identify exported utility functions with zero call sites across the codebase
    - Identify two or more functions or components that perform the same task: compare
      signatures, parameter names, and body structure for near-identical matches
    - _Requirements: 4.1, 4.3_

  - [~] 13.4 Scan for debug statements and commented-out code blocks
    - Grep all non-test `.ts` and `.tsx` files for `console.log`, `console.warn`,
      `console.error` literal calls (not inside catch blocks used for error reporting)
    - Identify multi-line `//` or `/* */` blocks that contain code rather than
      documentation comments
    - _Requirements: 4.2_

  - [~] 13.5 Write phase4-dead-code.md report
    - Create `.kiro/specs/bidii-audit-cleanup/phase4-dead-code.md`
    - List every item with: file path, symbol name, and reason it is considered unused
    - Separate findings into three tiers:
      - **Tier 1 — Safe to delete**: zero static references, no dynamic import risk
      - **Tier 2 — Likely unused**: no static refs but dynamic usage pattern possible
      - **Tier 3 — Review needed**: commented-out blocks and debug statements
    - _Requirements: 4.4, 4.5_

- [~] 14. Approval Gate — Phase 4 Report
  - Present `phase4-dead-code.md` to the user for review before any deletion.
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Phase 4 — Dead Code Removal (approved items only)

  - [~] 15.1 Remove approved Tier 1 items one at a time
    - For each item the user has explicitly approved for deletion, remove it from its
      file (or delete the file if it is entirely unused)
    - Before each removal confirm the item has not been cross-referenced as a Phase 3
      fix target; if it has, halt and ask the user whether to skip removal or merge the
      decisions
    - Never remove an exported symbol that has at least one import site, even within
      otherwise dead code
    - After each individual removal run `npx tsc --noEmit`; revert if any error appears
    - _Requirements: 4.6, 4.7, 7.5_

  - [ ]* 15.2 Run tsc --noEmit and next lint after all approved Tier 1 removals
    - Execute a final `npx tsc --noEmit` and `npx next lint` after all Tier 1 removals
    - _Requirements: 4.7, 7.6_

- [~] 16. Checkpoint — Phase 4 complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Phase 5 — Foundation Cleanup Identification

  - [~] 17.1 Scan for hardcoded string constants repeated in 3+ files
    - Grep for string literals (route paths, module names, status codes, messages) that
      appear identically in three or more source files and are suitable for extraction
      to a shared constant
    - Record file paths, the repeated string, and the number of occurrences
    - _Requirements: 5.1_

  - [~] 17.2 Scan for inconsistent auth-guard patterns
    - Identify API routes where equivalent operations use `requireSchoolRole` directly
      in one route but `enforceAuth` + `requireModuleAccess` in a parallel route
    - Document each pair/group of inconsistent files
    - _Requirements: 5.2_

  - [~] 17.3 Scan for missing or inconsistent error handling
    - Find API routes that return `NextResponse.json({ error: ... }, { status: 500 })`
      with an untyped or unstructured error object
    - Find `layout.tsx` files that call `getCurrentUser()` but do not have a null-user
      guard (i.e. no redirect or early return when the user is null)
    - Find components that accept a prop that can be `undefined` (union type) but render
      no fallback for that case
    - _Requirements: 5.3_

  - [~] 17.4 Scan for orphaned scripts at src/ and mobile/ root
    - List every `.ts` / `.tsx` file directly under `src/` and directly under `mobile/`
    - For each file, verify whether any of its exports are imported by any other file
    - Flag files with zero exported symbols used elsewhere as orphaned
    - _Requirements: 5.4_

  - [~] 17.5 Write phase5-foundation.md report
    - Create `.kiro/specs/bidii-audit-cleanup/phase5-foundation.md`
    - Each entry follows the schema: `F-<n>`, file path, issue type, severity
      (low / medium), description, suggested fix (≤5 lines of code)
    - Mark any finding whose fix would require touching more than two files as
      out-of-scope for this phase
    - Recommend at most one change per finding; no suggestion may alter a public
      function interface, rename a database model, or change a route path
    - _Requirements: 5.5, 5.6, 5.7_

- [~] 18. Approval Gate — Phase 5 Report
  - Present `phase5-foundation.md` to the user for review before any changes.
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Phase 5 — Foundation Fixes (approved items only)

  - [~] 19.1 Apply approved foundation fixes one at a time
    - For each finding the user explicitly approves, apply only the suggested fix
      (≤5 lines, ≤2 files)
    - Provide a plain-language explanation before each edit is applied
    - After each fix run `npx tsc --noEmit`; revert on errors
    - _Requirements: 5.5, 5.6, 7.6, 7.7_

  - [ ]* 19.2 Run tsc --noEmit and next lint after all approved Phase 5 fixes
    - Execute a final `npx tsc --noEmit` and `npx next lint` after all Phase 5 fixes
    - _Requirements: 7.6_

- [~] 20. Checkpoint — Phase 5 complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 21. Phase 6 — Verification Checklist Generation

  - [~] 21.1 Generate fix-verification test cases for every Phase 3 fix
    - For each item marked `resolved` in `phase2-diagnosis.md`, create one
      `fix-verification` test case specifying: TC-ID, role required, navigation path
      to reach the element, action to perform, expected result
    - _Requirements: 6.1, 6.2_

  - [~] 21.2 Generate regression test cases for each touched module
    - For each module (portal section) that had at least one fix applied in Phase 3,
      create at least one `regression` test case for a currently-working element in
      the same module
    - _Requirements: 6.3_

  - [~] 21.3 Generate auth-redirect test cases for guard and middleware changes
    - For every Phase 3 fix that touched `middleware.ts` or a server-side guard call,
      add a `type: auth-redirect` test case that navigates to the affected route as an
      unauthenticated user and verifies redirect to `/login`
    - _Requirements: 6.5_

  - [~] 21.4 Group test cases by role and write phase6-verification.md
    - Create `.kiro/specs/bidii-audit-cleanup/phase6-verification.md`
    - Group all test cases by role in this order: PRINCIPAL, ADMIN_STAFF, TEACHER,
      BURSAR, parent, library-mobile-user
    - Append the sign-off table at the end:
      ```
      | Item | Status |
      |---|---|
      | All test cases executed | ☐ |
      | No regression found | ☐ |
      | Tester name | ___________ |
      | Date | ___________ |
      ```
    - _Requirements: 6.1, 6.4, 6.6_

- [~] 22. Final Checkpoint — Audit complete
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm all six phase output files exist and are complete before closing the spec.

---

## Notes

- Tasks marked with `*` are the tsc/lint gate sub-tasks and are essential quality gates
  even though they are marked optional in the UI — do not skip them unless the parent
  task produced zero changes
- Each Phase 3 fix group (tasks 5–11) must be presented to the user as a diff before
  any edit is applied; user approval is required before proceeding within a group
- Approval gates (tasks 2, 4, 14, 18) are checkpoints where the workflow pauses for
  human review — do not skip them
- The `DEV_BYPASS_AUTH` env flag bypasses session checks; all manual verification in
  Phase 6 must be done with this flag unset
- Phase 3 fixes must never alter the response schema of an existing API route handler,
  rename a Prisma model field, or rename an environment variable
- Conflict detection: if a Phase 3 fix target file is also a Phase 4 dead-code
  candidate, halt and ask the user before proceeding

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["3.6"] },
    { "id": 4, "tasks": ["5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2"] },
    { "id": 8, "tasks": ["7.1"] },
    { "id": 9, "tasks": ["7.2"] },
    { "id": 10, "tasks": ["8.1"] },
    { "id": 11, "tasks": ["8.2"] },
    { "id": 12, "tasks": ["9.1"] },
    { "id": 13, "tasks": ["9.2"] },
    { "id": 14, "tasks": ["10.1"] },
    { "id": 15, "tasks": ["10.2"] },
    { "id": 16, "tasks": ["11.1"] },
    { "id": 17, "tasks": ["11.2"] },
    { "id": 18, "tasks": ["13.1", "13.2", "13.3", "13.4"] },
    { "id": 19, "tasks": ["13.5"] },
    { "id": 20, "tasks": ["15.1"] },
    { "id": 21, "tasks": ["15.2"] },
    { "id": 22, "tasks": ["17.1", "17.2", "17.3", "17.4"] },
    { "id": 23, "tasks": ["17.5"] },
    { "id": 24, "tasks": ["19.1"] },
    { "id": 25, "tasks": ["19.2"] },
    { "id": 26, "tasks": ["21.1", "21.2", "21.3"] },
    { "id": 27, "tasks": ["21.4"] }
  ]
}
```
