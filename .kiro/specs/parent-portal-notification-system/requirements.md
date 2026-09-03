# Requirements Document

## Introduction

The Parent Portal & Notification System extends Bidii, a school management platform, with a dedicated authenticated portal for parents and guardians. Parents log in via a separate `/parent-login` page using their phone number and their child's admission number. A new `Parent` model and `ParentStudent` join table establish formal many-to-many relationships between parents and students, replacing the existing plain-text `parentContact` / `parentName` fields on the `Student` model.

Once authenticated, a parent sees a child-switched dashboard surfacing their children's diary entries, attendance records, academic results, fee balances, behaviour records, achievements, school calendar events, and school-to-parent messages. A central `ParentNotification` table aggregates cross-module notification events into a single inbox with read/unread tracking, deduplication, priority levels, and module categorisation. The feature is implemented across 11 delivery phases and integrates with all existing production models (DiaryEntry, Attendance, DisciplineRecord, Achievement, Payment, CalendarEvent, Message, AssessmentItem) without altering their schemas.

---

## Glossary

- **Parent Portal**: The authenticated web application at `/parent/*` accessible only to users with `role = PARENT`.
- **Parent**: A user account holding `role = PARENT`, linked to one or more students via `ParentStudent`. Corresponds to the new `Parent` model (phone, name, userId).
- **ParentStudent**: The join table recording which parents are linked to which students (many-to-many).
- **Admission Number**: The school-scoped unique identifier assigned to a student at registration (e.g. `"001"`). Used as the initial password on first login.
- **Active Child**: The student whose data is currently visible in the parent dashboard. A parent may switch between their children at any time.
- **ParentNotification**: The new DB model that stores in-app notification events for parents. One row per (parent, event); carries `module`, `priority`, `isRead`, `dedupKey`, and `metadata`.
- **Child Switcher**: The UI control that lets a parent with multiple children select which child's data to view.
- **Notification Engine**: The server-side service that writes `ParentNotification` rows. Every module that produces parent-relevant events calls into this engine.
- **Visibility Control**: A per-record flag (on `DisciplineRecord` and `Achievement`) indicating whether a record should be visible to parents.
- **Bidii System**: The existing Next.js 14 App Router application with Prisma 5 / PostgreSQL backend; reuses existing auth utilities (`hashPassword`, `verifyPassword`, `createSession`, `buildOfflineToken`), UI components (`DashboardShell`, `StatCard`, `AlertBanner`, `UpcomingCalendarWidget`), and styling conventions.
- **NavHub**: The navigation grouping type defined in `src/lib/permissions.ts`; must be extended with a `"parent"` value for the parent-specific sidebar.
- **mustChangePassword**: Existing `User` boolean flag; set to `true` on first-time parent login so the parent is forced to set a personal password before reaching the dashboard.
- **Session**: An opaque token stored as a bcrypt hash in the `Session` table; created via the existing `createSession()` utility.

---

## Requirements

### Requirement 1 — Parent Data Model & DB Migration

**User Story:** As a school administrator, I want parents to have formal database accounts linked to their children so that the system can scope all portal data to verified relationships.

#### Acceptance Criteria

1. THE System SHALL create a `Parent` model with fields: `id` (cuid PK), `userId` (unique FK → `User.id`), `name` (String), `phone` (String), `schoolId` (FK → `School.id`), `createdAt`, `updatedAt`.
2. THE System SHALL create a `ParentStudent` join table with fields: `parentId` (FK → `Parent.id`), `studentId` (FK → `Student.id`), `isPrimary` (Boolean, default false), `createdAt`; with a composite PK of `[parentId, studentId]`.
3. THE System SHALL create a `ParentNotification` model with fields: `id` (cuid PK), `schoolId` (FK → `School.id`), `parentId` (FK → `Parent.id`), `module` (String, e.g. `"DIARY"`, `"FEES"`, `"ATTENDANCE"`), `priority` (`LOW | NORMAL | HIGH | URGENT`), `title` (String), `body` (String), `metadata` (Json, nullable), `dedupKey` (String, nullable), `isRead` (Boolean, default false), `readAt` (DateTime, nullable), `createdAt`.
4. THE System SHALL add a `@@unique([schoolId, phone])` constraint to the `Parent` model so each phone number maps to at most one parent account per school.
5. THE System SHALL add a `@@index([parentId, isRead, createdAt])` index to `ParentNotification` so unread-count queries run without a full table scan.
6. THE System SHALL add a `@@unique([schoolId, dedupKey])` partial index to `ParentNotification` so duplicate notification events (same module + student + trigger) are not inserted twice.
7. WHEN a Prisma migration is applied, THE System SHALL preserve all existing `Student.parentContact` and `Student.parentName` data by running a data migration script that creates `Parent` and `ParentStudent` rows for students whose `parentContact` matches a phone number, without deleting the legacy columns.

---

### Requirement 2 — Parent Authentication (Phase 1)

**User Story:** As a parent, I want to log in to the portal using my phone number and my child's admission number so that I can access my child's school information without needing an email address.

#### Acceptance Criteria

1. THE System SHALL expose a `/parent-login` page that accepts two inputs: phone number and admission number; this page SHALL be independent of the staff `/login` page.
2. WHEN a parent submits valid phone and admission number credentials, THE System SHALL look up the `Parent` row by `(schoolId, phone)` and verify the linked `User` account exists before creating a session.
3. WHEN a parent's `User.mustChangePassword` is `true`, THE System SHALL redirect the parent to a password-change screen at `/parent-login/set-password` before granting dashboard access.
4. WHEN the admission number is used as the initial password and `mustChangePassword` is `false`, THE System SHALL reject the login because the admission number is no longer a valid credential after the first password change.
5. IF the phone number lookup returns no matching `Parent` record, THEN THE System SHALL return a generic "Invalid credentials" message without specifying which field failed.
6. IF the admission number does not match a student linked to the identified parent, THEN THE System SHALL return a generic "Invalid credentials" message.
7. THE System SHALL use the existing `verifyPassword`, `createSession`, and `buildOfflineToken` utilities; THE System SHALL NOT implement a separate session mechanism.
8. WHEN a session is created for a parent, THE System SHALL set the `bidii_session` cookie with the same `SESSION_TTL_MS` (7 days) used by staff sessions.
9. THE System SHALL add a `NavHub` value of `"parent"` to the `NavHub` union type in `src/lib/permissions.ts` so the parent sidebar can declare parent-specific navigation items.
10. THE System SHALL add a `"parent"` hub entry to `PARENT_HUBS` in `src/app/parent/layout.tsx` alongside the existing `dashboard`, `calendar`, `communication`, and `diary` hubs.
11. WHEN a parent visits any `/parent/*` route without a valid session, THE System SHALL redirect to `/parent-login`.
12. WHEN a non-PARENT user attempts to access any `/parent/*` route, THE System SHALL redirect to the appropriate login page.

---

### Requirement 3 — Parent Layout, Navigation, & Child Switching (Phase 2)

**User Story:** As a parent with multiple children at the same school, I want to switch between children seamlessly within the portal so that I can review each child's information without logging out.

#### Acceptance Criteria

1. THE System SHALL extend `DashboardShell` to accept a `"parent"` role value and render a parent-specific sidebar with links scoped to the `"parent"` NavHub.
2. THE System SHALL render a Child Switcher component in the parent layout sidebar whenever the authenticated parent has more than one linked student.
3. WHEN a parent selects a child in the Child Switcher, THE System SHALL update the `activeChildId` state (Zustand store, client-side) and re-render dashboard data for the selected child without a full page navigation.
4. THE System SHALL scope all server-side Prisma queries in the parent portal to `parent.students` (resolved from the authenticated parent's `ParentStudent` rows), never accepting a raw `studentId` from the request body or query string without first verifying it belongs to the authenticated parent.
5. THE System SHALL display the active child's name, class, and admission number in the top navigation bar while the parent is authenticated.
6. WHILE a parent is authenticated with a single child, THE System SHALL suppress the Child Switcher component and display only that child's data.
7. THE System SHALL render the existing `UpcomingCalendarWidget`, `StatCard`, and `AlertBanner` components on the parent home dashboard, reusing their existing prop interfaces.
8. THE System SHALL display an "ATTENDANCE_ALERT" banner via `AlertBanner` when the active child has 5 or more absences in the past 30 days.

---

### Requirement 4 — Diary Integration (Phase 3)

**User Story:** As a parent, I want to see my child's diary entries (assignments, homework, announcements) so that I can support my child's academic work from home.

#### Acceptance Criteria

1. WHEN a parent navigates to `/parent/diary`, THE System SHALL display all `DiaryEntry` records targeting the active child's class, ordered by `dueDate` descending with entries without a due date sorted last.
2. THE System SHALL filter diary entries by joining `DiaryTarget` on `classId = activeChild.classId` and SHALL NOT return entries targeting classes the active child is not enrolled in.
3. THE System SHALL display each diary entry's `entryType`, `title`, `description`, `dueDate`, `subject.name`, and the `DiaryRecipient.status` for the active child.
4. WHEN a parent views a diary entry that has a corresponding unread `DiaryNotification` for the parent's `userId`, THE System SHALL mark that `DiaryNotification` as read by setting `isRead = true`.
5. THE System SHALL display a visual badge on the diary navigation item showing the count of diary entries with `entryType = ASSIGNMENT` or `entryType = HOMEWORK` whose `dueDate` is within the next 7 days.

---

### Requirement 5 — Academic Results Integration (Phase 4)

**User Story:** As a parent, I want to view my child's assessment results and report cards so that I can track academic progress over time.

#### Acceptance Criteria

1. WHEN a parent navigates to `/parent/results`, THE System SHALL display a list of `AssessmentPeriod` records for the active child's school, ordered by `academicYear` descending then `term` descending.
2. THE System SHALL display the active child's `AssessmentItem` records grouped by `AssessmentPeriod`, showing subject name, result kind, and the appropriate result value (`numericScore`, `performanceLevel`, or `competencyStatus`).
3. THE System SHALL scope assessment queries to `studentId = activeChild.id`; THE System SHALL NOT expose assessment data for other students.
4. WHILE the active child's `AssessmentItem` records for a period include `numericScore` values, THE System SHALL compute and display the overall percentage and mean score for that period.
5. IF an `AssessmentPeriod` has no `AssessmentItem` rows for the active child, THEN THE System SHALL display a "No results recorded yet" placeholder for that period.

---

### Requirement 6 — Attendance Integration (Phase 5)

**User Story:** As a parent, I want to see a detailed attendance history for my child so that I am aware of any absences and can contact the school if needed.

#### Acceptance Criteria

1. WHEN a parent navigates to `/parent/attendance`, THE System SHALL display the active child's `Attendance` records for the current academic term, ordered by `date` descending.
2. THE System SHALL render a visual calendar-dot grid showing each recorded attendance day colour-coded by `status` (PRESENT = green, ABSENT = red).
3. THE System SHALL display summary statistics: total present days, total absent days, and attendance percentage for the displayed period.
4. WHEN the attendance percentage drops below 80% for the current 30-day window, THE System SHALL surface an alert notification in the parent's notification centre.
5. IF no `Attendance` records exist for the active child in the selected period, THEN THE System SHALL display an empty-state message indicating no attendance has been recorded.

---

### Requirement 7 — Fees Integration (Phase 6)

**User Story:** As a parent, I want to view my child's fee balance, invoices, and payment history so that I can stay current on financial obligations to the school.

#### Acceptance Criteria

1. WHEN a parent navigates to `/parent/fees`, THE System SHALL display the active child's current ledger balance from `StudentFinanceAccount.balance`.
2. THE System SHALL list the active child's `Invoice` records ordered by `issuedAt` descending, showing invoice number, amount, due date, and payment status.
3. THE System SHALL list the active child's `Payment` records ordered by `paidAt` descending, showing receipt number, amount, method, and date paid.
4. WHEN a new `Invoice` is generated for a student, THE System SHALL write a `ParentNotification` row for every parent linked to that student via `ParentStudent`, with `module = "FEES"` and `priority = "NORMAL"`.
5. WHEN a `Payment` is posted for a student, THE System SHALL write a `ParentNotification` row for every linked parent with `module = "FEES"` and `priority = "LOW"`.
6. THE System SHALL scope all fees queries to `studentId = activeChild.id` and SHALL verify that `activeChild.id` is in the authenticated parent's `ParentStudent` set before executing any finance query.

---

### Requirement 8 — Behaviour & Achievements Integration (Phase 7)

**User Story:** As a parent, I want to see my child's discipline records and achievements so that I am kept informed of both concerns and recognition.

#### Acceptance Criteria

1. WHEN a parent navigates to `/parent/behaviour`, THE System SHALL display the active child's `DisciplineRecord` rows where `isVisibleToParent = true`, ordered by `dateOfOffence` descending.
2. THE System SHALL NOT display `DisciplineRecord` rows where `isVisibleToParent = false` or where the field does not exist and defaults to `false`.
3. WHEN a parent navigates to `/parent/achievements`, THE System SHALL display achievements linked to the active child via `AchievementStudent` where `isVisibleToParent = true` on the `Achievement` record.
4. WHEN a new `DisciplineRecord` is created with `isVisibleToParent = true` for a student, THE System SHALL write a `ParentNotification` row for every linked parent with `module = "BEHAVIOUR"` and `priority = "HIGH"`.
5. WHEN a new `Achievement` is created with `isVisibleToParent = true` for a student, THE System SHALL write a `ParentNotification` row for every linked parent with `module = "ACHIEVEMENTS"` and `priority = "NORMAL"`.
6. THE System SHALL add a boolean `isVisibleToParent` field (default `false`) to the `DisciplineRecord` model via Prisma migration.
7. THE System SHALL add a boolean `isVisibleToParent` field (default `false`) to the `Achievement` model via Prisma migration.

---

### Requirement 9 — Central Notification Engine (Phase 8)

**User Story:** As a school system, I want a single notification service that all modules can call to create parent notifications so that notification logic is not duplicated across modules.

#### Acceptance Criteria

1. THE System SHALL implement a `notifyParents(params)` server-side function in `src/lib/parentNotifications.ts` that accepts `{ schoolId, studentId, module, priority, title, body, dedupKey?, metadata? }` and creates `ParentNotification` rows for all parents linked to that student.
2. WHEN `notifyParents` is called with a `dedupKey`, THE System SHALL perform an upsert using `@@unique([schoolId, dedupKey])` so duplicate events do not create multiple rows.
3. THE System SHALL call `notifyParents` from the diary posting route, fees invoice route, fees payment route, discipline record creation route, and achievement creation route.
4. THE System SHALL NOT call `notifyParents` synchronously in a way that blocks the primary write operation; the notification insert SHALL be fire-and-forget (using `Promise.all` or a separate upsert after the primary transaction completes) but MUST still await before responding to ensure the notification is persisted.
5. WHEN `notifyParents` encounters a database error while inserting a `ParentNotification` row, THE System SHALL log the error to the console and return without throwing, so the caller's primary operation is not rolled back.
6. THE System SHALL support `priority` values `LOW | NORMAL | HIGH | URGENT` on `ParentNotification`; `URGENT` notifications SHALL be visually distinguished in the notification centre.

---

### Requirement 10 — Notification Centre & Preferences (Phase 9)

**User Story:** As a parent, I want a dedicated notification inbox within the portal so that I can review all school-related alerts in one place and manage which types of notifications I receive.

#### Acceptance Criteria

1. WHEN a parent navigates to `/parent/notifications`, THE System SHALL display all `ParentNotification` rows for the authenticated parent, paginated at 25 per page, ordered by `createdAt` descending.
2. THE System SHALL display an unread notification badge count on the bell icon in the parent top navigation bar, showing the count of rows where `isRead = false`.
3. WHEN a parent opens a notification, THE System SHALL update `isRead = true` and `readAt = now()` on that `ParentNotification` row via a `PATCH /api/parent/notifications/[id]/read` endpoint.
4. THE System SHALL provide a "Mark all as read" action that sets `isRead = true` and `readAt = now()` on all unread `ParentNotification` rows for the authenticated parent in a single `updateMany` call.
5. THE System SHALL display notifications grouped by `module` with a colour-coded badge (DIARY = blue, FEES = green, ATTENDANCE = orange, BEHAVIOUR = red, ACHIEVEMENTS = gold).
6. WHEN a parent filters the notification centre by module, THE System SHALL return only `ParentNotification` rows matching the selected `module` value without reloading the page.

---

### Requirement 11 — Communication & School Calendar (Phase 10)

**User Story:** As a parent, I want to read school-to-parent messages and view the school calendar so that I am informed of school announcements and upcoming events.

#### Acceptance Criteria

1. WHEN a parent navigates to `/parent/calendar`, THE System SHALL display `CalendarEvent` records where `audience = "EVERYONE"` or `audience = "PARENTS_ONLY"`, for the active child's `schoolId`, ordered by `date` ascending.
2. THE System SHALL NOT display `CalendarEvent` records where `audience = "STAFF_ONLY"` to any authenticated parent.
3. WHEN a parent navigates to `/parent/messages`, THE System SHALL display `Message` records sent to the parent's school where the recipient list includes the parent's user group or the school-wide broadcast group.
4. THE System SHALL render the existing `UpcomingCalendarWidget` on the parent home dashboard with `calendarHref = "/parent/calendar"`, reusing the existing component without modification.
5. WHEN a `CalendarEvent` with `audience = "PARENTS_ONLY"` is created, THE System SHALL write a `ParentNotification` row for all parents in that school with `module = "CALENDAR"` and `priority = "NORMAL"`.

---

### Requirement 12 — Security Hardening & Data Isolation (Phase 11)

**User Story:** As a school administrator, I want every parent API endpoint to enforce strict data scoping so that a parent can only access information about their own children and cannot access other students' data.

#### Acceptance Criteria

1. THE System SHALL implement a `requireParent()` server-side guard in `src/lib/parentAuth.ts` that returns the authenticated `Parent` record (including linked `studentId` list) or null if the session user is not a parent.
2. WHEN any `/api/parent/*` route receives a request, THE System SHALL call `requireParent()` and reject with HTTP 401 if the result is null.
3. WHEN any `/api/parent/*` route receives a `studentId` parameter, THE System SHALL verify that `studentId` is present in the authenticated parent's `ParentStudent.studentId` set before executing the database query.
4. IF a `studentId` parameter is provided that does not belong to the authenticated parent, THEN THE System SHALL return HTTP 403 without exposing whether the student ID exists in the system.
5. THE System SHALL NOT include any student's data (attendance, fees, results, behaviour, diary) in API responses unless `studentId` is verified to belong to the requesting parent in the same request handler.
6. THE System SHALL add rate limiting of 60 requests per minute per `userId` on all `/api/parent/*` routes to prevent credential-stuffing and scraping.
7. WHEN a parent session expires, THE System SHALL clear the `bidii_session` cookie and redirect to `/parent-login` on the next request to any authenticated `/parent/*` route.
8. THE System SHALL ensure all parent-facing pages use `cache: "no-store"` in server component fetches so stale data from one child is never served when switching to another child.
