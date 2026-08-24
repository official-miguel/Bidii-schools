# Requirements Document

## Introduction

The Library Borrowing & Reservation System is the circulation backbone of the Bidii School Management System. Core primitives — borrow, return, and reservation CRUD — are already in production, but ten critical gaps prevent the system from functioning correctly end-to-end. This spec covers the full lifecycle: borrowing, returning (including damaged and lost copies), reservation creation and queuing, copy auto-assignment after a return or cancellation, pickup notification, expiry enforcement, a shared data-loading helper, and the dashboard statistics surface. All work lives inside the existing Next.js 14 App Router codebase under `/api/library/` and `/staff/library/`.

---

## Glossary

- **Borrow**: A `LibraryBorrow` row recording that a specific `LibraryCopy` is on loan to a student via their `LibraryCard`.
- **BorrowHelper**: The shared server-side function `loadBorrowWithRelations()` in `src/lib/library/` that loads a `LibraryBorrow` with all required relations (`card`, `card.student`, `copy`, `copy.catalogue`).
- **Card**: A `LibraryCard` row representing a student's borrowing entitlement, holding `fineBalance` and `currentBorrowCount`.
- **Catalogue**: A `LibraryCatalogue` row representing a unique book title. One Catalogue has many Copies.
- **CirculationDesk**: The `/staff/library/circulate` page — a 3-step student → book → confirm flow used by librarians to issue borrows.
- **Copy**: A `LibraryCopy` physical instance of a Catalogue entry, carrying a `status` and `condition`.
- **CopyStatus**: Enum values: `AVAILABLE`, `BORROWED`, `RESERVED`, `UNDER_REPAIR`, `ARCHIVED`. `UNDER_REPAIR` is reused to represent copies that are under inspection following a damaged return.
- **Expiry Cron**: The `POST /api/library/reservations/expire` endpoint that processes expired reservations in bulk.
- **PolicyEngine**: The existing `src/lib/library/policyEngine.ts` class that evaluates borrow eligibility and computes fines.
- **Queue**: The ordered set of PENDING reservations for a Catalogue, sorted by `queuePosition` ascending then `createdAt` ascending.
- **Reservation**: A `LibraryReservation` row expressing a patron's intent to borrow a Catalogue entry; carries `status`, `reservationType`, `queuePosition`, `allocatedCopyId`, and `expiresAt`.
- **ReservationStatus**: Enum values: `PENDING`, `ACTIVE`, `FULFILLED`, `CANCELLED`, `EXPIRED`.
- **ReservationType**: Enum values: `INDIVIDUAL`, `CLASSROOM`, `DEPARTMENT`, `WAITLIST`.
- **ReturnRoute**: `POST /api/library/circulate/return` — the API endpoint that processes all return variants.
- **SSE**: Server-Sent Events channel used for real-time push to the browser (`/api/sse`).
- **Toast**: A non-blocking pop-up notification rendered in the browser UI using the existing shadcn/ui toast component.

---

## Requirements

### Requirement 1 — Shared Borrow Loading Helper

**User Story:** As a backend engineer, I want a single function that loads a borrow record with all required relations, so that every API route accesses `borrow.card.studentId` and `borrow.copy.catalogueId` without runtime errors.

#### Acceptance Criteria

1. THE BorrowHelper SHALL be a named export `loadBorrowWithRelations(borrowId: string, schoolId: string)` located in `src/lib/library/borrowHelper.ts`.
2. WHEN `loadBorrowWithRelations` is called, THE BorrowHelper SHALL query `LibraryBorrow` with `include: { card: { include: { student: true } }, copy: { include: { catalogue: true } } }`.
3. IF no matching `LibraryBorrow` row exists for the given `borrowId` and `schoolId`, THEN THE BorrowHelper SHALL return `null`.
4. THE BorrowHelper SHALL export a TypeScript type `BorrowWithRelations` representing the fully-included return shape.
5. THE ReturnRoute SHALL use `loadBorrowWithRelations` instead of a bare `prisma.libraryBorrow.findFirst` call without includes.
6. WHEN the ReturnRoute receives a `borrowId` for which `loadBorrowWithRelations` returns `null`, THE ReturnRoute SHALL respond with HTTP 404 and `{ error: "Borrow record not found." }`.

---

### Requirement 2 — Return Route Runtime Bug Fix

**User Story:** As a librarian, I want the return endpoint to work without throwing runtime errors, so that I can process any book return successfully.

#### Acceptance Criteria

1. WHEN the ReturnRoute processes a return, THE ReturnRoute SHALL access `borrow.card.studentId` and `borrow.copy.catalogueId` only after loading the borrow via `loadBorrowWithRelations`.
2. THE ReturnRoute SHALL include `copy.catalogue` in the loaded borrow so that `borrow.copy.catalogue.title`, `borrow.copy.catalogue.costPerCopy`, and `borrow.copy.catalogue.bookNumber` are available without additional queries.
3. THE ReturnRoute SHALL include the Catalogue title in the JSON response body under `borrow.copy.catalogue.title`.
4. IF `borrow.copy` is null at runtime, THEN THE ReturnRoute SHALL respond with HTTP 422 and `{ error: "Copy data unavailable for this borrow." }` without proceeding with the transaction.
5. IF `borrow.card` is null at runtime, THEN THE ReturnRoute SHALL respond with HTTP 422 and `{ error: "Card data unavailable for this borrow." }` without proceeding with the transaction.

---

### Requirement 3 — Damaged Copy Inspection Flow

**User Story:** As a librarian, I want returning a damaged book to place the copy under inspection rather than making it immediately available, so that damaged books are not re-issued before assessment.

#### Acceptance Criteria

1. WHEN a return is processed with `returnType: "DAMAGED"`, THE ReturnRoute SHALL set the Copy's `status` to `UNDER_REPAIR` instead of `AVAILABLE`.
2. WHEN a return is processed with `returnType: "DAMAGED"`, THE ReturnRoute SHALL set the Copy's `condition` to `DAMAGED`.
3. WHEN a Copy's post-return status is `UNDER_REPAIR`, THE ReturnRoute SHALL NOT allocate that Copy to the next PENDING reservation.
4. THE ReturnRoute SHALL include `newCopyStatus: "UNDER_REPAIR"` in the response body when `returnType` is `"DAMAGED"`.
5. WHERE a librarian resolves an inspection by manually updating Copy status back to `AVAILABLE`, THE Copy status change SHALL be achievable via the existing copy-update API without additional UI changes in this spec.
6. WHEN a Copy status becomes `AVAILABLE` via any path other than a return (e.g., manual update), THE system SHALL NOT automatically trigger reservation assignment from that path (reservation auto-assignment is handled exclusively by the ReturnRoute and the Cancellation flow).

---

### Requirement 4 — Reservation Auto-Assignment After Return

**User Story:** As a librarian, I want a returned copy to be automatically assigned to the next waiting patron when available, so that the queue advances without manual intervention.

#### Acceptance Criteria

1. WHEN the ReturnRoute completes a return where `newCopyStatus` is `AVAILABLE`, THE ReturnRoute SHALL query the `LibraryReservation` table for the oldest PENDING `INDIVIDUAL` reservation for the same `catalogueId` in the same school, ordered by `queuePosition` ascending then `createdAt` ascending.
2. WHEN a PENDING reservation is found after a return, THE ReturnRoute SHALL update the reservation `status` to `ACTIVE` and set `allocatedCopyId` to the returned Copy's `id` within the same database transaction as the borrow update.
3. WHEN a reservation is activated after a return, THE ReturnRoute SHALL update the Copy's `status` to `RESERVED`.
4. WHEN a reservation is activated after a return, THE ReturnRoute SHALL emit an SSE event of type `libraryReservation.activated` with payload `{ reservationId, studentId, catalogueId, copyId, title }`.
5. WHEN no PENDING reservation exists for the Catalogue after a return, THE ReturnRoute SHALL leave the Copy as `AVAILABLE` and emit no reservation-activation SSE event.
6. WHEN a Copy is returned as `LOST` (`returnType: "LOST"`), THE ReturnRoute SHALL NOT attempt reservation auto-assignment for that Copy.

---

### Requirement 5 — Pickup Notification Toast

**User Story:** As a librarian, I want to see a non-blocking toast notification when a returned copy is auto-assigned to a waiting patron, so that I can inform the patron that their book is ready.

#### Acceptance Criteria

1. WHEN the CirculationDesk or Scan Mode UI receives an SSE event of type `libraryReservation.activated`, THE UI SHALL display a Toast notification within 2 seconds of event receipt.
2. THE Toast SHALL contain the waiting patron's name, the book title, and a link to the Reservations page (`/staff/library/reservations`).
3. THE Toast SHALL NOT block interaction with the page; it SHALL be dismissible by the user.
4. THE Toast SHALL persist for a minimum of 8 seconds before auto-dismissing.
5. WHILE no SSE event of type `libraryReservation.activated` is received during a session, THE UI SHALL display no reservation pickup Toast.

---

### Requirement 6 — Queue Position for All Reservation Types

**User Story:** As a librarian, I want every reservation to have a meaningful queue position, so that queue ordering is deterministic for both INDIVIDUAL and WAITLIST reservation types.

#### Acceptance Criteria

1. WHEN a new `INDIVIDUAL` reservation is created for a Catalogue that has no available copies, THE Reservation API SHALL compute `queuePosition` as `(max existing PENDING/ACTIVE INDIVIDUAL queuePosition for that catalogueId) + 1`.
2. WHEN a new `INDIVIDUAL` reservation is created for a Catalogue that has an available copy, THE Reservation API SHALL set `queuePosition` to `1` and `status` to `ACTIVE`.
3. WHEN a new `WAITLIST` reservation is created, THE Reservation API SHALL compute `queuePosition` as `(max existing PENDING/ACTIVE WAITLIST queuePosition for that catalogueId) + 1`.
4. THE Reservation Queue SHALL be ordered by `queuePosition` ascending, with `createdAt` as the tiebreaker, for all reservation type queries.
5. WHEN a reservation is FULFILLED or CANCELLED, THE Reservation API SHALL NOT renumber the remaining queue positions (gaps in sequence are acceptable).
6. IF a PENDING `INDIVIDUAL` reservation has `queuePosition` as `null`, THEN THE ReturnRoute auto-assignment query SHALL treat it as having the lowest priority (last in queue).

---

### Requirement 7 — Reservation Expiry Enforcement

**User Story:** As a system administrator, I want expired reservations to be automatically cancelled server-side on a schedule, so that allocated copies are released back to the queue without manual intervention.

#### Acceptance Criteria

1. THE Expiry Cron SHALL be accessible at `POST /api/library/reservations/expire`.
2. WHEN the Expiry Cron endpoint is called, THE Expiry Cron SHALL locate all `LibraryReservation` rows where `status` is `PENDING` or `ACTIVE`, `expiresAt` is not null, and `expiresAt` is before the current timestamp, scoped to the caller's `schoolId`.
3. WHEN expired reservations are found, THE Expiry Cron SHALL update each reservation's `status` to `EXPIRED` in a single bulk update.
4. WHEN a reservation with an `allocatedCopyId` is expired, THE Expiry Cron SHALL set the allocated Copy's `status` to `AVAILABLE`.
5. WHEN a Copy is released by expiry and a PENDING reservation exists for the same `catalogueId`, THE Expiry Cron SHALL activate the next PENDING reservation (same ordering logic as Requirement 4, AC 1) and set that Copy's `status` to `RESERVED`.
6. THE Expiry Cron SHALL respond with `{ expired: <count>, reactivated: <count> }` after processing.
7. THE Expiry Cron endpoint SHALL require the same `LIBRARY manage` permission as other write endpoints.
8. IF no expired reservations are found, THEN THE Expiry Cron SHALL respond with `{ expired: 0, reactivated: 0 }` and HTTP 200.

---

### Requirement 8 — Cancellation Triggers Queue Reassignment

**User Story:** As a librarian, I want cancelling a reservation that holds an allocated copy to immediately offer that copy to the next waiting patron, so that cancellations do not stall the queue.

#### Acceptance Criteria

1. WHEN a reservation is cancelled via `PATCH /api/library/reservations/[id]` with `status: "CANCELLED"` and the reservation has an `allocatedCopyId`, THE Reservation API SHALL check for the next PENDING reservation in the Queue for the same `catalogueId` before setting the Copy to `AVAILABLE`.
2. WHEN a next PENDING reservation is found at cancellation time, THE Reservation API SHALL activate that reservation (set `status` to `ACTIVE`, `allocatedCopyId` to the released copy's `id`) and set the Copy's `status` to `RESERVED` — all within a single database transaction.
3. WHEN a next PENDING reservation is found at cancellation time, THE Reservation API SHALL emit an SSE event of type `libraryReservation.activated` with payload `{ reservationId, studentId, catalogueId, copyId, title }`.
4. WHEN no next PENDING reservation exists at cancellation time, THE Reservation API SHALL set the Copy's `status` to `AVAILABLE`.
5. WHEN a reservation is cancelled via `DELETE /api/library/reservations/[id]`, THE same queue reassignment logic described in AC 1–4 SHALL apply.
6. WHEN a reservation has no `allocatedCopyId` at cancellation time (PENDING with no copy yet allocated), THE Reservation API SHALL cancel the reservation without triggering any copy status change.

---

### Requirement 9 — Dashboard Statistics Completeness

**User Story:** As a librarian, I want the dashboard summary API to return reservation-related counts, so that the dashboard accurately reflects the state of the reservation queue.

#### Acceptance Criteria

1. THE `GET /api/library/summary` endpoint SHALL include `reservationsPending` in its response body, representing the count of `LibraryReservation` rows with `status: "PENDING"` for the school.
2. THE `GET /api/library/summary` endpoint SHALL include `reservedCopies` in its response body, representing the count of `LibraryCopy` rows with `status: "RESERVED"` for the school.
3. THE `GET /api/library/summary` endpoint SHALL include `readyForPickup` in its response body, representing the count of `LibraryReservation` rows with `status: "ACTIVE"` for the school.
4. THE `GET /api/library/summary` endpoint SHALL include `copiesUnderRepair` in its response body, representing the count of `LibraryCopy` rows with `status: "UNDER_REPAIR"` for the school.
5. WHEN computing summary statistics, THE Summary API SHALL run the new reservation and copy-status queries concurrently with the existing queries using `Promise.all`.
6. THE ETag and `Cache-Control` header behaviour of the Summary API SHALL remain unchanged after adding the new fields.

---

### Requirement 10 — Return Response Includes Book Title

**User Story:** As a librarian, I want the return confirmation response to include the book title, so that the UI can display confirmation without a follow-up lookup.

#### Acceptance Criteria

1. WHEN the ReturnRoute responds successfully, THE ReturnRoute SHALL include `catalogueTitle` as a top-level field in the JSON response body, sourced from `borrow.copy.catalogue.title`.
2. WHEN the ReturnRoute responds successfully, THE ReturnRoute SHALL include `accessionNumber` as a top-level field in the JSON response body, sourced from `borrow.copy.accessionNumber`.
3. WHEN the ReturnRoute responds successfully, THE ReturnRoute SHALL include `studentName` as a top-level field in the JSON response body, sourced from `borrow.card.student.fullName`.
4. THE CirculationDesk return confirmation screen SHALL display `catalogueTitle` and `studentName` from the return response without making an additional API call.
