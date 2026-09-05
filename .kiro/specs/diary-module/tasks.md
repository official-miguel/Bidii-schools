# Implementation Plan: Diary Module

## Overview

Build the complete Diary Module for Bidii on top of the existing Next.js 14 App Router, Prisma 5, and Supabase Postgres foundation. The implementation adds new Prisma models, a `DIARY` Module enum value, navigation bootstrap, API routes, and React pages/components for teachers, students, and parents. Work is ordered from the schema outward: enums → models → shared library → API routes → server pages → client components.

---

## Tasks

- [ ] 1. Extend Prisma schema and navigation bootstrap
  - [x] 1.1 Add `DIARY` to the `Module` enum and add new diary enums and models to `prisma/schema.prisma`
    - Add `DIARY` to the existing `Module` enum
    - Add `DiaryEntryType` enum (`ASSIGNMENT`, `HOMEWORK`, `REVISION`, `PROJECT`, `ANNOUNCEMENT`)
    - Add `DiaryRecipientStatus` enum (`PENDING`, `COMPLETED`, `OVERDUE`) with a comment that `OVERDUE` is computed at read time and never written to the DB
    - Add `DiaryEntry`, `DiaryTarget`, `DiaryRecipient`, and `DiaryNotification` models exactly as specified in the design, including all relations, indexes, and unique constraints
    - Add back-relation arrays to existing `Teacher`, `Student`, `Subject`, `School`, `SchoolClass`, and `User` models
    - _Requirements: 1.1, 1.2, 11.3, 11.4, 11.5, 11.6_
  - [-] 1.2 Run `prisma generate` and `prisma migrate dev` to apply the schema changes
    - Confirm the migration is additive only (no destructive changes)
    - _Requirements: 1.1, 1.2_
  - [~] 1.3 Register diary navigation in `src/lib/permissions.ts`, `src/components/HubSidebar.tsx`, `src/app/teacher/layout.tsx`, and `src/app/parent/layout.tsx`
    - Add `"diary"` to the `NavHub` type union in `src/lib/permissions.ts`
    - Add a `DIARY` entry to `MODULE_INFO` in `src/lib/permissions.ts`
    - Add diary hub entry (id `"diary"`, label `"Diary"`, Icon `BookOpen`) to `HUB_DEFS` and `HUB_SEG_MAP` in `src/components/HubSidebar.tsx`
    - Add `visibleHubs.add("diary")` to the teacher layout in `src/app/teacher/layout.tsx`
    - Add `"diary"` to `PARENT_HUBS` in `src/app/parent/layout.tsx`
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ] 2. Implement shared diary library (`src/app/api/diary/_lib.ts`)
  - [~] 2.1 Implement `getTeacherDiaryContext` and `resolveStatus` utility functions
    - Create `src/app/api/diary/_lib.ts`
    - Implement `TeacherDiaryContext` interface and `getTeacherDiaryContext(userId, schoolId)` — queries both `ClassSubjectTeacher` and `ClassElectiveGroupTeacher`, builds `authorizedSet` (keys `"${classId}:${subjectId}"`), and collects `subjectIds`
    - Implement `resolveStatus(storedStatus, dueDate)` — returns `"COMPLETED"` if stored, `"OVERDUE"` if past due, otherwise `"PENDING"`
    - _Requirements: 3.3, 3.5, 4.2, 7.2, 10.2_
  - [~] 2.2 Implement `createDiaryNotifications` function in `src/app/api/diary/_lib.ts`
    - Implement `TYPE_LABELS` map and `formatDay` helper
    - Build notification records for student users (`student.userId` is non-null) and for parent users (matched by `student.parentContact`)
    - Omit the `"Due {dueDay}."` segment for `ANNOUNCEMENT` entries and when no due date is set
    - Wrap the entire function in try/catch so failures never throw (fire-and-forget contract)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [ ]* 2.3 Write property test for `resolveStatus` (Property 11)
    - **Property 11: Completion status round-trip** — generate arbitrary `(storedStatus, dueDate)` pairs and assert `resolveStatus` returns `"COMPLETED"` iff `storedStatus === "COMPLETED"`, `"OVERDUE"` iff `storedStatus !== "COMPLETED"` and `dueDate < now`, and `"PENDING"` otherwise
    - **Validates: Requirements 4.6**
  - [ ]* 2.4 Write property test for notification message format (Properties 17 and 18)
    - **Property 17: Notification message format** — given arbitrary entry + student data, assert message matches `"📚 New {SubjectName} {TypeLabel} — {FirstName} has a new {SubjectName} {typeLabelLower}."` plus optional `" Due {dueDay}."` segment
    - **Property 18: ANNOUNCEMENT entries never emit due date in notifications** — assert no message for an ANNOUNCEMENT entry contains the substring `"Due"`, even when a `dueDate` is set
    - **Validates: Requirements 9.3, 9.4**

- [ ] 3. Implement teacher context and diary list API routes
  - [~] 3.1 Create `GET /api/diary/teacher-context` route (`src/app/api/diary/teacher-context/route.ts`)
    - Authenticate with `requireSchoolRole("TEACHER")`
    - Call `getTeacherDiaryContext`; query `Subject` and `SchoolClass` records for the authorized set
    - Return `{ subjects, classIdsBySubject, classes }` for client-side form population
    - _Requirements: 3.3, 3.4, 3.5_
  - [~] 3.2 Create `POST /api/diary` (create entry) and `GET /api/diary` (list entries) routes (`src/app/api/diary/route.ts`)
    - `POST`: authenticate, Zod-validate, call `getTeacherDiaryContext`, validate every classId against `authorizedSet`, load students scoped to targeted `classId`s, validate specific `studentIds` if provided, run Prisma `$transaction` to create `DiaryEntry` + `DiaryTarget[]` + `DiaryRecipient[]`, fire-and-forget `createDiaryNotifications`, return `{ ok: true, id }`
    - `GET`: authenticate, read `type` filter and `cursor` from query params, apply `schoolId` + `teacherId` + `deletedAt` filters, paginate at 20 with cursor, return entries with subject and target class names
    - Never expose raw Prisma errors to the client
    - _Requirements: 2.2, 2.3, 2.6, 3.1–3.15, 10.1, 10.2, 10.5, 10.6, 11.1, 11.2, 12.3_
  - [ ]* 3.3 Write property test for unauthorized class creation guard (Property 4)
    - **Property 4: Unauthorized class creation guard** — generate `classId` values not in teacher's `authorizedSet` and assert `POST /api/diary` returns 403 and creates no records
    - **Validates: Requirements 3.13, 10.2**
  - [ ]* 3.4 Write property test for entry creation atomicity (Property 6)
    - **Property 6: Entry creation atomicity** — simulate DB errors mid-transaction and assert that no partial records exist (all-or-nothing)
    - **Validates: Requirements 3.11**
  - [ ]* 3.5 Write property test for type filter correctness (Property 7)
    - **Property 7: Type filter correctness** — for each `DiaryEntryType` value T, assert every entry returned by `GET /api/diary?type=T` has `entryType === T`
    - **Validates: Requirements 2.3**
  - [ ]* 3.6 Write property test for pagination bound (Property 8)
    - **Property 8: Pagination bound** — generate >20 diary entries and assert each page of `GET /api/diary` returns at most 20 records
    - **Validates: Requirements 2.6, 11.2**

- [ ] 4. Implement entry detail, edit, and delete API routes
  - [~] 4.1 Create `GET`, `PATCH`, and `DELETE` routes for `src/app/api/diary/[id]/route.ts`
    - `GET`: authenticate, find entry with `schoolId` + `teacherId` guard + `deletedAt: null`, return 404 if not found or not owned
    - `PATCH`: authenticate, Zod-validate (`title`, `description`, `dueDate` only), verify ownership via `schoolId` + `teacherId`, update `title`/`description`/`dueDate`/`updatedAt`
    - `DELETE`: authenticate, verify ownership, soft-delete by setting `deletedAt: new Date()`
    - _Requirements: 4.1, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 10.1_
  - [ ]* 4.2 Write property test for authorization ownership guard (Property 13)
    - **Property 13: Authorization ownership guard** — assert PATCH and DELETE requests authenticated as a different teacher or different school are rejected and leave the record unchanged
    - **Validates: Requirements 5.5, 6.3**
  - [ ]* 4.3 Write property test for edit round-trip (Property 12)
    - **Property 12: Edit round-trip** — after PATCH with new `title`/`description`/`dueDate`, assert GET returns exactly those new values; assert `subjectId`, `entryType`, and `teacherId` are unchanged
    - **Validates: Requirements 5.1, 5.2, 5.3_
  - [ ]* 4.4 Write property test for soft-delete exclusion (Property 5)
    - **Property 5: Soft-deleted entries are universally excluded** — after DELETE, assert the entry is absent from list, detail, and recipient queries for all roles
    - **Validates: Requirements 6.1, 6.2, 10.6**

- [ ] 5. Implement recipients API routes
  - [~] 5.1 Create `GET /api/diary/[id]/recipients` route (`src/app/api/diary/[id]/recipients/route.ts`)
    - Authenticate, guard ownership of the entry
    - Support `q` (name search), `status` (post-query filter), and `cursor` query params; paginate at 20
    - Call `resolveStatus` per recipient; apply status filter after resolution
    - Compute completion stats from all recipients (unpaginated aggregate)
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 11.2_
  - [~] 5.2 Create `PATCH /api/diary/[id]/recipients` route (mark complete/pending)
    - Authenticate, guard ownership of the entry
    - Zod-validate `{ studentId, status }` (`"COMPLETED"` | `"PENDING"`)
    - Update `DiaryRecipient.status` and set/clear `completedAt` accordingly
    - Return 404 if the recipient is not found
    - _Requirements: 4.6_
  - [ ]* 5.3 Write property test for student-scoped recipient creation (Property 10)
    - **Property 10: Student-scoped recipient creation** — assert DiaryRecipient records created contain only students from targeted classes and no students from non-targeted classes
    - **Validates: Requirements 3.11, 10.1, 11.1**
  - [ ]* 5.4 Write property test for specific student class membership guard (Property 9)
    - **Property 9: Specific student class membership guard** — submit `studentIds` containing an id from a non-targeted class and assert 400 + no records created
    - **Validates: Requirements 3.14**

- [~] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement student and parent diary API routes
  - [~] 7.1 Create `GET /api/diary/student` route (`src/app/api/diary/student/route.ts`)
    - Authenticate with `requireSchoolRole("STUDENT")`, find student record by `userId`
    - Query `DiaryRecipient` records scoped to `studentId` + `schoolId` with `diaryEntry.deletedAt: null`
    - Call `resolveStatus` per recipient; return enriched list ordered by `createdAt desc`, take 20
    - _Requirements: 7.1, 7.4, 10.3, 10.6_
  - [~] 7.2 Create `GET /api/diary/parent` route (`src/app/api/diary/parent/route.ts`)
    - Authenticate with `requireSchoolRole("PARENT", "STUDENT")`
    - Find linked students via `userId` OR `parentContact` match
    - Accept optional `studentId` query param; verify ownership before scoping query
    - Return `{ students, entries }` with enriched resolved statuses
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 10.4_
  - [ ]* 7.3 Write property test for teacher query isolation (Property 1)
    - **Property 1: Teacher query isolation** — for two teachers in same school, assert neither sees the other's entries; for same teacher in two schools, assert entries are school-scoped
    - **Validates: Requirements 2.2, 10.1, 10.5**
  - [ ]* 7.4 Write property test for student view isolation (Property 2)
    - **Property 2: Student view isolation** — assert `GET /api/diary/student` returns only the authenticated student's DiaryRecipient records, never another student's
    - **Validates: Requirements 7.4, 10.3**
  - [ ]* 7.5 Write property test for parent view isolation (Property 3)
    - **Property 3: Parent view isolation** — assert `GET /api/diary/parent` returns only entries for students linked to the authenticated parent
    - **Validates: Requirements 8.2, 8.6, 10.4**

- [ ] 8. Implement notifications API routes
  - [~] 8.1 Create `GET /api/diary/notifications` and `PATCH /api/diary/notifications` routes (`src/app/api/diary/notifications/route.ts`)
    - `GET`: authenticate (any role), query `DiaryNotification` for `userId` + `schoolId`, return notifications list and `unreadCount`; respect `limit` query param (max 50)
    - `PATCH`: accept optional `ids` array; mark specific notifications or all notifications as read (`isRead: true`)
    - _Requirements: 9.5_
  - [ ]* 8.2 Write property test for notification count invariants (Properties 15 and 16)
    - **Property 15: Notification count invariant — students** — assert that the count of student DiaryNotification records equals the count of recipient students with non-null `userId`
    - **Property 16: Notification count invariant — parents** — assert that the count of parent DiaryNotification records equals the count of distinct parent User rows matched by parentContact
    - **Validates: Requirements 9.1, 9.2**

- [ ] 9. Implement server-side pages
  - [~] 9.1 Create teacher diary home page at `src/app/teacher/diary/page.tsx`
    - Server component; authenticate and redirect if not `TEACHER`
    - Fetch recent entries (filtered by `type`, paginated at 20) and due-soon entries (next 7 days, take 5) in parallel
    - Render page header, "+ New Entry" button (`CreateEntryModal`), "Due Soon" section, and "Recent Entries" list with `DiaryEntryCard`
    - Render `DiaryFilters` for type filtering; render empty state when no entries
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 12.4, 12.5_
  - [~] 9.2 Create teacher entry detail page at `src/app/teacher/diary/[id]/page.tsx`
    - Server component; authenticate, guard ownership, call `notFound()` if not found
    - Fetch entry with subject, targets, and pass to `EntryDetailClient`
    - _Requirements: 4.1, 4.7_
  - [~] 9.3 Create parent/student diary page at `src/app/parent/diary/page.tsx`
    - Server component; branch on `user.role === "STUDENT"` vs `"PARENT"`
    - Student branch: fetch DiaryRecipient records, call `resolveStatus` per entry, pass enriched list to `StudentDiaryView`
    - Parent branch: fetch linked students (by `userId` OR `parentContact`), pass to `ParentDiaryView`
    - _Requirements: 7.1, 7.4, 8.1, 8.2, 10.3, 10.4, 10.6_

- [ ] 10. Implement shared UI components
  - [~] 10.1 Create `src/components/diary/DiaryEntryCard.tsx`
    - Display type badge (colour-coded per type), title, subject name, class name(s), due date (`"Due Mon 12 May"`), and recipient count for teacher view
    - Link card to `/teacher/diary/[id]`
    - Ensure touch targets are ≥ 44×44 CSS pixels
    - _Requirements: 2.1, 4.1, 12.1_
  - [~] 10.2 Create `src/components/diary/DiaryFilters.tsx`
    - Client component; render type filter pills
    - Update URL search params via `router.push` on selection for server-side filtering
    - _Requirements: 2.3_
  - [ ]* 10.3 Write unit tests for `DiaryEntryCard` and `DiaryFilters`
    - Test type badge colours, due date display, empty class list, and filter URL update
    - _Requirements: 2.1, 2.3_

- [ ] 11. Implement `CreateEntryModal` client component
  - [~] 11.1 Create `src/components/diary/CreateEntryModal.tsx`
    - State machine: `idle → open → selectType → fillForm → submitting → success/error`
    - Fetch `/api/diary/teacher-context` on modal open; cache in state
    - Render 5 large-tile type selector buttons; set `entryType` on selection
    - Hide subject selector when `subjects.length === 1` (auto-select); cascade subject → class selector repopulation
    - Show due date field only when `entryType !== "ANNOUNCEMENT"` and `entryType !== ""`
    - Update Post button label in real time: `"Post ${TYPE_LABELS[entryType]}"`
    - Validate title on submit (inline error, no submit); POST to `/api/diary`; close and refresh on success
    - Display server-side error messages without exposing raw Prisma errors
    - Use plain `<textarea>` for instructions (no rich-text library)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.12, 3.15, 12.1, 12.2, 12.3, 12.6_
  - [ ]* 11.2 Write property test for whitespace-only title rejection (Property 19)
    - **Property 19: Whitespace-only title rejection** — generate strings of whitespace characters and assert the form blocks submission and the API returns a validation error with no record created
    - **Validates: Requirements 3.12**
  - [ ]* 11.3 Write property test for human-readable error responses (Property 20)
    - **Property 20: Human-readable error responses** — simulate DB errors and assert response body contains only `error` string with no Prisma codes or stack traces
    - **Validates: Requirements 3.15, 12.3**

- [ ] 12. Implement `EntryDetailClient` component
  - [~] 12.1 Create `src/components/diary/EntryDetailClient.tsx`
    - Client component; display entry metadata (title, subject, class(es), posted date, due date, instructions)
    - Show `"Edited X ago"` badge when `updatedAt` differs from `createdAt` by more than 1 minute
    - Fetch `/api/diary/[id]/recipients` with search (`q`), status filter, and cursor pagination
    - Render completion stats bar (COMPLETED / PENDING / OVERDUE counts with percentages)
    - Render student list with search input, status filter dropdown, and mark-complete toggle per student
    - Paginate student list at 20 per page with a "Load more" or cursor-based control
    - Display skeleton placeholders while loading; empty state when no recipients match filter
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.4, 12.4, 12.5_
  - [~] 12.2 Create `EditEntryModal` (or inline form) within `EntryDetailClient`
    - Pre-populate title, instructions, and due date on open; disable subject/class/type fields
    - PATCH to `/api/diary/[id]` on save; re-fetch entry on success
    - _Requirements: 5.1, 5.2, 5.3, 5.5_
  - [~] 12.3 Add delete action to `EntryDetailClient`
    - Confirmation prompt before DELETE to `/api/diary/[id]`; redirect to `/teacher/diary` on success
    - _Requirements: 6.1, 6.3_

- [ ] 13. Implement `StudentDiaryView` and `ParentDiaryView` components
  - [~] 13.1 Create `src/components/diary/StudentDiaryView.tsx`
    - Client component; accept `entries` prop with resolved statuses
    - Group into four sections: New (PENDING, due > 2 days or no due date), Due Soon (PENDING, due ≤ 2 days), Completed (COMPLETED), Overdue (OVERDUE)
    - Render entry cards with subject name, title, and due date per section
    - Display per-section empty states; display skeleton placeholders during loading
    - _Requirements: 7.2, 7.3, 7.5, 7.6, 12.4, 12.5_
  - [ ]* 13.2 Write property test for student grouping exhaustiveness (Property 14)
    - **Property 14: Student grouping exhaustiveness** — generate arbitrary recipient lists and assert each entry appears in exactly one section and the union of all sections equals the full input set
    - **Validates: Requirements 7.2**
  - [~] 13.3 Create `src/components/diary/ParentDiaryView.tsx`
    - Client component; accept `students` and `parentUserId` props
    - Render child switcher (tabs or dropdown) when `students.length > 1`; show single child header when `students.length === 1`
    - Fetch `/api/diary/parent?studentId=...` for selected child; delegate to a child-scoped entry list rendering (reuse card layout from StudentDiaryView)
    - Show child's name, class name, and count of new entries badge
    - Display empty state when no linked children or no entries
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7, 12.4, 12.5_

- [~] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- `resolveStatus` is the single source of truth for OVERDUE computation — never written to the DB
- Notifications are fire-and-forget; failures are logged but never roll back diary entry creation
- The plain `<textarea>` constraint for instructions is a hard requirement — no rich-text libraries
- All interactive elements must meet 44×44 CSS pixel touch target minimums
- Dark mode is handled via existing `dark:` Tailwind variants throughout the codebase

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1"] },
    { "id": 4, "tasks": ["2.3", "2.4", "3.2"] },
    { "id": 5, "tasks": ["3.3", "3.4", "3.5", "3.6", "4.1", "5.1", "5.2"] },
    { "id": 6, "tasks": ["4.2", "4.3", "4.4", "5.3", "5.4", "7.1", "7.2"] },
    { "id": 7, "tasks": ["7.3", "7.4", "7.5", "8.1"] },
    { "id": 8, "tasks": ["8.2", "9.1", "9.2", "9.3"] },
    { "id": 9, "tasks": ["10.1", "10.2", "11.1"] },
    { "id": 10, "tasks": ["10.3", "11.2", "11.3", "12.1"] },
    { "id": 11, "tasks": ["12.2", "12.3", "13.1"] },
    { "id": 12, "tasks": ["13.2", "13.3"] }
  ]
}
```
