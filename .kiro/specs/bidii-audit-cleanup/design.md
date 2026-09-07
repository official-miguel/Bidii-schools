# Design Document — Bidii Audit & Cleanup

## Overview

The Bidii system is a dual-surface product: a Next.js 14 web app (`src/`) and an Expo /
React Native mobile library app (`mobile/`). After several rounds of feature additions,
the codebase contains broken interactive elements, inconsistent auth-guard patterns,
accumulated dead code, and no error-boundary coverage. This spec defines a structured
six-phase process — three discovery phases with approval gates, two fix phases, and one
verification phase — to bring the product to a clean, consistent, and fully-working
baseline without changing any currently-working functionality.

The phases execute in strict sequence:

```
Phase 1 (discover) → approval → Phase 2 (diagnose) → approval
  → Phase 3 (fix) → approval → Phase 4 (discover) → approval
  → Phase 5 (discover) → approval → Phase 6 (generate checklist)
```

All six phases share two cross-cutting concerns: the non-regression constraint (no
working feature may be broken) and the TypeScript compile-check gate (any change that
introduces a type error must be reverted immediately).

---

## Architecture

### System topology

```
┌──────────────────────────────────────────────────────────────────┐
│                      Bidii Web App (src/)                        │
│                                                                  │
│  Edge Layer                                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  middleware.ts                                           │    │
│  │  Cookie presence check (bidii_session)                   │    │
│  │  PROTECTED_PREFIXES: /principal /teacher /staff          │    │
│  │                      /parent /results /assessments       │    │
│  │                      /super-admin                        │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                      │
│  Server-side Auth Layer (React cache)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  src/lib/auth.ts                                         │   │
│  │  getCurrentUser()  requireRole()  requireSchoolRole()    │   │
│  │                                                          │   │
│  │  src/lib/permissions.ts                                  │   │
│  │  requireSchoolPermission()  getEffectivePermissions()    │   │
│  │  requirePermission()  requireRecordsPermission()         │   │
│  │                                                          │   │
│  │  src/lib/apiAuth.ts                                      │   │
│  │  enforceAuth()  requireModuleAccess()  requirePrincipal()│   │
│  │  requirePrincipalOrPermission()  requireBursarOrPrincipal│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Route Layer                                                     │
│  ┌──────────────────┐   ┌──────────────────────────────────┐    │
│  │  App Router pages│   │  API routes (src/app/api/)       │    │
│  │  185 page.tsx    │   │  298 route.ts files              │    │
│  │  Portals:        │   │  accommodation/ achievements/    │    │
│  │  /principal      │   │  assessments/ attendance/ auth/  │    │
│  │  /teacher        │   │  calendar/ classes/ departments/ │    │
│  │  /staff          │   │  finance/ library/ messaging/    │    │
│  │  /parent         │   │  parent/ staff/ students/ ...    │    │
│  │  /super-admin    │   └──────────────────────────────────┘    │
│  └──────────────────┘                                           │
│                                                                  │
│  Data Layer                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Prisma ORM → Supabase Postgres                          │   │
│  │  (Supabase used for DB + Storage only; auth is custom)   │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                   Bidii Mobile App (mobile/)                     │
│                                                                  │
│  Expo / React Native                                             │
│  Screens: (tabs): analytics browse cards catalogue circulate     │
│            dashboard my-borrows my-card reservations scan        │
│            settings                                              │
│  Screens: (auth): login                                          │
│  Screens: cards/[studentId] catalogue/[id] fines/               │
│           scan-modal                                             │
│                                                                  │
│  Offline SQLite (local DB) + REST calls to web API for sync     │
└──────────────────────────────────────────────────────────────────┘
```

### Audit process flow

```
┌────────────────┐     report      ┌────────────────┐
│   Phase 1      │ ─────────────►  │  Approval Gate │
│   Inventory    │                 │  (user review) │
└────────────────┘                 └───────┬────────┘
                                           │ approved
                                           ▼
┌────────────────┐     report      ┌────────────────┐
│   Phase 2      │ ─────────────►  │  Approval Gate │
│   Diagnose     │                 │  (user review) │
└────────────────┘                 └───────┬────────┘
                                           │ approved
                                           ▼
                                   ┌────────────────┐
                                   │   Phase 3      │
                                   │   Fix (group   │
                                   │   by category) │
                                   └───────┬────────┘
                                           │ all groups done
                                           ▼
┌────────────────┐     report      ┌────────────────┐
│   Phase 4      │ ─────────────►  │  Approval Gate │
│   Dead Code    │                 │  (user review) │
└────────────────┘                 └───────┬────────┘
                                           │ approved
                                           ▼
┌────────────────┐     report      ┌────────────────┐
│   Phase 5      │ ─────────────►  │  Approval Gate │
│   Foundation   │                 │  (user review) │
└────────────────┘                 └───────┬────────┘
                                           │ approved
                                           ▼
                                   ┌────────────────┐
                                   │   Phase 6      │
                                   │   Checklist    │
                                   └────────────────┘
```

---

## Components and Interfaces

### Phase 1 — Interactive Element Inventory

**Scope of traversal:**

| Surface | Glob pattern | File types |
|---|---|---|
| Web pages | `src/app/**/page.tsx` | Next.js App Router pages |
| Web layouts | `src/app/**/layout.tsx` | Layout wrappers |
| Mobile screens | `mobile/app/**/*.tsx` | Expo Router screens |

**Element types to record:**

| Type | Detection signal |
|---|---|
| `button` | `<button>`, `<Button>` component |
| `link` | `<Link>`, `<a href>`, `router.push(...)` |
| `form` | `<form>`, `<Form>`, `onSubmit` handler |
| `nav-item` | Sidebar nav entries, tab bar items |
| `icon-button` | `<IconButton>`, icon wrapped in click handler |

**Behaviour classifications:**

| Code | Description |
|---|---|
| `working` | Performs its intended action without error |
| `redirects-to-login` | Navigates to `/login` unexpectedly |
| `shows-error-page` | Renders an unhandled error / blank page |
| `does-nothing` | Click/tap produces no visible effect |
| `calls-missing-api` | Fetch target returns 404 |
| `needs-runtime-verification` | Cannot be determined from static analysis |

**Root-cause categories for broken elements:**

| Category | Description |
|---|---|
| `missing-route` | Target `page.tsx` does not exist |
| `auth-check-misfiring` | Guard rejects a legitimately authenticated user |
| `handler-not-wired` | `onClick` / `onPress` / `href` / `action` not bound |
| `api-route-missing` | Referenced `route.ts` does not exist |
| `wrong-permission-check` | Guard uses wrong module or action for the role |
| `other` | None of the above |

**Output:** `.kiro/specs/bidii-audit-cleanup/phase1-inventory.md`

---

### Phase 2 — Auth & Routing Diagnosis

This phase works from the Phase 1 report. For every broken element it performs four
targeted checks.

**Check A — Middleware coverage:**
- Determine whether the element's route path begins with one of the `PROTECTED_PREFIXES`
  in `src/middleware.ts`.
- If the route is protected but the cookie is absent at runtime, the redirect is expected.
  The real question is whether the route's prefix is missing from the list (so it is
  unintentionally unprotected) or the guard on the server side rejects a valid session.

**Check B — Server-side guard resolution:**
- Locate the nearest `layout.tsx` or `page.tsx` up the route tree.
- Identify which guard function is called: `getCurrentUser`, `requireSchoolRole`,
  `requireRole`, `requireSchoolPermission`, `requirePermission`, `enforceAuth`, etc.
- For `redirects-to-login` failures, verify that the guard function's role list includes
  all roles that should be allowed. Common mismatch: a staff-facing page calls
  `requireSchoolRole("PRINCIPAL")` when it should also accept `"ADMIN_STAFF"`.

**Check C — Page / screen existence:**
- For `missing-route` items, confirm that a directory + `page.tsx` exist at the
  referenced path under `src/app/` (web) or `mobile/app/` (mobile).

**Check D — API route existence:**
- For `api-route-missing` items, confirm that a `route.ts` exists at the referenced
  path under `src/app/api/`.

**Check E — Error boundary coverage:**
- At time of initial scan, **no `error.tsx` or `not-found.tsx` files exist anywhere
  in the project**. This means any unhandled server exception or missing route bubbles
  up to Next.js's global default error page rather than a purpose-built boundary.
- The diagnosis report must flag every portal root (`/principal`, `/teacher`, `/staff`,
  `/parent`, `/super-admin`) as needing a root-level `error.tsx`.

**Output:** `.kiro/specs/bidii-audit-cleanup/phase2-diagnosis.md`

Each entry in this report follows the schema:

```
## [Element ID from Phase 1]

- File: <path>
- Element: <type> — <label>
- Root cause: <category>
- Confirmed by: <which check(s) applied>
- Proposed fix:
  - File(s) to change: <list>
  - Change: <description of the exact edit>
  - Expected outcome: <what the element will do after the fix>
```

---

### Phase 3 — Broken Element Fixes

Fixes are applied in this group order to minimise cascading effects:

1. `missing-route` — create missing `page.tsx` (and `layout.tsx` if needed)
2. `auth-check-misfiring` — patch the specific guard call or middleware matcher
3. `handler-not-wired` — add the missing event binding
4. `api-route-missing` — create the minimal `route.ts`
5. Error boundary additions — add `error.tsx` at each portal root
6. `wrong-permission-check` — correct the module or action parameter
7. `other` — handled case-by-case

**Per-group workflow:**

```
present group diff → user approves → apply changes
  → run tsc --noEmit → if errors: revert + report → else continue
  → update phase2-diagnosis.md to mark items resolved
  → move to next group
```

**Non-regression gate (embedded in every fix):**
- Before touching a file, record every other call site that imports or references it.
- If the file is referenced by more than one call site, list all sites in the diff
  description and confirm each is unaffected.
- Never change the response shape of an existing API route handler.
- Never rename a Prisma model field, DB table, or environment variable.

---

### Phase 4 — Dead Code Identification

**Scan targets:**

| Category | Detection method |
|---|---|
| Unused imported symbols | Import present, symbol never referenced in the file |
| Exported but never imported | Symbol exported, grep finds zero imports elsewhere |
| Components never rendered | JSX element tag or `React.createElement` call absent |
| Unreachable API routes | `route.ts` file exists, no fetch/mutation call targets its path |
| Utility functions with no callers | Exported function, no call site found |
| `console.log/warn/error` in production paths | Literal `console.` calls in non-test files |
| Duplicate implementations | Two+ functions with identical or near-identical signatures and bodies |
| Commented-out code blocks | Multi-line `//` or `/* */` blocks of code (not documentation) |

**Tier classification:**

| Tier | Label | Criteria |
|---|---|---|
| 1 | Safe to delete | Zero static references; no dynamic string-import pattern nearby |
| 2 | Likely unused | No static references but pattern suggests possible dynamic usage |
| 3 | Review needed | Commented-out blocks, debug statements intentionally kept |

**Output:** `.kiro/specs/bidii-audit-cleanup/phase4-dead-code.md`

No item is deleted until:
1. The Phase 4 report is reviewed and each item is explicitly approved.
2. After each approved deletion, `tsc --noEmit` passes before the next deletion.

---

### Phase 5 — Foundation Cleanup

**Finding categories:**

| Category | Detection rule |
|---|---|
| Hardcoded string constants | Same string literal appears in 3+ files |
| Inconsistent auth-guard patterns | Some routes use `requireSchoolRole` directly; others use `enforceAuth` + `requireModuleAccess` |
| Untyped 500 responses | `NextResponse.json({ error: ... }, { status: 500 })` with no structured error type |
| Null-user layouts | `layout.tsx` calls `getCurrentUser` but does not handle `null` return |
| Undefined-prop components | Component accepts a prop that is sometimes `undefined` with no fallback rendered |
| Orphaned scripts | `.ts`/`.tsx` file at `src/` or `mobile/` root with no exports used elsewhere |

**Constraint:** Every suggested fix must be five lines or fewer, touch at most two files,
and must not alter a public function interface, rename a database model, or change a
route path.

**Output:** `.kiro/specs/bidii-audit-cleanup/phase5-foundation.md`

Each entry follows:

```
### F-<n>: <issue type>

- File: <path>
- Severity: low | medium
- Description: <what the issue is>
- Suggested fix:
  ```
  <≤5 lines of code change>
  ```
```

---

### Phase 6 — Verification Checklist

**Test case schema (per fixed element):**

| Field | Description |
|---|---|
| ID | `TC-<n>` sequential |
| Role | PRINCIPAL / ADMIN_STAFF / TEACHER / BURSAR / parent / library-mobile-user |
| Navigation path | Exact URL or tap sequence to reach the element |
| Action | What to do (click, fill form, tap button) |
| Expected result | What should happen |
| Type | `fix-verification` / `regression` / `auth-redirect` |

**Grouping:** Test cases are grouped by role so a tester can run all cases for their
role in one pass.

**Auth-redirect cases:** Whenever a fix touched a middleware matcher or a server-side
guard, a `type: auth-redirect` test case is added that repeats the action as an
unauthenticated user and confirms `/login` is reached.

**Regression cases:** At least one `type: regression` case per module touched, verifying
a currently-working element in the same module still behaves correctly.

**Sign-off row:** The checklist ends with a sign-off table:

```markdown
| Item | Status |
|---|---|
| All test cases executed | ☐ |
| No regression found | ☐ |
| Tester name | ___________ |
| Date | ___________ |
```

**Output:** `.kiro/specs/bidii-audit-cleanup/phase6-verification.md`

---

## Data Models

No new Prisma models are introduced. The audit process is entirely file-system and
static-analysis based. The five output documents are plain Markdown files written into
`.kiro/specs/bidii-audit-cleanup/`.

### Report file registry

| Phase | Output file | Purpose |
|---|---|---|
| 1 | `phase1-inventory.md` | Complete inventory of interactive elements with behaviour tags |
| 2 | `phase2-diagnosis.md` | Per-element root-cause diagnosis and proposed fix |
| 3 | _(updates phase2)_ | Items marked `resolved` as fixes are applied |
| 4 | `phase4-dead-code.md` | Tiered dead code inventory |
| 5 | `phase5-foundation.md` | Foundation improvement findings |
| 6 | `phase6-verification.md` | Manual-testing checklist |

### Shared element record structure (used in Phase 1 report)

```
| ID | File | Element type | Label / aria-label | Behaviour | Root cause |
```

The `ID` field is a stable reference key (`P1-<n>`) used by Phase 2 and Phase 6 to
cross-reference findings without relying on file paths that may change during Phase 3.

---

## Error Handling

### TypeScript compile gate

Every Phase 3 fix and every Phase 4 deletion must be followed by:

```bash
npx tsc --noEmit
```

If this command produces any errors, the change is reverted immediately and the error is
reported before proceeding. This is non-negotiable — it is the primary safety net
against regressions introduced by the cleanup work.

### Guard for API schema stability

Phase 3 fix handlers (`api-route-missing`) must implement only the HTTP verbs and
response shapes needed to unblock the broken element. They must not add extra fields to
responses of existing handlers and must not change status codes of existing success
responses.

### Approval gate failures

If the user declines a Phase Findings Report at an approval gate, the workflow stops.
The rejected findings remain in their output file marked `[rejected]`. The user may
request re-analysis of specific items or skip specific items before re-approval.

### Conflict detection during Phase 3

Before applying any fix, the tool checks whether the target file is also referenced by
a Phase 4 candidate (i.e., would be deleted as dead code). If so, the tool halts and
asks the user whether to:
a) Skip the dead code candidacy for that file and apply the fix.
b) Apply the fix and keep the dead code finding as Tier 2 (pending review).
c) Skip the Phase 3 fix for that element.

### Revert protocol

If a TypeScript error is introduced:
1. Immediately revert the single last change using `git diff` output (not a hard reset).
2. Report the exact TS error to the user.
3. Propose an alternative fix before retrying.

---

## Testing Strategy

This feature is a developer tooling workflow, not application code with business-logic
functions. The deliverables are Markdown report files and targeted code changes applied
to the existing codebase. Property-based testing is not appropriate here because:

- There is no pure function with universally-quantifiable input/output behaviour.
- All work is I/O-bound: file traversal, static code analysis, and Prisma queries.
- The correctness of each phase output is validated by the human approval gate, not
  by automated test iteration.

The testing strategy therefore uses three complementary approaches:

### 1. TypeScript compile check (automated, after every Phase 3 fix and Phase 4 deletion)

```bash
npx tsc --noEmit
```

This is the primary automated correctness gate. It catches:
- Type errors introduced by new `page.tsx` or `route.ts` files.
- Import shape mismatches when dead code is removed.
- Parameter type errors in patched guard calls.

### 2. Lint check (automated, after every Phase 3 and Phase 4 change)

```bash
npx next lint
```

Catches:
- Unused variable warnings that signal an incomplete fix.
- Missing `"use client"` directives on patched client components.
- React hook rule violations in new page files.

### 3. Manual verification (Phase 6 checklist)

The Phase 6 checklist is the acceptance test suite. It covers:
- One fix-verification case per broken element fixed in Phase 3.
- At least one regression case per module touched.
- One auth-redirect case per route whose guard or middleware matcher was changed.

The checklist is designed for a single tester to execute end-to-end in the browser and
the Expo mobile app, grouped by role to minimise context switching.

### Quality gates summary

| Trigger | Gate | Must pass before |
|---|---|---|
| Each Phase 3 fix applied | `tsc --noEmit` | Next fix in same group |
| Each Phase 3 group completed | `next lint` | Next group begins |
| Each Phase 4 deletion approved | `tsc --noEmit` | Next deletion |
| All Phase 3 fixes complete | Manual Phase 6 checklist | Audit considered done |

### Known codebase constraints the tests must respect

- **No `error.tsx` / `not-found.tsx` files exist** anywhere in the project at the start
  of the audit. Any test case that navigates to a broken route will see the Next.js
  default error page, not a custom boundary. Adding `error.tsx` is an explicit Phase 3
  fix item for all five portal roots.
- **DEV_BYPASS_AUTH env flag** in `auth.ts` bypasses the session check. All manual
  testing must be done with this flag unset (or use actual user accounts) to exercise
  real auth flows.
- **298 API routes and 185 page files** — the inventory is large. Phase 1 prioritises
  portals and modules that have known instability or have received recent changes.
