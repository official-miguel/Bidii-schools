# Phase 2 Diagnosis — Bidii System Audit

**Date generated:** 2025-07  
**Spec:** bidii-audit-cleanup  
**Checks performed:** A (Middleware), B (Server-side Guards), C (Missing Routes), D (Missing API Routes), E (Error Boundaries)

---

## Executive Summary

| Category | Count | Highest Severity |
|---|---|---|
| Middleware coverage gaps | 3 | Low |
| Auth guard bugs (server-side) | 6 | **High** |
| Missing web routes | 18 | Medium |
| Missing mobile routes | 1 | Low |
| Missing API routes | 9 | **High** |
| API URL mismatches | 1 | **High** |
| Missing error boundaries (web) | 8 | **Critical** |
| Missing error boundaries (mobile) | 1 | Medium |
| **Total open items** | **47** | |

**Critical path summary:**

- Two root error boundaries (`global-error.tsx`, `error.tsx`) are completely absent — any unhandled exception produces a blank white screen or raw Next.js 500.
- Three auth guard bugs (B-1, B-2, B-3) actively block legitimate role-based access. STUDENT users routed to `/parent` are blocked by the layout. BURSAR users are bounced out of the staff portal after being admitted.
- Nine API routes are missing, breaking QR scan, card suspension, fines management, and catalogue operations on mobile.
- The `/api/library/catalogues` vs `/api/library/catalogue` mismatch causes 100% failure of all mobile catalogue operations.

---

## Check A — Middleware Coverage

> **Overall verdict:** Middleware correctly protects all 7 route prefixes. No security holes. Three low-severity structural issues noted.

| ID | File | Issue | Root Cause Category | Severity | Proposed Fix | Status |
|---|---|---|---|---|---|---|
| MW-1 | `src/middleware.ts` (staff prefix branch) | Staff layout bounces a TEACHER without FEES/LIBRARY perms to `/login` instead of `/teacher` | Auth check misfiring | Low | Update the fallback redirect target from `/login` to `/teacher` for authenticated TEACHER role users | open |
| MW-2 | `src/app/results/print/page.tsx` | No `getCurrentUser()` call — pure redirect shim relying on middleware cookie only | Missing server-side guard | Low | Add `getCurrentUser()` and validate the session token explicitly before redirecting | open |
| MW-3 | `src/app/results/`, `src/app/assessments/` | No root `layout.tsx` — auth is enforced page-by-page only, not at segment root | Structural — missing layout | Low | Add a minimal `layout.tsx` at each segment root that calls `getCurrentUser()` and redirects unauthenticated users | open |

---

## Check B — Server-side Guard Resolution

> **6 issues found.** 3 HIGH (actively broken role routing), 1 MEDIUM (feature inaccessible to valid role), 2 LOW (fragility / missing null-guard).

### High Severity

| ID | File | Guard (current) | Bug Description | Root Cause Category | Proposed Fix | Files to Change | Expected Outcome | Status |
|---|---|---|---|---|---|---|---|---|
| B-1 | `src/app/(parent)/layout.tsx` | `if (!user \|\| user.role !== "PARENT") redirect("/login")` | Root dispatcher routes STUDENT role users to `/parent`, and `parent/page.tsx` allows STUDENT — but the **layout** blocks STUDENT before the page ever runs | Role allowlist too narrow | Change to: `if (!user \|\| (user.role !== "PARENT" && user.role !== "STUDENT")) redirect("/login")` | `src/app/(parent)/layout.tsx` — 1 line | STUDENT users can reach the parent portal as intended by the dispatcher | open |
| B-2 | `src/app/(staff)/page.tsx` | `if (!user \|\| user.role !== "ADMIN_STAFF") redirect("/login")` | BURSAR role is admitted by `staff/layout.tsx` (`isCoreStaff` includes BURSAR), but `staff/page.tsx` bounces BURSARs back to login | Role allowlist too narrow | Change to: `if (!user \|\| (user.role !== "ADMIN_STAFF" && user.role !== "BURSAR")) redirect("/login")` | `src/app/(staff)/page.tsx` — 1 line | BURSAR users can land on the staff dashboard after being admitted by the layout | open |
| B-3 | `src/app/(staff)/timetable/layout.tsx` | `if (!user \|\| user.role !== "ADMIN_STAFF") redirect("/login")` | Redundant and wrong — BURSAR and TEACHER module-staff can access the staff portal but get bounced at this nested layout | Redundant role gate overriding correct permission gate below | Change to: `if (!user) redirect("/login")` — remove the role check entirely; the `canManage` permission gate beneath it is the correct authority | `src/app/(staff)/timetable/layout.tsx` — 1 line | BURSAR and TEACHER module-staff can access timetable management as permitted | open |

### Medium Severity

| ID | File | Guard (current) | Bug Description | Root Cause Category | Proposed Fix | Files to Change | Expected Outcome | Status |
|---|---|---|---|---|---|---|---|---|
| B-4 | `src/app/(staff)/directory/page.tsx` | `if (!user \|\| user.role !== "ADMIN_STAFF") redirect("/login")` | BURSAR users legitimately in the staff portal cannot access the staff directory | Role allowlist too narrow | Change to: `if (!user \|\| (user.role !== "ADMIN_STAFF" && user.role !== "BURSAR")) redirect("/login")` | `src/app/(staff)/directory/page.tsx` — 1 line | BURSAR users can use the staff directory | open |

### Low Severity

| ID | File | Bug Description | Root Cause Category | Proposed Fix | Files to Change | Expected Outcome | Status |
|---|---|---|---|---|---|---|---|
| B-5 | `src/app/(staff)/calendar/page.tsx`, `src/app/(staff)/students/page.tsx` | Both call `getEffectivePermissions(user!)` without a null guard; module-teacher users receive the wrong permission map | Missing role branch in permission lookup | Use `getTeacherEffectivePermissions` for TEACHER role users; add a `user.role === "TEACHER"` branch before calling `getEffectivePermissions` | Both page files — ~3 lines each | Correct permission map returned for all role types | open |
| B-6 | `src/app/(principal)/page.tsx` | No role check — relies entirely on the layout guard | Missing defence-in-depth guard | No immediate fix required; add a role check only if auth is refactored to decouple layouts from pages | `src/app/(principal)/page.tsx` — optional | Resilient to future layout restructuring | open |

---

## Check C — Missing Routes

> **19 missing routes total: 18 web, 1 mobile.** Grouped by source component / dashboard.

### Group C-WEB-A: Staff Library Dashboard Quick Links

Source component: `src/components/dashboard/LibrarianDashboard.tsx`

| ID | Expected Route | Page File | Root Cause | Proposed Fix | Files to Create | Status |
|---|---|---|---|---|---|---|
| C1 | `/staff/library/issue` | Missing `page.tsx` | Dashboard links to non-existent route | Create redirect page: `redirect("/staff/library/circulate")` | `src/app/(staff)/library/issue/page.tsx` | open |
| C2 | `/staff/library/return` | Missing `page.tsx` | Dashboard links to non-existent route | Create redirect page: `redirect("/staff/library/circulate")` | `src/app/(staff)/library/return/page.tsx` | open |
| C3 | `/staff/library/catalogue` | Missing `page.tsx` | Naming mismatch — actual page is `/staff/library/inventory` | Create redirect page: `redirect("/staff/library/inventory")` | `src/app/(staff)/library/catalogue/page.tsx` | open |
| C4 | `/staff/library/fines` | Missing `page.tsx` | Dashboard links to non-existent route | Create redirect page: `redirect("/staff/library/cards?hasFine=true")` | `src/app/(staff)/library/fines/page.tsx` | open |
| C5 | `/staff/library/copies` | Missing `page.tsx` | Dashboard links to non-existent route | Create redirect page: `redirect("/staff/library/inventory")` | `src/app/(staff)/library/copies/page.tsx` | open |

### Group C-WEB-B: HOD / Deputy / Academics Hub Links

Sources: `src/components/dashboard/HODDashboard.tsx`, `src/components/dashboard/DeputyDashboard.tsx`, `src/app/staff/academics/page.tsx`

| ID | Expected Route | Page File | Root Cause | Proposed Fix | Files to Create | Status |
|---|---|---|---|---|---|---|
| C6 | `/staff/classes` | Missing `page.tsx` | Dashboard link to non-existent route | Create minimal page or redirect to principal equivalent | `src/app/(staff)/classes/page.tsx` | open |
| C7 | `/staff/subjects` | Missing `page.tsx` | Dashboard link to non-existent route | Create minimal page or redirect | `src/app/(staff)/subjects/page.tsx` | open |
| C8 | `/staff/assessments` | Missing `page.tsx` | Dashboard link to non-existent route | Create minimal page or redirect | `src/app/(staff)/assessments/page.tsx` | open |
| C9 | `/staff/reports` | Missing `page.tsx` | Dashboard link to non-existent route | Create redirect: `redirect("/staff/finance/reports")` | `src/app/(staff)/reports/page.tsx` | open |
| C10 | `/staff/tod` | Missing `page.tsx` | No equivalent Teacher-on-Duty page exists anywhere | Create minimal Teacher-on-Duty stub page | `src/app/(staff)/tod/page.tsx` | open |

### Group C-WEB-C: Boarding Master Dashboard Links

Source: `src/components/dashboard/BoardingMasterDashboard.tsx`

| ID | Expected Route | Page File | Root Cause | Proposed Fix | Files to Create | Status |
|---|---|---|---|---|---|---|
| C11 | `/staff/accommodation` | Missing `page.tsx` | Dashboard links to non-existent staff-portal route | Create redirect to `/principal/accommodation` or create stub | `src/app/(staff)/accommodation/page.tsx` | open |
| C12 | `/staff/accommodation/allocate` | Missing `page.tsx` | Dashboard links to non-existent route | Create stub or redirect to principal equivalent | `src/app/(staff)/accommodation/allocate/page.tsx` | open |
| C13 | `/staff/accommodation/inspections` | Missing `page.tsx` | Dashboard links to non-existent route | Create stub | `src/app/(staff)/accommodation/inspections/page.tsx` | open |

### Group C-WEB-D: Principal Finance Quick Actions (useGlobalSearch)

Source: `src/lib/hooks/useGlobalSearch.ts`

| ID | Expected Route | Page File | Root Cause | Proposed Fix — Option A (preferred) | Proposed Fix — Option B | Status |
|---|---|---|---|---|---|---|
| C14 | `/principal/finance/payments` | Missing `page.tsx` | `ACTIONS_REGISTRY` registers these under `/principal` but actual pages live under `/staff` | Redirect to `/staff/finance/payments` | Restrict `ACTIONS_REGISTRY` roles to `"staff"` only — no new page needed | open |
| C15 | `/principal/finance/debtors` | Missing `page.tsx` | Same as C14 | Redirect to `/staff/finance/debtors` | Same as C14 | open |
| C16 | `/principal/finance/fee-structures` | Missing `page.tsx` | Same as C14 | Redirect to `/staff/finance/fee-structures` | Same as C14 | open |
| C17 | `/principal/finance/reports` | Missing `page.tsx` | Same as C14 | Redirect to `/staff/finance/reports` | Same as C14 | open |
| C18 | `/principal/finance/reconciliation` | Missing `page.tsx` | Same as C14 | Redirect to `/staff/finance/reconciliation` | Same as C14 | open |

### Group C-MOB-A: Missing Mobile Screen

Source: `mobile/app/fines/index.tsx`

| ID | Expected Screen | File | Root Cause | Proposed Fix | Files to Create | Status |
|---|---|---|---|---|---|---|
| C19 | Fines statistics screen | `mobile/app/fines/stats.tsx` — does not exist | Navigation link to non-existent screen | Create a fines statistics screen | `mobile/app/fines/stats.tsx` | open |

---

## Check D — Missing API Routes

> **9 missing routes + 1 URL mismatch.** All affect mobile functionality; D9 also affects web.

| ID | Method & Path | Called By | Effect of Missing Route | Root Cause Category | Fix: File to Create | Fix: Implementation Notes | Status |
|---|---|---|---|---|---|---|---|
| D1 | `GET /api/library/borrows/token/[tokenId]` | `mobile/app/(tabs)/scan.tsx`, `mobile/app/scan-modal.tsx` | QR scan for LOAN tokens is completely broken | Missing route | `src/app/api/library/borrows/token/[tokenId]/route.ts` | Look up `LibraryBorrow` by `tokenId`; return borrow + student + copy details | open |
| D2 | `PATCH /api/library/cards/[studentId]/suspend` | `mobile/app/cards/[studentId].tsx` (Suspend button) | Card suspension broken on mobile | Missing route | `src/app/api/library/cards/[studentId]/suspend/route.ts` | Set `card.status = "SUSPENDED"` for the given studentId | open |
| D3 | `PATCH /api/library/cards/[studentId]/unsuspend` | `mobile/app/cards/[studentId].tsx` (Reactivate button) | Card reactivation broken on mobile | Missing route | `src/app/api/library/cards/[studentId]/unsuspend/route.ts` | Set `card.status = "ACTIVE"` for the given studentId | open |
| D4 | `GET /api/library/fines/overdue` | `mobile/app/(tabs)/fines/index.tsx` (page load) | Entire fines screen cannot load data | Missing route | `src/app/api/library/fines/overdue/route.ts` | Return all overdue borrows with computed fine amounts | open |
| D5 | `POST /api/library/fines/pay` | `mobile/app/(tabs)/fines/index.tsx` ("Mark Paid" button) | Fine payment broken | Missing route | `src/app/api/library/fines/pay/route.ts` | Mark the specified fine record as paid | open |
| D6 | `POST /api/library/fines/resume` | `mobile/app/(tabs)/fines/index.tsx` ("Resume" button) | Fine resumption broken | Missing route | `src/app/api/library/fines/resume/route.ts` | Resume a paused fine | open |
| D7 | `POST /api/library/reservations/[id]/fulfill` | `mobile/app/(tabs)/reservations.tsx` (Fulfill button) | Fulfilling reservations broken on mobile | Missing route | `src/app/api/library/reservations/[id]/fulfill/route.ts` | Mark the reservation as fulfilled | open |
| D8 | `PATCH /api/library/policies/[id]` | Mobile settings screen (Save policy button) | Individual policy updates broken | Missing route | `src/app/api/library/policies/[id]/route.ts` | Update a single library policy by ID | open |
| D9 | `GET /api/library/cards/[studentId]/borrows` | `src/lib/stores/libraryStore.ts` (web) | Borrow history tab on web library card view broken | Missing route | `src/app/api/library/cards/[studentId]/borrows/route.ts` | Return borrow history for the student's library card | open |
| D10 | `/api/library/catalogues/*` (URL mismatch) | `mobile/services/api.ts` — all catalogue operations (list, create, update, detail, bulk import) | **Every catalogue operation from mobile 404s** — approximately 5 call patterns affected | URL mismatch: mobile uses `catalogues` (plural); server uses `catalogue` (singular) | **Option A (preferred):** Update `mobile/services/api.ts` to use `/catalogue` (singular) — ~8 lines changed in 1 file. **Option B:** Add `/api/library/catalogues/*` redirect routes — more files, more maintenance burden | open |

---

## Check E — Error Boundaries

> **Zero error boundaries exist anywhere in the application.** 8 missing on web (2 critical), 1 missing on mobile.

### Web — Global & Root

| ID | File (missing) | Effect | Severity | Fix: Component Type | Fix: Required Exports / Content | Status |
|---|---|---|---|---|---|---|
| E1 | `src/app/global-error.tsx` | Any crash in root providers (ThemeProvider, etc.) produces a **blank white screen** with no user feedback | **Critical** | `"use client"` component | Must render a full `<html>` + `<body>` tree (Next.js requirement for global-error). Include an error message and a reload button. Must export default. | open |
| E2 | `src/app/error.tsx` | Any unhandled server exception in any route segment shows the raw, unbranded Next.js 500 page | **Critical** | `"use client"` component | Receives `{ error, reset }` props. Render user-friendly message + `reset()` button + "Go home" link. Must export default. | open |
| E3 | `src/app/not-found.tsx` | Any `notFound()` call or invalid URL shows the raw Next.js 404 page | High | Standard Next.js page component | Branded 404 page with navigation back to dashboard. Must export default. | open |

### Web — Portal-level

| ID | File (missing) | Portal | Effect | Severity | Fix | Status |
|---|---|---|---|---|---|---|
| E4 | `src/app/(principal)/error.tsx` | Principal | Portal crashes fall through to root `error.tsx` (which is also missing) — blank screen | High | `"use client"` component with `{ error, reset }` props; reset button + "Back to dashboard" link | open |
| E5 | `src/app/(teacher)/error.tsx` | Teacher | Same as E4 | High | Same pattern as E4 | open |
| E6 | `src/app/(staff)/error.tsx` | Staff | Same as E4 | High | Same pattern as E4 | open |
| E7 | `src/app/(parent)/error.tsx` | Parent | Same as E4 | High | Same pattern as E4 | open |
| E8 | `src/app/(super-admin)/error.tsx` | Super Admin | Same as E4 | High | Same pattern as E4 | open |

### Mobile

| ID | File | Effect | Severity | Fix | Status |
|---|---|---|---|---|---|
| E9 | `mobile/app/_layout.tsx` — `ErrorBoundary` export missing | React render crashes in mobile show nothing; Expo Router expects this export for crash recovery | Medium | Add `export const ErrorBoundary` to `mobile/app/_layout.tsx` using Expo Router's `ErrorBoundary` API; display a retry button | open |

---

## Priority Ordering

### Priority 1 — Fix immediately (blocking / data loss / blank screens)

| Order | ID | Reason |
|---|---|---|
| 1 | E1 | Critical: blank white screen on any root provider crash |
| 2 | E2 | Critical: raw Next.js 500 on any unhandled server error |
| 3 | B-1 | High: STUDENT users routed to /parent are blocked by layout — core dispatcher is broken |
| 4 | B-2 | High: BURSAR users bounced from staff portal page after passing the layout gate |
| 5 | B-3 | High: TEACHER and BURSAR users blocked from timetable by redundant role gate |
| 6 | D10 | High: 100% of mobile catalogue operations return 404 (URL mismatch — 1 file fix) |
| 7 | D1 | High: QR scan (core library workflow) is completely broken |
| 8 | D4 | High: Fines screen cannot load data at all |

### Priority 2 — Fix soon (significant feature gaps)

| Order | ID | Reason |
|---|---|---|
| 9 | E3 | High: unbranded 404 on any notFound() call |
| 10 | E4–E8 | High: all portal-level crashes fall through to missing root boundary |
| 11 | B-4 | Medium: BURSAR blocked from staff directory |
| 12 | D2, D3 | Medium: card suspend/reactivate broken on mobile |
| 13 | D5, D6 | Medium: fine payment and resumption broken |
| 14 | D7 | Medium: reservation fulfillment broken on mobile |
| 15 | D8 | Medium: policy updates broken |
| 16 | D9 | Medium: borrow history tab on web broken |

### Priority 3 — Fix when capacity allows (missing stubs / low-impact)

| Order | ID | Reason |
|---|---|---|
| 17 | C1–C5 | Missing library dashboard quick-link routes (redirect stubs — low effort) |
| 18 | C14–C18 | Missing principal finance routes (redirect stubs or ACTIONS_REGISTRY fix) |
| 19 | C6–C10 | Missing HOD/academics routes |
| 20 | C11–C13 | Missing boarding master routes |
| 21 | C19 | Missing mobile fines stats screen |
| 22 | B-5 | Low: wrong permission map for module-teacher users |
| 23 | E9 | Medium: mobile error boundary missing |
| 24 | MW-1–MW-3 | Low: middleware structural issues |
| 25 | B-6 | Low: principal page lacks defence-in-depth guard |

---

*All items initialized to **open**. Update the Status column to **resolved** as fixes are applied.*
