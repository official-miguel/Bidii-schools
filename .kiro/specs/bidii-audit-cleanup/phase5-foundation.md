# Phase 5 Foundation Cleanup Report — Bidii System

**Date generated:** 2026-09-14  
**Spec:** bidii-audit-cleanup  
**Scans performed:** 17.1 (repeated constants), 17.2 (inconsistent auth guards), 17.3 (error handling gaps), 17.4 (orphaned root scripts)

---

## Executive Summary

| Severity | Items | Description |
|---|---|---|
| Medium | 3 | Raw exception messages leaking into 500 responses |
| Low | 4 | Orphaned root-level debug/maintenance scripts |
| Low | 1 | One library route bypasses LIBRARY permission check |
| Low | 1 | `GEMINI` provider string repeated in 3 route files |
| Info | — | Auth guard pattern: consistent across library and timetable (no fix needed) |
| Info | — | All layouts have correct null-user guards (no fix needed) |

Total actionable findings: **9** (F-01 through F-09)

---

## Findings

### F-01 — Raw exception message in finance reconciliation 500 response
**File:** `src/app/api/finance/reconciliation/[id]/resolve/route.ts:169`  
**Issue type:** Inconsistent error handling  
**Severity:** Medium  
**Description:** The catch block sends `e.message` (a raw exception string) to the client in the 500 response: `{ error: \`An unexpected error occurred: ${e.message ?? String(err)}\` }`. This exposes internal implementation details (Prisma error messages, stack traces) to the browser.  
**Suggested fix (1 line, 1 file):**
```ts
// Before
return NextResponse.json({ error: `An unexpected error occurred: ${e.message ?? String(err)}` }, { status: 500 });
// After
return NextResponse.json({ error: "An unexpected error occurred. Please try again." }, { status: 500 });
```

---

### F-02 — Raw exception message in accommodation cubicles bulk-create 500 response
**File:** `src/app/api/accommodation/dormitories/[dormId]/cubicles/route.ts:180`  
**Issue type:** Inconsistent error handling  
**Severity:** Medium  
**Description:** `{ error: \`Failed to create cubicles: ${err instanceof Error ? err.message : String(err)}\` }` — same pattern as F-01, sends Prisma/Node error text to the client.  
**Suggested fix (1 line, 1 file):**
```ts
// Before
return NextResponse.json({ error: `Failed to create cubicles: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
// After
return NextResponse.json({ error: "Failed to create cubicles. Please try again." }, { status: 500 });
```

---

### F-03 — Raw exception message in accommodation cubicles single-create 500 response
**File:** `src/app/api/accommodation/dormitories/[dormId]/cubicles/route.ts:271`  
**Issue type:** Inconsistent error handling  
**Severity:** Medium  
**Description:** Same file as F-02, single-create path: `{ error: \`Failed to create cubicle: ${err instanceof Error ? err.message : String(err)}\` }`.  
**Suggested fix (1 line, same file as F-02):**
```ts
// Before
return NextResponse.json({ error: `Failed to create cubicle: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
// After
return NextResponse.json({ error: "Failed to create cubicle. Please try again." }, { status: 500 });
```
> Note: F-02 and F-03 are in the same file — fix both in one edit.

---

### F-04 — `/api/library/students/fines` bypasses LIBRARY permission check
**File:** `src/app/api/library/students/fines/route.ts:10`  
**Issue type:** Inconsistent auth-guard pattern  
**Severity:** Low  
**Description:** Every other `src/app/api/library/` route uses `(await requireSchoolRole("PRINCIPAL")) ?? (await requireSchoolPermission("LIBRARY", "view"))` so that staff with LIBRARY.view can also access it. This one route uses only `requireSchoolRole("PRINCIPAL")`, blocking library staff from listing student fines — almost certainly unintentional.  
**Suggested fix (2 lines, 1 file):**
```ts
// Before
const user = await requireSchoolRole("PRINCIPAL");
// After
const user = (await requireSchoolRole("PRINCIPAL")) ??
  (await requireSchoolPermission("LIBRARY", "view"));
```
Also add the missing `requireSchoolPermission` import (already present in the same file for other exports? Verify — if not, add `import { requireSchoolPermission } from "@/lib/permissions";`).

---

### F-05 — `"GEMINI"` provider string literal repeated in 3 route files
**Files:**  
- `src/app/api/soma-ai/chat/route.ts` (×2 — `findUnique` and `updateMany` calls)  
- `src/app/api/soma-ai/config/route.ts` (×2)  
- `src/app/api/soma-ai/config/test/route.ts` (×1)  
**Issue type:** Repeated hardcoded constant  
**Severity:** Low  
**Description:** The string `"GEMINI"` is used as the `provider` key when querying `SchoolIntegration`. If the provider name ever changes, three files need updating. It is already defined as an enum value in Prisma (`IntegrationProvider.GEMINI`) — routes should use the enum or a shared constant.  
**Suggested fix (1 line, add to `src/lib/soma-ai/config.ts`):**
```ts
/** Prisma IntegrationProvider key for the Gemini/Soma AI integration. */
export const SOMA_AI_PROVIDER = "GEMINI" as const;
```
Then replace the three call sites. This touches 4 files total — **mark out-of-scope** per Phase 5 rules (>2 files). Flag for a future pass.

---

### F-06 — `check-super-admin-rest.js` — orphaned REST test script at workspace root
**File:** `check-super-admin-rest.js`  
**Issue type:** Orphaned root script  
**Severity:** Low  
**Description:** A one-off script that uses `node-fetch` to test the super-admin REST API. Not imported by any other file. Not a test file (not in `__tests__/`). Not a build tool. Pure debug artifact.  
**Suggested fix:** Delete the file.

---

### F-07 — `generate-fresh-hash.js` and `test-hash-only.js` — orphaned password-hash scripts
**Files:** `generate-fresh-hash.js`, `test-hash-only.js`  
**Issue type:** Orphaned root scripts  
**Severity:** Low  
**Description:** Both files use `bcryptjs` to hash or verify a hardcoded password `'Bidii@2026'`. These are one-time setup scripts with no callers. The hardcoded password string is a security smell even in a script.  
**Suggested fix:** Delete both files.

---

### F-08 — `verify-password.js` — orphaned bcrypt verification script
**File:** `verify-password.js`  
**Issue type:** Orphaned root script  
**Severity:** Low  
**Description:** Standalone bcrypt verification script, hardcodes the same password. No callers, no build integration.  
**Suggested fix:** Delete the file.

---

### F-09 — `test-api-performance.js` and `test-super-admin-login.js` — orphaned test scripts
**Files:** `test-api-performance.js`, `test-super-admin-login.js`  
**Issue type:** Orphaned root scripts  
**Severity:** Low  
**Description:** Both are standalone Node scripts for manual testing with no integration into the test suite or CI. `test-super-admin-login.js` uses `PrismaClient` directly and hardcodes credentials — a security smell. Neither is imported or referenced anywhere.  
**Suggested fix:** Delete both files.

---

## What Was Checked and Found Clean (No Action Needed)

| Area | Finding |
|---|---|
| Layout null-user guards | All 7 layouts (`principal`, `teacher`, `staff`, `staff/library`, `staff/timetable`, `staff/records`, `super-admin`, `parent`) correctly check `if (!user)` before accessing `user.xxx`. No gaps. |
| Library auth-guard consistency | All `src/app/api/library/` routes (except F-04) use `requireSchoolRole("PRINCIPAL") ?? requireSchoolPermission("LIBRARY", "view/manage")` — consistent. |
| Timetable auth-guard consistency | All `src/app/api/timetable/v2/` routes use `requireSchoolRole("PRINCIPAL") ?? requireSchoolPermission("TIMETABLE", "view/manage")` — consistent. |
| Root-level `src/` files | Only `src/middleware.ts` exists at the root — actively used, not orphaned. |
| `fix-collapse-simple.js` | References `src/lib/timetable/engineHelpers.ts` — a one-off patch script. Already applied; safe to delete but not a security risk. Included in F-09 group if the user wants a sweep. |

---

## Recommended Apply Order (if all approved)

1. **F-01** (1 line) — reconciliation 500
2. **F-02 + F-03** (2 lines, same file) — cubicles 500 ×2
3. **F-04** (2 lines) — library/students/fines guard
4. **F-06, F-07, F-08, F-09** (file deletions) — orphaned root scripts
5. **F-05** — mark out-of-scope (>2 files), defer to future pass
