# Phase 4 Dead Code Report — Bidii System

**Date generated:** 2026-09-14  
**Spec:** bidii-audit-cleanup  
**Scans performed:** 13.1 (unused imports / dead exports), 13.2 (dead components / unreachable routes), 13.3 (zero-caller utilities / duplicates), 13.4 (debug statements / commented-out code)

---

## Executive Summary

| Tier | Items | Description |
|---|---|---|
| **Tier 1 — Safe to delete** | 11 | Zero static references, no dynamic-import risk |
| **Tier 2 — Likely unused** | 3 | No static refs but dynamic usage possible or intentionally dead stubs |
| **Tier 3 — Review needed** | 5 | Debug logs on non-error code paths; duplicate helpers |

Total findings: **19**

---

## Tier 1 — Safe to Delete

Zero static references anywhere in `src/` or `mobile/`. No dynamic `import()` pattern observed pointing at any of these.

| ID | File | Symbol / Item | Reason |
|---|---|---|---|
| DC-01 | `src/components/SomaAIActionConfirm.tsx` | Entire file + `SomaAIActionConfirm` default export | Never imported or rendered outside its own file. JSDoc says it belongs in the chat panel but the chat panel (`SomaAIChatPanel.tsx`) has no reference to it. |
| DC-02 | `src/components/ContinueWorking.tsx` | Entire file + `ContinueWorking` default export | Never imported or rendered. File comment says "shown on the home dashboard page" but `UnifiedDashboard.tsx` and no other file imports it. `RecentActivityList` (named export from same file) also has zero consumers. |
| DC-03 | `src/components/LibraryWidget.tsx` | Entire file + `LibraryWidget` default export | Never imported or rendered in any page, layout, or dashboard. The library summary is displayed inline within each portal page that needs it. |
| DC-04 | `src/lib/chartColors.ts` | Entire file — `CHART_SERIES`, `CHART_PALETTE`, `ChartPalette` | No file in `src/` contains `import.*chartColors`. The parallel mobile copy (`mobile/constants/chartColors.ts`) is the live version. Web charts currently hardcode colours inline. |
| DC-05 | `src/lib/scheduleTimes.ts` | `schoolDaySpan` (export, line 76) | Never imported by any file. `computePeriodTimes` (same file) is actively used. Only the one function is dead — do not delete the whole file. |
| DC-06 | `src/lib/derivedRoles.ts` | `hasAnyDerivedRole` (export, line 261) | Never called outside its own file. The other two exports (`computeDerivedRoles`, `computeDerivedRolesByTeacherId`) are actively used. Only this function is dead. |
| DC-07 | `src/hooks/usePermissionCache.ts` | `invalidatePermissionCache` (export, line 240) | Never imported from any external file. Only called internally by `installPermission403Interceptor` within the same file. External callers do not exist. The function itself does not need to be public. |
| DC-08 | `src/app/api/diary/notifications/route.ts` | Entire route file — `GET`, `PATCH` handlers | The URL `/api/diary/notifications` is never fetched from any page, component, hook, or mobile screen. The parent diary notification UI uses `/api/parent/notifications` (a separate route). |
| DC-09 | `src/app/api/diary/student/route.ts` | Entire route file — `GET` handler | The URL `/api/diary/student` has zero callers. No student-facing diary UI exists in the web app. |
| DC-10 | `src/app/api/subject-expectations/route.ts` | Entire route file — `GET`, `PUT` handlers | The URL `/api/subject-expectations` has zero callers. No page or component references `FormSubjectExpectation` via HTTP. The Prisma model is used directly in timetable generation logic. |
| DC-11 | `src/app/api/timetable/v2/optimize/route.ts` | Entire route file — `POST` handler | The URL `/api/timetable/v2/optimize` has zero callers. The timetable builder uses `/api/timetable/v2/versions/[id]/reoptimize` instead. This route also misrepresents its function — it re-validates, not re-optimizes. |

---

## Tier 2 — Likely Unused

No static callers, but dynamic usage cannot be fully excluded, or the dead code is an intentional deprecation marker.

| ID | File | Symbol / Item | Reason | Caveat |
|---|---|---|---|---|
| DC-12 | `src/app/api/timetable/subject-codes/route.ts` | Entire route — `GET`, `POST`, `PUT` handlers | URL `/api/timetable/subject-codes` has zero callers in `src/` or `mobile/`. No admin UI is wired to it. | Could theoretically be called by an external migration script or admin CLI tool not visible in the codebase. |
| DC-13 | `src/app/api/timetable/stream-balance/route.ts` | Entire route — `GET`, `POST` handlers | URL `/api/timetable/stream-balance` has zero HTTP callers. The library (`streamBalancer.ts`) is invoked directly by `preGenerationChecks.ts` server-side, bypassing HTTP entirely. | The route may have been intended as an external trigger; leave unless confirmed dead. |
| DC-14 | `mobile/constants/chartColors.ts` | `CHART_SERIES`, `CHART_PALETTE`, `ChartPalette` | Re-exported through `mobile/constants/index.ts` barrel, but no `mobile/app/**` screen imports or consumes these symbols. Analytics screen hardcodes colours inline. | Barrel re-export means any future screen could consume it without a new import — not dangerous to keep, but currently unused. |

---

## Tier 3 — Review Needed

Debug logs on normal code paths, and duplicate helper functions.

| ID | File | Line(s) | Type | Description | Recommended Action |
|---|---|---|---|---|---|
| DC-15 | `mobile/services/sync.ts` | 324, 335, 340 | Debug `console.log` on success path | Three `console.log` calls inside `sync()`: "Already syncing, skipping", "Push complete:", "Pull complete". Fire on every sync cycle in production. | Gate behind `if (__DEV__)` or remove. |
| DC-16 | `mobile/services/fineEngine.ts` | 100 | Debug `console.warn` on normal path | `console.warn('[FineEngine] Using device time — no server time available')` fires on first launch when offline. Not inside a catch block. | Gate behind `if (__DEV__)` or remove. |
| DC-17 | `src/lib/scheduleTimes.ts` — but pervasive | 10 files | Duplicate `formatDate` function | An identical (or near-identical) private `formatDate` function is copy-pasted into at least 10 files: `AchievementList.tsx`, `DisciplineList.tsx`, `InvoiceList.tsx`, `PaymentHistory.tsx`, five `src/app/staff/finance/` pages, and `absent-today/page.tsx`. | Extract to a shared utility (e.g. `src/lib/utils/dateFormat.ts`) and import. Out of scope for a single file change — flag for a future cleanup pass. |
| DC-18 | `src/components/diary/DiaryEntryCard.tsx` + `src/components/parent/ParentDiaryList.tsx` | Diary components | Duplicate `formatDueDate` + `formatPostedDate` | Both diary components define their own versions of these two time-ago helpers. Logic is similar but not byte-identical (different edge-case handling). | Merge into a single shared file under `src/lib/utils/diaryFormat.ts`. Low risk, two-file change. |
| DC-19 | `mobile/app/(tabs)/my-borrows.tsx` | 1–13 | Unused imports | File body is `return <MyCardScreen />;`. The four imports `ScreenHeader`, `SyncStatusBar`, `Colors` (from `@/constants`), and `View` (from `react-native`) are never referenced. | Remove the four unused import statements. Zero-risk cleanup. |

---

## Additional Finding: Duplicate Import Statements

These are not dead code but are noise likely caused by merge conflicts:

| File | Import | Lines |
|---|---|---|
| `src/app/staff/library/circulate/page.tsx` | `import { useReservationToast } from "@/hooks/useReservationToast"` | Lines 39–39 (appears twice) |
| `src/app/staff/library/scan/page.tsx` | `import { useReservationToast } from "@/hooks/useReservationToast"` | Lines 31–31 (appears twice) |

The hook is actively used in both files; only the duplicate import line needs removing.

---

## Scan Coverage Notes

- **`src/`** — All files under `src/lib/`, `src/hooks/`, `src/components/`, and `src/app/api/` were scanned.
- **`mobile/`** — All files under `mobile/app/`, `mobile/components/`, `mobile/services/`, `mobile/hooks/`, and `mobile/constants/` were scanned.
- **Excluded from scan:** `node_modules/`, `.next/`, `*.test.ts`, `*.spec.ts`, `__tests__/` (debug logs in tests are acceptable).
- **Dynamic imports:** `next/dynamic(...)` was checked; none of the Tier 1 components appear as dynamic import targets.
- **Commented-out code:** None found in either `src/` or `mobile/`. The codebase is clean of commented-out code blocks.

---

## Recommended Deletion Order (Tier 1, if approved)

If all Tier 1 items are approved, apply in this order to minimise churn:

1. **DC-05** `schoolDaySpan` — single function removal, single file, no downstream impact
2. **DC-06** `hasAnyDerivedRole` — single function removal, single file, no downstream impact
3. **DC-07** `invalidatePermissionCache` — make internal (remove `export` keyword); no external callers
4. **DC-19** Unused imports in `my-borrows.tsx` — four import removals, single file
5. **DC-08** Delete `src/app/api/diary/notifications/route.ts` — whole file, no callers
6. **DC-09** Delete `src/app/api/diary/student/route.ts` — whole file, no callers
7. **DC-10** Delete `src/app/api/subject-expectations/route.ts` — whole file, no callers
8. **DC-11** Delete `src/app/api/timetable/v2/optimize/route.ts` — whole file, no callers
9. **DC-01** Delete `src/components/SomaAIActionConfirm.tsx` — whole file, never rendered
10. **DC-02** Delete `src/components/ContinueWorking.tsx` — whole file, never rendered
11. **DC-03** Delete `src/components/LibraryWidget.tsx` — whole file, never rendered
12. **DC-04** Delete `src/lib/chartColors.ts` — whole file, duplicate of mobile copy, no web consumers

Run `npx tsc --noEmit` after each deletion.
