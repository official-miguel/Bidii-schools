# Implementation Plan: Library Borrowing & Reservation System

## Overview

Close ten circulation gaps in the Bidii library module. The work is contained entirely within the existing Next.js 14 App Router codebase: one shared server helper is created, six API routes are modified or created, two client pages receive an SSE-powered toast listener, and the SSE event-type union is extended. No Prisma migrations are required.

---

## Tasks

- [x] 1. Create the shared borrow loading helper
  - [x] 1.1 Create `src/lib/library/borrowHelper.ts` with `BorrowWithRelations` type and `loadBorrowWithRelations(borrowId, schoolId)` function
    - Export `BorrowWithRelations` using `Prisma.LibraryBorrowGetPayload` with full `card → student` and `copy → catalogue` includes
    - `loadBorrowWithRelations` calls `prisma.libraryBorrow.findFirst` with `where: { id: borrowId, schoolId }` and the full include tree; returns `null` when no row matches
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ]* 1.2 Write unit tests for `loadBorrowWithRelations`
    - Test returns `null` for an unknown `borrowId` (Req 1.3)
    - Test returns the full shape including nested relations for a known `borrowId` (Req 1.2)
    - _Requirements: 1.2, 1.3_

- [x] 2. Extend SSE event-type union
  - [x] 2.1 Modify `src/lib/sse.ts` — add `"libraryReservation.activated"` to the `SSEEventType` union
    - Append `| "libraryReservation.activated"` to the existing union so `emitSSE` accepts the new type without TypeScript errors
    - _Requirements: 4.4, 5.1, 8.3_

- [x] 3. Fix the Return Route — guards, damaged flow, and response fields
  - [x] 3.1 Replace the bare `prisma.libraryBorrow.findFirst` call in `src/app/api/library/circulate/return/route.ts` with `loadBorrowWithRelations`
    - Import `loadBorrowWithRelations` and `BorrowWithRelations` from `@/lib/library/borrowHelper`
    - Return HTTP 404 `{ error: "Borrow record not found." }` when the helper returns `null` (Req 1.6)
    - Return HTTP 422 `{ error: "Copy data unavailable for this borrow." }` when `borrow.copy` is null (Req 2.4)
    - Return HTTP 422 `{ error: "Card data unavailable for this borrow." }` when `borrow.card` is null (Req 2.5)
    - _Requirements: 1.5, 1.6, 2.1, 2.2, 2.4, 2.5_
  - [x] 3.2 Add the `UNDER_REPAIR` branch for damaged returns inside the transaction in the Return Route
    - When `returnType === "DAMAGED"`, set copy `status` to `UNDER_REPAIR` and `condition` to `DAMAGED` instead of `AVAILABLE` (Req 3.1, 3.2)
    - Include `newCopyStatus: "UNDER_REPAIR"` in the response body (Req 3.4)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 3.3 Add reservation auto-assignment inside the Return Route transaction (for `AVAILABLE` copies only)
    - After updating the copy to `AVAILABLE`, query the next oldest `PENDING INDIVIDUAL` reservation for the same `catalogueId` using `orderBy: [{ queuePosition: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }]` and including `student: { select: { fullName: true } }` (Req 4.1)
    - If found within the transaction: update reservation `status → ACTIVE`, set `allocatedCopyId`, update copy `status → RESERVED` (Req 4.2, 4.3)
    - After the transaction: emit `emitSSE(schoolId, "libraryReservation.activated", { reservationId, studentId, catalogueId, copyId, title, studentName })` (Req 4.4)
    - When no `PENDING` reservation exists, leave copy `AVAILABLE` and emit no SSE event (Req 4.5)
    - Do not attempt auto-assignment when `returnType === "LOST"` (Req 4.6)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [x] 3.4 Extend the Return Route JSON response with `catalogueTitle`, `accessionNumber`, and `studentName`
    - Add `catalogueTitle: borrow.copy.catalogue.title`, `accessionNumber: borrow.copy.accessionNumber`, and `studentName: borrow.card.student.fullName` as top-level fields in the `NextResponse.json({...})` call (Req 10.1, 10.2, 10.3)
    - _Requirements: 2.3, 10.1, 10.2, 10.3_
  - [ ]* 3.5 Write property tests for the Return Route
    - **Property 1: Damaged Return Sets Copy to UNDER_REPAIR, No Queue Activation** — for `returnType = "DAMAGED"`, assert copy status becomes `UNDER_REPAIR` and zero reservations change to `ACTIVE` (Req 3.1, 3.2, 3.3)
    - **Property 2: LOST Return Does Not Trigger Queue Assignment** — for `returnType = "LOST"`, assert no reservation `status` changes regardless of how many `PENDING` reservations exist (Req 4.6)
    - _Requirements: 3.1, 3.2, 3.3, 4.6_

- [x] 4. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 5. Fix INDIVIDUAL queue-position assignment in the Reservations POST route
  - [x] 5.1 Modify the POST handler in `src/app/api/library/reservations/route.ts` to compute `queuePosition` for `INDIVIDUAL` reservations
    - Run `prisma.libraryReservation.aggregate({ _max: { queuePosition: true } })` scoped to `catalogueId`, `schoolId`, `status IN ["PENDING","ACTIVE"]`, and `reservationType = "INDIVIDUAL"` before creating the row (Req 6.1)
    - Set `queuePosition = (maxPos._max.queuePosition ?? 0) + 1`
    - When a copy is immediately available and `initialStatus = "ACTIVE"`, still set `queuePosition = 1` (Req 6.2)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 5.2 Write property test for queue position monotonicity (Property 5)
    - **Property 5: Queue Position Is Monotonically Non-Decreasing** — create a sequence of `INDIVIDUAL` reservations for the same catalogue; assert each new reservation's `queuePosition` is strictly greater than every existing `PENDING`/`ACTIVE` reservation's `queuePosition` at the time of creation
    - **Validates: Requirements 6.1, 6.3**

- [x] 6. Fix cancellation queue-reassignment in the Reservations [id] route
  - [x] 6.1 Refactor the `PATCH` handler in `src/app/api/library/reservations/[id]/route.ts` to use `tryAutoAssign` on cancellation
    - Extract the auto-assign logic into a local or module-level `tryAutoAssign(catalogueId, copyId, schoolId, tx)` function following the algorithm in the design (Module 4)
    - When `d.status === "CANCELLED"` and `r.allocatedCopyId` is set: open a `prisma.$transaction`, cancel the reservation, call `tryAutoAssign`; if not activated, set copy to `AVAILABLE`; if activated, capture the activated reservation for SSE (Req 8.1, 8.2)
    - After the transaction, emit `emitSSE(schoolId, "libraryReservation.activated", {...})` if a reservation was activated (Req 8.3)
    - When no copy is allocated at cancellation, cancel the reservation without touching any copy (Req 8.6)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_
  - [x] 6.2 Apply the same cancellation queue-reassignment logic to the `DELETE` handler in the same file
    - When `r.allocatedCopyId` is set: run `tryAutoAssign` inside a transaction; if not activated, set copy `AVAILABLE`; emit SSE after transaction if activated (Req 8.5)
    - When `r.allocatedCopyId` is null: cancel the reservation without any copy change (Req 8.6)
    - _Requirements: 8.4, 8.5, 8.6_
  - [ ]* 6.3 Write property tests for cancellation behaviour
    - **Property 4 (partial): Atomic copy/reservation status** — cancel an `ACTIVE` reservation with an allocated copy and a waiting `PENDING` patron; assert after commit: the activated reservation has `status = "ACTIVE"` and `allocatedCopyId = X`, and copy X has `status = "RESERVED"` (Req 4.3, 8.2)
    - **Property 6: Cancellation Does Not Change Uninvolved Queue Positions** — after any cancellation, assert all other reservations for the same catalogue retain their original `queuePosition` values (Req 6.5, 8.5)
    - **Property 9: No-Copy Cancellation Does Not Alter Any Copy** — cancel a `PENDING` reservation with `allocatedCopyId = null`; assert zero `LibraryCopy` rows are updated (Req 8.6)
    - _Requirements: 6.5, 8.2, 8.5, 8.6_

- [x] 7. Create the Reservation Expiry Cron endpoint
  - [x] 7.1 Create `src/app/api/library/reservations/expire/route.ts` — `POST` handler
    - Apply the same auth guard as other write routes (`requireSchoolRole("PRINCIPAL") ?? requireSchoolPermission("LIBRARY", "manage")`) — return 401 if unauthenticated (Req 7.7)
    - Query all `PENDING`/`ACTIVE` reservations where `expiresAt IS NOT NULL` and `expiresAt < now()` scoped to `schoolId` (Req 7.2)
    - If none found, return `{ expired: 0, reactivated: 0 }` with HTTP 200 (Req 7.8)
    - Bulk-update all expired reservation IDs to `status = "EXPIRED"` via `updateMany` (Req 7.3)
    - For each unique `(catalogueId, copyId)` in the expired-with-copy set: run `tryAutoAssign` in a per-copy transaction; if not activated, set copy `AVAILABLE`; if activated, increment `reactivated` counter and emit SSE post-transaction (Req 7.4, 7.5)
    - Return `{ expired: <count>, reactivated: <count> }` (Req 7.6)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  - [ ]* 7.2 Write property tests for expiry cron correctness
    - **Property 7: Expiry Batch Selects Only Expired Records** — mix rows with `expiresAt < now`, `expiresAt > now`, and `expiresAt = null`; call the endpoint and assert only rows with `expiresAt < now` AND `status IN (PENDING, ACTIVE)` are set to `EXPIRED` while all others remain unchanged (Req 7.2, 7.3)
    - **Property 3 (partial): Auto-Assignment Selects Correct Next Patron** — set up multiple `PENDING INDIVIDUAL` reservations with distinct `queuePosition` values; trigger expiry and assert the reservation with the smallest non-null `queuePosition` is activated (Req 4.1, 6.4, 7.5)
    - _Requirements: 7.2, 7.3, 7.5_

- [x] 8. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Add new counts to the Library Summary API
  - [~] 9.1 Modify `src/app/api/library/summary/route.ts` to add four new concurrent count queries
    - Add to the existing `Promise.all` array: `prisma.libraryReservation.count({ where: { schoolId, status: "PENDING" } })`, `prisma.libraryReservation.count({ where: { schoolId, status: "ACTIVE" } })`, `prisma.libraryCopy.count({ where: { schoolId, status: "RESERVED" } })`, and `prisma.libraryCopy.count({ where: { schoolId, status: "UNDER_REPAIR" } })` (Req 9.5)
    - Destructure the four new values from `Promise.all` and add `reservationsPending`, `readyForPickup`, `reservedCopies`, `copiesUnderRepair` as top-level fields in the response body (Req 9.1, 9.2, 9.3, 9.4)
    - Leave ETag and `Cache-Control` logic completely unchanged (Req 9.6)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [ ] 10. Create the SSE library stream endpoint
  - [~] 10.1 Create `src/app/api/library/sse/library/route.ts` — `GET` handler as a server-sent events stream
    - Export `export const dynamic = "force-dynamic"` and `export const runtime = "nodejs"` at module level
    - Apply auth guard (`requireSchoolRole("PRINCIPAL") ?? requireSchoolPermission("LIBRARY", "view")`); return 401 if unauthenticated
    - Construct a `ReadableStream` whose `start(controller)` subscribes to `sseBus.on(schoolId, handler)` and writes `data: ${JSON.stringify(event)}\n\n` encoded UTF-8
    - Set up a 30-second `setInterval` keep-alive that writes `: keep-alive\n\n`
    - Listen for `req.signal` `"abort"` to call `sseBus.off`, clear the interval, and close the controller
    - Return a `Response` with headers `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`
    - _Requirements: 5.1, 5.3, 5.4, 5.5_

- [ ] 11. Create the `useReservationToast` client hook and wire it into pages
  - [~] 11.1 Create `src/hooks/useReservationToast.ts` — client-side SSE listener hook
    - Mark the file with `"use client"` at the top
    - In `useEffect`, open `new EventSource("/api/library/sse/library")`
    - In `es.onmessage`, parse the event; if `event.type === "libraryReservation.activated"`, call `toast({ title: "Book Ready for Pickup", description: \`"${p.title}" is now reserved for ${p.studentName ?? "a waiting patron"}.\`, duration: 8_000, action: { altText: "View reservations", onClick: () => { window.location.href = "/staff/library/reservations"; } } })` (Req 5.1, 5.2, 5.3, 5.4)
    - Return cleanup that calls `es.close()`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [~] 11.2 Add `useReservationToast()` call to `src/app/staff/library/circulate/page.tsx`
    - Import the hook and invoke it at the top of the component function body (Req 5.1)
    - _Requirements: 5.1_
  - [~] 11.3 Add `useReservationToast()` call to `src/app/staff/library/scan/page.tsx`
    - Import the hook and invoke it at the top of the component function body (Req 5.1)
    - _Requirements: 5.1_
  - [ ]* 11.4 Write property test for toast rendering completeness (Property 8)
    - **Property 8: Toast Render Completeness** — simulate receiving a `libraryReservation.activated` event with arbitrary `{ title, studentName }` payloads; assert the rendered toast contains both values as visible text and the action links to `/staff/library/reservations`
    - **Validates: Requirements 5.1, 5.2**

- [~] 12. Final checkpoint — Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- No Prisma migrations are needed — all changes are at the application layer
- `tryAutoAssign` is extracted as a shared function used by the Return Route, Reservations [id] PATCH/DELETE, and the Expiry Cron — implement it once and import it in all three callers
- The `nulls: "last"` modifier in `orderBy` requires Prisma 4.1+; check the project's Prisma version and fall back to a raw `COALESCE` expression if needed
- `emitSSE` is always called outside the database transaction (fire-and-forget safe)
- The SSE stream endpoint must use `runtime = "nodejs"` — the Edge runtime does not support Node.js `EventEmitter`
- The `useReservationToast` hook must be used only in `"use client"` components

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "5.1"] },
    { "id": 3, "tasks": ["3.4", "3.5", "5.2", "6.1"] },
    { "id": 4, "tasks": ["6.2", "7.1", "9.1"] },
    { "id": 5, "tasks": ["6.3", "7.2", "10.1"] },
    { "id": 6, "tasks": ["11.1"] },
    { "id": 7, "tasks": ["11.2", "11.3"] },
    { "id": 8, "tasks": ["11.4"] }
  ]
}
```
