# Implementation Plan: Parent Portal & Notification System

## Overview

Implements an authenticated parent portal on the Bidii school management platform across 11 delivery phases. Builds new Prisma models, a dedicated authentication flow, a child-switched dashboard, seven data-integration pages, a central notification engine, and end-to-end security hardening — all on the existing Next.js 14 App Router / Prisma 5 / PostgreSQL stack.

---

## Tasks

- [x] 1. Phase 1 — Database Schema & Core Libraries

  - [x] 1.1 Add Parent, ParentStudent, and ParentNotification models to prisma/schema.prisma
    - Add `Parent` model with `id`, `userId` (unique FK → User), `name`, `phone`, `schoolId` (FK → School), `createdAt`, `updatedAt`; add `@@unique([schoolId, phone])` and `@@index([schoolId])`
    - Add `ParentStudent` join table with `parentId`, `studentId`, `isPrimary`, `createdAt`; composite PK `[parentId, studentId]`; indexes on `[studentId]` and `[parentId]`
    - Add `ParentNotification` model with all required fields; add `@@index([parentId, isRead, createdAt])` and `@@unique([schoolId, dedupKey])`
    - Add `NotificationPriority` enum: `LOW | NORMAL | HIGH | URGENT`
    - Add back-relations on `User`, `School`, `Student` models
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.2 Add isVisibleToParent fields to DisciplineRecord and Achievement models
    - Add `isVisibleToParent Boolean @default(false)` to `DisciplineRecord` in schema.prisma
    - Add `isVisibleToParent Boolean @default(false)` to `Achievement` in schema.prisma
    - _Requirements: 8.6, 8.7_

  - [x] 1.3 Generate and review Prisma migration
    - Run `prisma migrate dev --name parent_portal` to generate the SQL migration file
    - Review the generated migration SQL for correctness; confirm all new tables and columns are present
    - _Requirements: 1.1–1.6, 8.6, 8.7_

  - [x] 1.4 Write data migration script scripts/migrate-parent-contacts.ts
    - Iterate all active `Student` rows with non-null `parentContact`
    - For each student, upsert a `User` (role=PARENT, mustChangePassword=true, email=`parent_{phone}@bidii.internal`, passwordHash from `hashPassword(admissionNumber)`)
    - Upsert the `Parent` row linked to that user
    - Upsert the `ParentStudent` row linking parent to student with `isPrimary=true`
    - Do not delete `Student.parentContact` / `Student.parentName` columns
    - _Requirements: 1.7_

  - [ ]* 1.5 Write property test for data migration preservation
    - **Property 8: Data migration preserves all existing parentContact links**
    - For any Student row where parentContact is non-null before migration, after running the script, a Parent row with phone = student.parentContact and a ParentStudent row with studentId = student.id should exist
    - **Validates: Requirements 1.7**

  - [x] 1.6 Implement requireParent() guard in src/lib/parentAuth.ts
    - Export `requireParent()` that calls `getCurrentUser()`, checks `role === "PARENT"`, then queries `prisma.parent.findUnique` with students included
    - Export `parentStudentIds(parent)` returning a `Set<string>`
    - Export `ownsStudent(parent, studentId)` returning boolean
    - _Requirements: 12.1_

  - [x] 1.7 Implement notifyParents() engine in src/lib/parentNotifications.ts
    - Accept `{ schoolId, studentId, module, priority, title, body, dedupKey?, metadata? }`
    - Look up all `ParentStudent` rows for `studentId`; bail early if none
    - For each linked parent: if `dedupKey` provided use `upsert` on `@@unique([schoolId, dedupKey])`; otherwise use `create`
    - Wrap entire function in try/catch; log error and return without throwing on failure
    - _Requirements: 9.1, 9.2, 9.4, 9.5, 9.6_

  - [ ]* 1.8 Write property test for notifyParents creates N rows for N parents
    - **Property 6: notifyParents creates a row for every linked parent**
    - For any student linked to N parents (N ≥ 1), a single call to notifyParents without a dedupKey should create exactly N new ParentNotification rows
    - **Validates: Requirements 9.1**

  - [ ]* 1.9 Write property test for notifyParents deduplication idempotency
    - **Property 1: Deduplication is idempotent**
    - For any dedupKey + schoolId, calling notifyParents N times should result in exactly one ParentNotification row per linked parent — never more
    - **Validates: Requirements 9.2, 1.6**

  - [x] 1.10 Checkpoint — run prisma generate and confirm TypeScript compiles
    - Run `prisma generate` and `tsc --noEmit` to confirm schema and new lib files are type-correct
    - Ensure all tests pass, ask the user if questions arise.

---

- [x] 2. Phase 2 — Parent Authentication

  - [x] 2.1 Extend NavHub union type in src/lib/permissions.ts
    - Add `"parent"` to the `NavHub` union type
    - _Requirements: 2.9_

  - [x] 2.2 Update src/middleware.ts to add /parent-login to public paths
    - Add `/parent-login` and `/parent-login/set-password` to the public paths list so they are accessible without a session
    - _Requirements: 2.11_

  - [x] 2.3 Create /parent-login page and server action
    - Create `src/app/parent-login/page.tsx` — form accepting phone and admissionNumber inputs, with a hidden `schoolId` field
    - Create `src/app/parent-login/actions.ts` — `parentLogin` server action implementing the login flow:
      - Look up `Parent` by `{ schoolId_phone: { schoolId, phone } }` with `user` and `students` included
      - If no parent or user inactive, return `{ error: "Invalid credentials" }`
      - Call `verifyPassword(admissionNumber, user.passwordHash)` — return generic error on failure
      - If `mustChangePassword=true`, create session and redirect to `/parent-login/set-password`
      - Otherwise create session + buildOfflineToken, set `bidii_session` cookie (SESSION_TTL_MS / 1000), redirect to `/parent`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 2.4 Write property test for authentication generic error message
    - **Property 2: Authentication never reveals which credential field failed**
    - For any login attempt where either phone or admissionNumber is invalid, the error response body should always equal "Invalid credentials" regardless of which field failed
    - **Validates: Requirements 2.5, 2.6**

  - [x] 2.5 Create set-password page and server action
    - Create `src/app/parent-login/set-password/page.tsx` — form for new password input
    - Create `src/app/parent-login/set-password/actions.ts` — verify session exists and `mustChangePassword=true`; hash new password; update `User.passwordHash` and set `mustChangePassword=false`; redirect to `/parent`
    - _Requirements: 2.3_

  - [x] 2.6 Add route protection for /parent/* in parent layout
    - In `src/app/parent/layout.tsx`, call `getCurrentUser()` and redirect to `/parent-login` if user is null or `role !== "PARENT"`
    - _Requirements: 2.11, 2.12_

  - [x] 2.7 Checkpoint — verify login flow end-to-end with a test parent user
    - Ensure all tests pass, ask the user if questions arise.

---

- [x] 3. Phase 3 — Parent Layout, Navigation & Child Switching

  - [x] 3.1 Create Zustand parent store in src/lib/stores/parentStore.ts
    - Define `ChildSummary` type with `id`, `fullName`, `admissionNumber`, `classId`, `className`
    - Implement `useParentStore` with `activeChildId`, `children`, `hydrated`, `setActiveChild`, `setChildren`, `setHydrated`
    - Persist `activeChildId` to localStorage under key `bidii-parent-active-child`
    - Default `activeChildId` to first child when setting children if current value is invalid
    - _Requirements: 3.3_

  - [x] 3.2 Create /api/parent/me/children route
    - Create `src/app/api/parent/me/children/route.ts`
    - Call `requireParent()`, return 401 if null
    - Query linked students and return `ChildSummary[]`
    - _Requirements: 3.2, 3.4_

  - [x] 3.3 Create ParentHydrator client component
    - Create `src/components/parent/ParentHydrator.tsx`
    - On mount, fetch `/api/parent/me/children`, call `setChildren` and `setHydrated` on the Zustand store
    - _Requirements: 3.3_

  - [x] 3.4 Create ChildSwitcher client component
    - Create `src/components/parent/ChildSwitcher.tsx`
    - Render nothing if `children.length <= 1`
    - Render a button list of children; clicking a child calls `setActiveChild(child.id)`
    - Highlight the active child with teal styling
    - _Requirements: 3.2, 3.3, 3.6_

  - [x] 3.5 Add "parent" hub sidebar links to HubSidebar.tsx
    - Add the `"parent"` case to `HubSidebar.tsx` with nav items: Home, Diary, Academic Results, Attendance, Fees, Behaviour, Achievements, School Calendar, Messages, Notifications (with bell icon)
    - _Requirements: 3.1, 2.10_

  - [x] 3.6 Rewrite src/app/parent/layout.tsx
    - Make it a server component that calls `getCurrentUser()` and redirects to `/parent-login` if not PARENT
    - Query `prisma.parent` with school, students (including student details) included
    - Render `DashboardShell` with `role="parent"`, `visibleHubs={PARENT_HUBS}`
    - Include `ParentHydrator` and `ChildSwitcher` inside the layout
    - Export `PARENT_HUBS` array containing the parent hub definitions
    - _Requirements: 3.1, 3.4, 3.5, 3.7_

  - [x] 3.7 Implement active child display in top nav bar
    - Create `src/components/parent/ActiveChildBar.tsx` showing the active child's name, class, and admission number
    - Wire into `TopAppBar` for PARENT role
    - _Requirements: 3.5_

  - [x] 3.8 Build parent home dashboard page (src/app/parent/page.tsx)
    - Query lightweight summary stats: unread notification count, current fee balance, attendance count (last 30 days), next 3 calendar events
    - Render `StatCard` × 3, `UpcomingCalendarWidget` with `calendarHref="/parent/calendar"`, and `AlertBanner` for ATTENDANCE_ALERT when absences ≥ 5 in last 30 days
    - Export `export const dynamic = "force-dynamic"`
    - _Requirements: 3.7, 3.8_

  - [x] 3.9 Checkpoint — verify parent layout, child switcher, and home page render correctly
    - Ensure all tests pass, ask the user if questions arise.

---

- [ ] 4. Phase 4 — Diary Integration

  - [ ] 4.1 Create /api/parent/diary route
    - Create `src/app/api/parent/diary/route.ts`
    - Call `requireParent()` and `ownsStudent` check; return 401/403 appropriately
    - Query `DiaryEntry` where target classId matches active child's classId, ordered by `dueDate DESC NULLS LAST`
    - Include `subject.name` and `DiaryRecipient.status` for the active child
    - Return entries + badge count (ASSIGNMENT/HOMEWORK entries due within 7 days)
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 4.2 Create /api/parent/diary/[id]/read PATCH endpoint
    - Create `src/app/api/parent/diary/[id]/read/route.ts`
    - Call `requireParent()`, verify the diary entry targets the parent's active child's class
    - Update `DiaryNotification.isRead = true` for `userId = parent.userId` and the given entry
    - _Requirements: 4.4_

  - [ ] 4.3 Create /parent/diary page
    - Create `src/app/parent/diary/page.tsx` as a server component
    - Fetch diary entries via `requireParent()` + Prisma query (reuse query logic from API route)
    - Render `ParentDiaryList` client component with mark-as-read capability using the PATCH endpoint
    - Display badge count on the navigation item
    - Export `export const dynamic = "force-dynamic"`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 4.4 Create ParentDiaryList client component
    - Create `src/components/parent/ParentDiaryList.tsx`
    - Render each entry's `entryType`, `title`, `description`, `dueDate`, `subject.name`, and `DiaryRecipient.status`
    - On entry view, trigger PATCH to mark diary notification read
    - _Requirements: 4.3, 4.4_

---

- [ ] 5. Phase 5 — Academic Results Integration

  - [x] 5.1 Implement computePeriodStats in src/lib/parentUtils.ts
    - Export `computePeriodStats(items: { numericScore: number | null }[])` returning `{ mean, percentage, count } | null`
    - Filter null scores; return null if empty array
    - mean = sum/count rounded to 2 decimal places; percentage = mean rounded to 1 decimal place
    - _Requirements: 5.4_

  - [ ]* 5.2 Write property test for computePeriodStats arithmetic correctness
    - **Property 4: Score computation is arithmetically correct**
    - For any non-empty list of numeric assessment scores, computePeriodStats should return mean = sum(scores)/count(scores) rounded to 2 dp and percentage = mean rounded to 1 dp
    - **Validates: Requirements 5.4**

  - [ ] 5.3 Create /api/parent/results route
    - Create `src/app/api/parent/results/route.ts`
    - Call `requireParent()` + ownership check
    - Query `AssessmentItem` grouped by `AssessmentPeriod`, ordered by academicYear DESC then term DESC, scoped to `studentId = activeChild.id`
    - For each period compute stats using `computePeriodStats`
    - Return empty-state placeholder data when a period has no items
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 5.4 Create /parent/results page and components
    - Create `src/app/parent/results/page.tsx` as a server component with `export const dynamic = "force-dynamic"`
    - Create `src/components/parent/ResultsTable.tsx` — renders subjects, scores, and period stats
    - Create `src/components/parent/ResultsTrendChart.tsx` — Recharts LineChart showing performance across periods
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

---

- [ ] 6. Phase 6 — Attendance Integration

  - [ ] 6.1 Create /api/parent/attendance route
    - Create `src/app/api/parent/attendance/route.ts`
    - Call `requireParent()` + ownership check
    - Query `Attendance` records for active child for current academic term, ordered by date DESC
    - Return records + summary stats (totalPresent, totalAbsent, percentage)
    - Return empty-state response when no records exist
    - _Requirements: 6.1, 6.3, 6.5_

  - [ ] 6.2 Implement attendance alert trigger in src/lib/parentNotifications.ts
    - Add a helper `checkAttendanceAlert(parent, activeChild, attendance)` that computes the 30-day absent ratio
    - If absentDays/totalDays > 0.2, call `notifyParents` with `module="ATTENDANCE"`, `priority="HIGH"`, dedupKey=`attendance-alert-{studentId}-{YYYY-MM}`
    - _Requirements: 6.4_

  - [ ]* 6.3 Write property test for attendance alert threshold
    - **Property 5: Attendance alert fires on ≥ 20% absence rate**
    - For any attendance record set in a 30-day window where absentDays/totalDays > 0.2, a ParentNotification with module="ATTENDANCE" should exist for the linked parent
    - **Validates: Requirements 6.4**

  - [ ] 6.4 Create AttendanceDotGrid and AttendanceSummaryBar components
    - Create `src/components/parent/AttendanceDotGrid.tsx` — pure client component rendering a day-cell grid coloured by status (PRESENT=green, ABSENT=red, no-record=grey)
    - Create `src/components/parent/AttendanceSummaryBar.tsx` — renders totalPresent, totalAbsent, percentage stats
    - _Requirements: 6.2, 6.3_

  - [ ] 6.5 Create /parent/attendance page
    - Create `src/app/parent/attendance/page.tsx` as a server component with `export const dynamic = "force-dynamic"`
    - Fetch attendance data, invoke attendance alert check server-side on render
    - Render `AttendanceDotGrid` and `AttendanceSummaryBar`; show empty-state when no records
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

---

- [ ] 7. Phase 7 — Fees Integration

  - [ ] 7.1 Create /api/parent/fees route
    - Create `src/app/api/parent/fees/route.ts`
    - Call `requireParent()` + `ownsStudent` check (hard block — return 403 if not owned)
    - Query `StudentFinanceAccount.balance`, `Invoice[]` ordered by `issuedAt DESC`, `Payment[]` ordered by `paidAt DESC`
    - _Requirements: 7.1, 7.2, 7.3, 7.6_

  - [ ] 7.2 Wire notifyParents into finance invoice and payment routes
    - In `src/app/api/finance/invoices/route.ts`: after invoice created, call `notifyParents({ module: "FEES", priority: "NORMAL", dedupKey: "invoice-" + invoice.id, ... })`
    - In `src/app/api/finance/payments/route.ts`: after payment posted, call `notifyParents({ module: "FEES", priority: "LOW", dedupKey: "payment-" + payment.id, ... })`
    - Both calls should be awaited outside the primary transaction (fire-and-forget pattern per design)
    - _Requirements: 7.4, 7.5_

  - [ ] 7.3 Create /parent/fees page and components
    - Create `src/app/parent/fees/page.tsx` as a server component with `export const dynamic = "force-dynamic"`
    - Create `src/components/parent/FeesBalanceCard.tsx` — renders current balance prominently
    - Create `src/components/parent/InvoiceList.tsx` — invoice number, amount, due date, payment status
    - Create `src/components/parent/PaymentHistory.tsx` — receipt number, amount, method, date paid
    - _Requirements: 7.1, 7.2, 7.3_

---

- [ ] 8. Phase 8 — Behaviour & Achievements Integration

  - [ ] 8.1 Create /api/parent/behaviour route
    - Create `src/app/api/parent/behaviour/route.ts`
    - Call `requireParent()` + ownership check
    - Query `DisciplineRecord` where `studentId = activeChild.id AND isVisibleToParent = true`, ordered by `dateOfOffence DESC`
    - Never return records where `isVisibleToParent = false`
    - _Requirements: 8.1, 8.2_

  - [ ] 8.2 Create /api/parent/achievements route
    - Create `src/app/api/parent/achievements/route.ts`
    - Call `requireParent()` + ownership check
    - Query `AchievementStudent` where `studentId = activeChild.id` and `achievement.isVisibleToParent = true`
    - _Requirements: 8.3_

  - [ ] 8.3 Wire notifyParents into discipline and achievement creation routes
    - In `src/app/api/discipline/route.ts`: after discipline record created with `isVisibleToParent=true`, call `notifyParents({ module: "BEHAVIOUR", priority: "HIGH", dedupKey: "disc-" + record.id, ... })`
    - In `src/app/api/achievements/route.ts`: after achievement created with `isVisibleToParent=true`, call `notifyParents({ module: "ACHIEVEMENTS", priority: "NORMAL", dedupKey: "ach-" + achievement.id, ... })`
    - _Requirements: 8.4, 8.5_

  - [ ] 8.4 Create /parent/behaviour and /parent/achievements pages and components
    - Create `src/app/parent/behaviour/page.tsx` with `export const dynamic = "force-dynamic"`
    - Create `src/app/parent/achievements/page.tsx` with `export const dynamic = "force-dynamic"`
    - Create `src/components/parent/DisciplineList.tsx` — renders dateOfOffence, type, description for visible records
    - Create `src/components/parent/AchievementList.tsx` — renders achievement title, date, description for visible achievements
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ] 8.5 Checkpoint — verify all Phase 1–8 notification triggers fire correctly
    - Ensure all tests pass, ask the user if questions arise.

---

- [ ] 9. Phase 9 — Notification Centre

  - [ ] 9.1 Create /api/parent/notifications GET route
    - Create `src/app/api/parent/notifications/route.ts`
    - Call `requireParent()`; support `?page=1&module=FEES` query params
    - Return `{ notifications: ParentNotification[], total: number, unreadCount: number }` paginated at 25/page, ordered by `createdAt DESC`
    - Apply module filter when provided
    - _Requirements: 10.1, 10.2, 10.6_

  - [ ]* 9.2 Write property test for notification pagination invariant
    - **Property 7: Notification pagination returns at most 25 rows per page**
    - For any parent with M > 25 notifications, querying page 1 should return exactly 25 rows ordered by createdAt descending
    - **Validates: Requirements 10.1**

  - [ ] 9.3 Create /api/parent/notifications/[id]/read PATCH route
    - Create `src/app/api/parent/notifications/[id]/read/route.ts`
    - Call `requireParent()`; verify `notification.parentId === parent.id`; set `isRead=true`, `readAt=now()`
    - _Requirements: 10.3_

  - [ ] 9.4 Create /api/parent/notifications/read-all POST route
    - Create `src/app/api/parent/notifications/read-all/route.ts`
    - Call `requireParent()`; run `prisma.parentNotification.updateMany({ where: { parentId: parent.id, isRead: false }, data: { isRead: true, readAt: new Date() } })`
    - _Requirements: 10.4_

  - [ ] 9.5 Create ParentNotificationBadge component and wire into TopAppBar
    - Create `src/components/parent/ParentNotificationBadge.tsx` — client component that polls `/api/parent/notifications?page=1` every 60s and shows unread count as a red badge on the bell icon
    - Update `src/components/TopAppBar.tsx` to render `ParentNotificationBadge` when `role === "PARENT"`
    - _Requirements: 10.2_

  - [ ] 9.6 Create /parent/notifications page and components
    - Create `src/app/parent/notifications/page.tsx` with `export const dynamic = "force-dynamic"`
    - Create `src/components/parent/NotificationModuleFilter.tsx` — tab bar for module filtering (DIARY/FEES/ATTENDANCE/BEHAVIOUR/ACHIEVEMENTS/CALENDAR) with colour-coded badges
    - Create `src/components/parent/NotificationList.tsx` — renders notifications grouped by module; handles read/mark-all-read actions; shows URGENT notifications with visual distinction
    - _Requirements: 10.1, 10.5, 10.6_

  - [ ] 9.7 Checkpoint — verify notification centre with real data
    - Ensure all tests pass, ask the user if questions arise.

---

- [ ] 10. Phase 10 — Communication & School Calendar

  - [ ] 10.1 Create /api/parent/calendar route
    - Create `src/app/api/parent/calendar/route.ts`
    - Call `requireParent()`
    - Query `CalendarEvent` where `audience IN ["EVERYONE", "PARENTS_ONLY"]` and `schoolId = parent.schoolId`, ordered by `date ASC`
    - Never return `audience = "STAFF_ONLY"` events
    - _Requirements: 11.1, 11.2_

  - [ ] 10.2 Create /api/parent/messages route
    - Create `src/app/api/parent/messages/route.ts`
    - Call `requireParent()`
    - Query `Message` where `schoolId = parent.schoolId` and recipient groups include PARENTS or EVERYONE audience
    - _Requirements: 11.3_

  - [ ] 10.3 Wire notifyParents into calendar event creation route
    - In `src/app/api/calendar/route.ts`: after event created with `audience = "PARENTS_ONLY"`, query all `Parent` rows for the school
    - For each parent, write a `ParentNotification` directly (adapting the notifyParents call to write per parentId since this is school-wide, not student-scoped) with `module="CALENDAR"`, `priority="NORMAL"`, `dedupKey="cal-{event.id}"`
    - _Requirements: 11.5_

  - [ ] 10.4 Create /parent/calendar and /parent/messages pages and components
    - Create `src/app/parent/calendar/page.tsx` with `export const dynamic = "force-dynamic"` and reuse `UpcomingCalendarWidget` with `calendarHref="/parent/calendar"`
    - Create `src/app/parent/messages/page.tsx` with `export const dynamic = "force-dynamic"`
    - Create `src/components/parent/CalendarEventList.tsx` — renders event title, date, description
    - Create `src/components/parent/MessageList.tsx` — renders message subject, sender, date
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

---

- [ ] 11. Phase 11 — Security Hardening, Polish & Responsiveness

  - [ ] 11.1 Implement rate limiter in src/lib/rateLimit.ts
    - Export `checkRateLimit(userId: string): boolean` using an in-memory Map with 60-request/60-second sliding window per userId
    - _Requirements: 12.6_

  - [ ] 11.2 Apply rate limiting to all /api/parent/* route handlers
    - In each `/api/parent/*` route handler, after `requireParent()` succeeds, call `checkRateLimit(parent.userId)` and return HTTP 429 if blocked
    - _Requirements: 12.6_

  - [ ]* 11.3 Write property test for ownership check returns 403
    - **Property 3: Ownership — unowned studentId always returns 403**
    - For any authenticated parent and any studentId not present in their ParentStudent set, every /api/parent/* route handler that accepts a studentId should return HTTP 403 regardless of whether the student exists
    - **Validates: Requirements 3.4, 12.3, 12.4**

  - [ ] 11.4 Audit all /api/parent/* routes for ownership verification completeness
    - Review all route handlers created in phases 4–10
    - Confirm every handler that accepts a `studentId` param calls `ownsStudent(parent, studentId)` and returns 403 on failure
    - Confirm no route exposes student data (attendance, fees, results, behaviour, diary) without ownership verification
    - _Requirements: 12.2, 12.3, 12.4, 12.5_

  - [ ] 11.5 Confirm export const dynamic = "force-dynamic" on all parent pages
    - Review all pages under `src/app/parent/` and `src/app/parent-login/`
    - Add `export const dynamic = "force-dynamic"` to any page missing it
    - _Requirements: 12.8_

  - [ ] 11.6 Implement session expiry redirect in parent layout and API routes
    - Confirm `ParentLayout` redirects to `/parent-login` when `getCurrentUser()` returns null (session expired)
    - Confirm all `/api/parent/*` routes return HTTP 401 on expired/missing session and the client redirects on 401
    - _Requirements: 12.7_

  - [ ] 11.7 Add empty states to all parent data pages
    - Verify each page (diary, results, attendance, fees, behaviour, achievements, calendar, messages, notifications) renders a user-friendly empty-state message when the relevant data set is empty
    - _Requirements: 5.5, 6.5_

  - [ ] 11.8 Mobile responsiveness pass on all parent portal pages and components
    - Review `ChildSwitcher`, `AttendanceDotGrid`, `NotificationList`, `ResultsTrendChart`, and all parent page layouts for small-viewport correctness
    - Ensure `DashboardShell` with `role="parent"` renders the mobile drawer correctly for parent nav items
    - _Requirements: 3.1, 3.2_

  - [ ] 11.9 Final checkpoint — all tests pass, audit complete
    - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements from requirements.md for traceability
- The data migration script (task 1.4) must be run after `prisma migrate deploy` in the deployment pipeline — it is idempotent (all operations are upserts)
- `notifyParents()` is designed as fire-and-forget: callers should `void notifyParents(...).catch(() => {})` or `await` it outside the primary transaction
- All parent portal pages export `export const dynamic = "force-dynamic"` to prevent stale cached data when switching between children
- The rate limiter uses an in-memory Map; for multi-instance deployments this should be replaced with a Redis-backed implementation
- Property tests should use a property-based testing library (e.g., fast-check) and run at minimum 100 iterations per property

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4", "1.6", "1.7"] },
    { "id": 3, "tasks": ["1.5", "1.8", "1.9", "2.1", "2.2"] },
    { "id": 4, "tasks": ["1.10", "2.3", "2.5", "5.1"] },
    { "id": 5, "tasks": ["2.4", "2.6", "5.2", "3.1", "3.2"] },
    { "id": 6, "tasks": ["2.7", "3.3", "3.4", "3.5", "3.6", "5.3"] },
    { "id": 7, "tasks": ["3.7", "3.8", "5.4", "4.1", "4.2", "6.1", "6.2", "7.1", "8.1", "8.2", "9.1", "10.1", "10.2"] },
    { "id": 8, "tasks": ["3.9", "4.3", "4.4", "6.3", "6.4", "7.2", "8.3", "9.2", "9.3", "9.4", "10.3"] },
    { "id": 9, "tasks": ["6.5", "7.3", "8.4", "9.5", "9.6", "10.4"] },
    { "id": 10, "tasks": ["8.5", "9.7", "11.1"] },
    { "id": 11, "tasks": ["11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8"] },
    { "id": 12, "tasks": ["11.9"] }
  ]
}
```
