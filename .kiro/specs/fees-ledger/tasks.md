# Implementation Plan: Fees & Ledger Module

## Overview

Build the complete Fees & Ledger module for Bidii on top of the existing Next.js 14 App Router, Prisma 5, and Supabase Postgres foundation. The implementation follows an immutable, append-only ledger pattern with a materialised per-student balance cache. Work is ordered from the schema outward: enums → models → shared library → API routes → UI pages → integrations.

---

## Tasks

- [x] 1. Extend Prisma schema — RBAC enums and finance models
  - [x] 1.1 Add `BURSAR` to the `Role` enum (after `ADMIN_STAFF`) and `FEES` to the `Module` enum in `prisma/schema.prisma`
    - Also add `MPESA_DARAJA` to `IntegrationProvider` enum
    - Add doc comment to `FEES` explaining its scope
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Add all new finance enums to `prisma/schema.prisma`
    - `LedgerEntryType`, `PaymentMethod`, `ReconciliationStatus`, `MpesaQueueStatus`, `NotificationType`, `FinanceImportType`, `FinanceImportStatus`
    - _Requirements: 2.8, 2.10, 2.11, 2.13, 2.14_
  - [x] 1.3 Add all 14 new finance models to `prisma/schema.prisma` in dependency order
    - `FinanceSettings`, `FeeStructure`, `ExpenseCategory`, `ExpenseItem`, `Term`, `StudentFinanceAccount`, `LedgerEntry`, `Invoice`, `Payment`, `StudentExpenseAttachment`, `MpesaReconciliationQueue`, `DebtorFlag`, `FinanceNotification`, `FinanceImportJob`
    - Include all indexes and unique constraints as specified in the design
    - _Requirements: 2.1–2.14_
  - [x] 1.4 Add back-relation arrays to existing `School` and `Student` models for every new finance model
    - Follow existing Prisma relation patterns in the codebase
    - _Requirements: 2.15, 2.16_
  - [x] 1.5 Run `prisma generate` and `prisma migrate dev` to apply the schema changes
    - Confirm the migration is non-destructive (additive only)
    - _Requirements: 2.1–2.16_

- [x] 2. Extend auth guards to recognise the BURSAR role
  - [x] 2.1 Update `requireSchoolRole` in `src/lib/apiAuth.ts` (or equivalent auth utility) to accept `BURSAR` wherever `ADMIN_STAFF` is accepted
    - Do not alter any existing call sites
    - _Requirements: 1.3, 1.4_
  - [x] 2.2 Update `requireModuleAccess` (or equivalent) to short-circuit and grant full `FEES` access when `user.role === "BURSAR"`, mirroring the existing `PRINCIPAL` short-circuit
    - _Requirements: 1.3, 20.1_
  - [ ]* 2.3 Write property test for BURSAR auth equivalence (Property 1)
    - **Property 1: BURSAR role is auth-equivalent to ADMIN_STAFF**
    - Generate all finance API route stubs and assert that `role=BURSAR` produces the same access outcome as `role=ADMIN_STAFF` for each protected route
    - **Validates: Requirements 1.3, 1.4**

- [x] 3. Implement the shared finance library — core ledger primitives
  - [x] 3.1 Create `src/lib/finance/ledger.ts` — `postLedgerEntry` function
    - Implement `LedgerPayload` interface and `postLedgerEntry(tx, payload)` as specified in the design
    - Include `SET LOCAL` RLS variable, immutable `LedgerEntry` insert, balance delta computation, `StudentFinanceAccount` atomic update, and `recomputeDebtorFlag` call
    - Export `balanceDelta(entryType, amount): Decimal` as a pure function
    - _Requirements: 2.17, 3.1, 3.2, 9.1_
  - [ ]* 3.2 Write property test for the ledger balance invariant (Property 2)
    - **Property 2: Ledger balance invariant**
    - Generate arbitrary sequences of `postLedgerEntry` calls (mix of INVOICE, PAYMENT, CREDIT_ADJUSTMENT, DEBIT_ADJUSTMENT) and assert that `StudentFinanceAccount.currentBalance` equals `computeBalance()` after every call
    - **Validates: Requirements 2.17, 9.1**
  - [x] 3.3 Create `src/lib/finance/balance.ts` — `computeBalance` fallback function
    - Query all non-voided `LedgerEntry` rows for a student and reduce with `balanceDelta`
    - _Requirements: 2.17_
  - [x] 3.4 Create `src/lib/finance/proration.ts` — `computeProratedAmount` function
    - Implement `daysBetween`, guard for `today >= endDate` (return 0), round to 2 decimal places
    - _Requirements: 6.4, 7.6_
  - [ ]* 3.5 Write property test for proration formula correctness (Property 5)
    - **Property 5: Proration formula correctness**
    - Generate arbitrary `(startDate, endDate, price, today)` tuples within valid ranges and assert the formula result; assert 0 when `today >= endDate`
    - **Validates: Requirements 6.4, 7.6**
  - [x] 3.6 Create `src/lib/finance/debtor.ts` — `recomputeDebtorFlag` and `runDailyDebtorJob`
    - Implement flag creation, unflag logic, and the daily job that refreshes `daysOverdueAtFlag`
    - _Requirements: 12.1–12.4_
  - [ ]* 3.7 Write property test for debtor flag lifecycle consistency (Property 10)
    - **Property 10: Debtor flag lifecycle consistency**
    - Generate arbitrary balances and thresholds; assert that after `recomputeDebtorFlag`, exactly one `isCurrent=true` flag exists when balance < −threshold and zero exist when balance ≥ −threshold
    - **Validates: Requirements 12.1, 12.2, 12.3**

- [x] 4. Checkpoint — Verify shared library compiles and passes unit tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement the shared finance library — M-Pesa, receipts, and invoicing
  - [x] 5.1 Create `src/lib/finance/mpesa.ts` — `verifyHmac` and `matchAdmissionNumber`
    - Implement HMAC-SHA256 verification with `timingSafeEqual`
    - Implement exact-match-first then Levenshtein fuzzy matching with normalised confidence score
    - _Requirements: 10.1, 10.2, 10.5_
  - [ ]* 5.2 Write property test for HMAC gating (Property 8)
    - **Property 8: HMAC gating — valid signatures pass, invalid signatures are rejected**
    - Generate arbitrary (secret, body) pairs; assert `verifyHmac` returns true for the correctly computed signature and false for any other string
    - **Validates: Requirements 10.1, 10.2**
  - [x] 5.3 Create `src/lib/finance/receipts.ts` — `nextReceiptNumber`
    - Implement advisory lock via `pg_advisory_xact_lock(hashtext(schoolId))`, sequential numbering with zero-padded suffix
    - _Requirements: 9.2_
  - [ ]* 5.4 Write property test for receipt number uniqueness (Property 7)
    - **Property 7: Receipt numbers are unique and sequential within a school**
    - Simulate concurrent payment posts and assert all generated receipt numbers are unique within the school and the numeric suffix is strictly increasing for sequential posts
    - **Validates: Requirements 9.2**
  - [x] 5.5 Create `src/lib/finance/invoicing.ts` — `runBatchInvoicing`
    - Implement per-student idempotency check, fee structure specificity selection, expense attachment summation, `Invoice` row creation, `postLedgerEntry` call, and `FinanceNotification` creation, all within per-student transactions
    - Record errors in the job report and continue on missing fee structure
    - _Requirements: 7.2–7.7_
  - [ ]* 5.6 Write property test for batch invoicing idempotency (Property 6)
    - **Property 6: Batch invoicing idempotency**
    - Run `runBatchInvoicing` twice for the same term; assert no additional `Invoice` or `LedgerEntry` rows exist and `currentBalance` is unchanged after the second run
    - **Validates: Requirements 7.4**
  - [ ]* 5.7 Write property test for fee structure specificity (Property 4)
    - **Property 4: Fee structure specificity — most-specific match wins**
    - Generate arbitrary sets of `FeeStructure` rows and student `(form, stream, boardingStatus)` tuples; assert the selected structure is always the most-specific match
    - **Validates: Requirements 5.5, 7.3**

- [x] 6. Implement CSV/Excel import library
  - [x] 6.1 Create `src/lib/finance/imports/columnMapper.ts` — header normalisation
    - Lowercase, collapse whitespace, and map flexible column names (e.g. `"Admission No."`, `"admissionNumber"`, `"Adm #"`) to canonical field names
    - _Requirements: 14.1–14.6_
  - [x] 6.2 Create `src/lib/finance/imports/processor.ts` — `processImportJob`
    - Handle both CSV (Node `readline`) and XLSX (`xlsx` package) ingestion
    - Process in batches of 50 within a single transaction
    - Record validation failures (row number, values, error reason) in `errorReport` without aborting remaining rows
    - Set final `FinanceImportJob.status` to `COMPLETED` or `FAILED` and update counts
    - _Requirements: 14.2–14.5_
  - [ ]* 6.3 Write property test for import job error isolation (Property 12)
    - **Property 12: Import job processes valid rows independently of invalid rows**
    - Generate import files with arbitrary mixes of valid and invalid rows; assert valid rows produce `LedgerEntry` rows, invalid rows are recorded in `errorReport`, and `status = COMPLETED` when any row succeeded
    - **Validates: Requirements 14.4, 14.5**

- [x] 7. Implement Finance Settings API
  - [x] 7.1 Create `POST /api/finance/settings` — upsert `FinanceSettings`
    - Encrypt `mpesaWebhookSecret` via `crypto.ts` before persisting
    - Generate a stable UUID webhook path on first creation only
    - Validate with Zod: `balanceThreshold` ≥ 0, `daysOverdueThreshold` positive integer
    - _Requirements: 4.1–4.5_
  - [x] 7.2 Create `GET /api/finance/settings` — read settings with default fallback
    - Return default-valued response (not 404) when no `FinanceSettings` row exists yet
    - _Requirements: 4.3_
  - [ ]* 7.3 Write property test for webhook secret encryption (Property 3)
    - **Property 3: Webhook secret is never stored in plaintext**
    - Generate arbitrary secret strings; call the settings upsert and assert that the value stored in the DB differs from the plaintext input and equals the AES-256-GCM output of `crypto.ts:encryptSecret`
    - **Validates: Requirements 4.2**

- [x] 8. Implement Fee Structure, Expense Categories, and Expense Items APIs
  - [x] 8.1 Create `POST /api/finance/fee-structures` and `GET /api/finance/fee-structures`
    - Zod: `form` integer 1–4, `amountPerTerm` positive Decimal
    - Return HTTP 405 for DELETE requests
    - _Requirements: 5.1–5.4_
  - [x] 8.2 Create `POST /api/finance/expense-categories` and `GET /api/finance/expense-categories`
    - Zod: `name` non-empty trimmed string
    - _Requirements: 6.1_
  - [x] 8.3 Create `POST /api/finance/expense-items` and `GET /api/finance/expense-items`, plus `PATCH /api/finance/expense-items/[id]` for activation toggle
    - Zod: `currentPrice` positive Decimal, `categoryId` non-empty
    - _Requirements: 6.2, 6.5_
  - [x] 8.4 Create `POST /api/finance/expense-attachments` — attach an expense item to a student
    - If `Term.invoicingCompletedAt` is already set, create a `DEBIT_ADJUSTMENT` `LedgerEntry` for the prorated amount in the same transaction using `computeProratedAmount`
    - _Requirements: 6.3, 6.4_

- [x] 9. Implement Term Management and Batch Invoicing APIs
  - [x] 9.1 Create `POST /api/finance/terms` and `GET /api/finance/terms`
    - Zod: `name` non-empty, `academicYear` integer, `startDate` / `endDate` ISO datetime
    - _Requirements: 7.1_
  - [x] 9.2 Create `POST /api/finance/terms/[termId]/invoice` — trigger batch invoicing
    - Call `runBatchInvoicing(termId, schoolId, userId)` and set `Term.invoicingCompletedAt` on completion
    - Return `{ succeeded, skipped, errors }` in the response
    - _Requirements: 7.2–7.7_

- [x] 10. Implement Manual Payment Posting and Receipts APIs
  - [x] 10.1 Create `POST /api/finance/payments` — manual payment entry
    - Create `Payment` row, call `postLedgerEntry(PAYMENT)`, and update `StudentFinanceAccount` atomically
    - Use `nextReceiptNumber` within the same transaction
    - Create `FinanceNotification(PAYMENT_RECEIVED)`
    - Zod: `amount` positive Decimal > 0, `method` one of `CASH | BANK_TRANSFER | CHEQUE`
    - _Requirements: 9.1–9.5_
  - [x] 10.2 Create `GET /api/finance/payments/[paymentId]/receipt` — receipt payload
    - Return student name, admission number, class, term name, amount, method, reference, receiptNumber, paidAt, currentBalance
    - Do not expose raw M-Pesa payload fields
    - Return HTTP 404 if payment does not belong to `caller.schoolId`
    - _Requirements: 11.1–11.3_

- [x] 11. Implement M-Pesa C2B Webhook and Reconciliation APIs
  - [x] 11.1 Create `POST /api/finance/mpesa/webhook/[webhookToken]` — C2B callback handler
    - Authenticate via HMAC only (no session cookie)
    - Idempotency check against both `LedgerEntry.mpesaTransactionId` and `MpesaReconciliationQueue.mpesaTransactionId`
    - On exact match: auto-create `Payment`, `LedgerEntry(PAYMENT)`, update `StudentFinanceAccount`, set `AUTO_MATCHED`, create `FinanceNotification(PAYMENT_RECEIVED)` — all in one transaction
    - On fuzzy match: create `MpesaReconciliationQueue` with `PENDING`, create `FinanceNotification(RECONCILIATION_NEEDED)`
    - Always return HTTP 200 after HMAC passes (except on duplicate → HTTP 200, auth failure → HTTP 401)
    - _Requirements: 10.1–10.5_
  - [ ]* 11.2 Write property test for M-Pesa webhook idempotency (Property 9)
    - **Property 9: M-Pesa webhook idempotency**
    - Submit the same `mpesaTransactionId` twice; assert the second request returns HTTP 200 and creates no additional rows in any table
    - **Validates: Requirements 10.3**
  - [x] 11.3 Create `POST /api/finance/reconciliation/[id]/resolve` — manual reconciliation
    - Create `Payment`, `LedgerEntry(PAYMENT)`, update `StudentFinanceAccount`, set `MANUAL_RECONCILED`, set `MpesaReconciliationQueue.status = RESOLVED` — all in one transaction
    - _Requirements: 10.6_
  - [x] 11.4 Create `GET /api/finance/reconciliation` — list pending queue entries
    - Return `MpesaReconciliationQueue` rows with `status = PENDING` for `caller.schoolId`, include `suggestedStudentId` and `suggestedConfidence`
    - _Requirements: 10.5_

- [x] 12. Implement Student Finance Account and Setup APIs
  - [x] 12.1 Update `POST /api/students` to create `StudentFinanceAccount` and `FinanceNotification(SETUP_REQUIRED)` within the existing student creation transaction
    - _Requirements: 8.1, 8.2_
  - [x] 12.2 Create `PATCH /api/finance/accounts/[studentId]/complete-setup`
    - Set `financeSetupCompletedAt = now()` and mark the corresponding `SETUP_REQUIRED` notification as `isRead = true`
    - _Requirements: 8.3, 8.4_
  - [x] 12.3 Create `GET /api/finance/students` — paginated student finance list
    - Include `financeSetupCompletedAt` (null → "Finance Pending"), `currentBalance`, form, stream, name, admission number
    - Support free-text search on `fullName`, `admissionNumber`, class name; balance threshold filters; form/stream filters
    - _Requirements: 19.1–19.4_

- [x] 13. Implement Ledger View APIs
  - [x] 13.1 Create `GET /api/finance/ledger` — paginated school-wide ledger
    - Support query params: `studentId`, `termId`, `entryType`, `fromDate`, `toDate`, `isVoided`, `page`, `pageSize` (default 50, max 200)
    - Include student `fullName`/`admissionNumber`, term `name`, and poster `fullName` via Prisma `include`
    - Annotate voided entries with `voided: true`; include correction entry `referenceId` link
    - Order by `postedAt` descending by default
    - _Requirements: 15.1–15.4_
  - [x] 13.2 Create `GET /api/finance/students/[studentId]/ledger` — individual student ledger
    - Return all `LedgerEntry` rows in ascending chronological order, each annotated with a server-computed running balance
    - Include `Invoice` list, `Payment` list, and `StudentFinanceAccount` summary in the same response
    - Return HTTP 404 if student does not belong to `caller.schoolId`
    - _Requirements: 16.1–16.3_

- [x] 14. Implement Analytics and Reports APIs
  - [x] 14.1 Create `GET /api/finance/reports/summary` — collection summary
    - Return `totalInvoiced`, `totalCollected`, `totalOutstanding`, `collectionRate` (2 decimal places), optionally filtered by `termId`
    - _Requirements: 13.1_
  - [x] 14.2 Create `GET /api/finance/reports/aging` — aging report
    - Return per-student row: `studentId`, `fullName`, `admissionNumber`, `className`, `totalInvoiced`, `totalPaid`, `balance`, `daysOverdue`, `bucket` (0-30, 31-60, 61-90, 90+)
    - _Requirements: 13.2_
  - [x] 14.3 Create `GET /api/finance/reports/payment-volume` — payment volume over time
    - Return daily or weekly aggregated totals within a requested date range for Recharts `BarChart`
    - _Requirements: 13.3_
  - [x] 14.4 Create `GET /api/finance/reports/class-collection` — per-class collection rates
    - Return per-class collection rate percentages for Recharts `BarChart`
    - _Requirements: 13.4_

- [x] 15. Implement Finance Import API and CSV template
  - [x] 15.1 Create `POST /api/finance/imports` — file upload and job creation
    - Accept CSV or XLSX (max 10 MB); create `FinanceImportJob(status=QUEUED)`
    - Process synchronously if rows < 500; otherwise return job ID for polling
    - _Requirements: 14.1_
  - [x] 15.2 Create `GET /api/finance/imports/[id]` — job status polling
    - Return current `status`, `succeeded`, `failed`, `totalRows`, `errorReport`
    - _Requirements: 14.1_
  - [x] 15.3 Create `GET /api/finance/imports/template/[importType]` — downloadable CSV template
    - Return required column headers and one example row for `PLAIN_LEDGER` and `OPENING_BALANCE` types
    - _Requirements: 14.6_

- [x] 16. Implement Notifications and Debtor Job APIs
  - [x] 16.1 Create `PATCH /api/finance/notifications/[id]/read` — mark notification as read
    - Set `isRead = true`, scope to `caller.schoolId`
    - _Requirements: 17.5_
  - [x] 16.2 Create `GET /api/finance/notifications` — list unread notifications
    - Return unread `FinanceNotification` rows for `caller.schoolId`, ordered by `createdAt` descending
    - _Requirements: 17.4_
  - [x] 16.3 Create `GET /api/finance/jobs/debtor-refresh` — cron-triggered debtor daily job
    - Authenticate via `Authorization: Bearer ${process.env.CRON_SECRET}`
    - Call `runDailyDebtorJob()` and return `{ updated: number }`
    - _Requirements: 12.4_

- [x] 17. Implement school-wide data scoping and add `vercel.json` cron entry
  - [x] 17.1 Verify all finance API routes scope queries to `caller.schoolId` and do not accept `schoolId` from request body or query string
    - Audit each route against Requirements 3.3, 20.4
    - _Requirements: 3.3, 20.4_
  - [x] 17.2 Add cron entry for `/api/finance/jobs/debtor-refresh` in `vercel.json` (daily schedule)
    - _Requirements: 12.4_
  - [ ]* 17.3 Write property test for school-scoped data isolation (Property 11)
    - **Property 11: All finance data is scoped to the caller's school**
    - Create data for two schools; for each finance API endpoint, assert that a caller from school A receives zero rows belonging to school B
    - **Validates: Requirements 3.3, 13.5, 15.1, 20.4**

- [x] 18. Checkpoint — Verify all API routes, run full test suite
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Build the Bursar finance layout and dashboard page
  - [ ] 19.1 Create `src/app/staff/finance/layout.tsx` — server component with auth guard
    - Enforce `role = BURSAR | ADMIN_STAFF (with FEES.canView) | PRINCIPAL`; redirect to `/staff` on denial
    - Render sidebar navigation with links to all finance sub-pages (dashboard, students, reconciliation, reports, settings)
    - _Requirements: 17.1, 21.1_
  - [ ] 19.2 Create `src/app/staff/finance/page.tsx` — Bursar dashboard
    - Fetch summary cards (totalInvoiced, totalCollected, totalOutstanding, debtorCount) server-side
    - Render 10 most recent `LedgerEntry` rows (student name, entry type, amount, time elapsed)
    - Render unread `FinanceNotification` feed as a Client Component with optimistic mark-as-read
    - _Requirements: 17.1–17.5_
  - [ ] 19.3 Add finance navigation link to the existing staff layout navigation menu
    - _Requirements: 21.3_

- [ ] 20. Build the student finance list page
  - [ ] 20.1 Create `src/app/staff/finance/students/page.tsx` — student list with "Finance Pending" badge
    - Client Component with Zustand store for filter state
    - Debounce search by 300 ms before calling `/api/finance/students`
    - Render table: name, admission number, class, current balance, finance status
    - Show "Finance Pending" yellow badge when `financeSetupCompletedAt` is null
    - Support filters: balance threshold range, form/class, stream
    - _Requirements: 19.1–19.5_
  - [ ] 20.2 Create `src/app/staff/finance/students/[studentId]/page.tsx` — individual student ledger view
    - Render `LedgerTable` with entries in ascending chronological order, running balance per row, and a summary row
    - Render invoice list, payment list, and account summary
    - _Requirements: 16.1–16.3_

- [ ] 21. Build the reconciliation page
  - [ ] 21.1 Create `src/app/staff/finance/reconciliation/page.tsx` — M-Pesa reconciliation queue
    - List `MpesaReconciliationQueue` rows with `status = PENDING`
    - Show raw account number, suggested student match with confidence percentage, and amount
    - Inline resolve and reject actions with optimistic UI updates
    - _Requirements: 10.5, 10.6_

- [ ] 22. Build the reports page
  - [ ] 22.1 Create `src/app/staff/finance/reports/page.tsx` — analytics and charts
    - Render Payment Volume `BarChart` (Recharts), Class Collection Rate `BarChart` (Recharts), summary cards (collection rate, outstanding total), and paginated aging table
    - Fetch data from the four report API routes
    - _Requirements: 13.1–13.4_

- [ ] 23. Build the Principal finance view
  - [ ] 23.1 Create `src/app/principal/finance/page.tsx` — read-only Principal finance view
    - Reuse the same analytics components and debtors list from the Bursar dashboard
    - Do not import or render any write-action components (payment forms, settings forms, reconciliation actions) — they must be absent from the component tree, not conditionally hidden
    - _Requirements: 18.1–18.4_
  - [ ] 23.2 Add finance navigation link to the existing principal layout navigation menu
    - _Requirements: 21.2, 21.3_

- [ ] 24. Build Finance Settings UI page
  - [ ] 24.1 Create `src/app/staff/finance/settings/page.tsx` — finance settings form
    - Form fields: balance threshold, days overdue threshold, receipt prefix, invoice prefix, M-Pesa Paybill number, webhook secret (masked input)
    - Display the read-only webhook URL after settings are saved
    - _Requirements: 4.1–4.5_

- [ ] 25. Final checkpoint — End-to-end verification
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints at tasks 4, 18, and 25 ensure incremental validation
- Property tests (Properties 1–12) validate universal correctness guarantees described in the design document
- Unit tests validate specific examples and edge cases not covered by properties
- The `postLedgerEntry` function in `ledger.ts` is the single write path — no route writes `LedgerEntry` directly
- All Decimal fields must be serialised as strings in JSON responses to avoid floating-point precision loss
- The webhook endpoint at `/api/finance/mpesa/webhook/[webhookToken]` is the only route exempt from session-cookie auth

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["1.5"] },
    { "id": 4, "tasks": ["2.1", "2.2"] },
    { "id": 5, "tasks": ["2.3", "3.1", "3.3", "3.4"] },
    { "id": 6, "tasks": ["3.2", "3.5", "3.6"] },
    { "id": 7, "tasks": ["3.7", "5.1", "5.3"] },
    { "id": 8, "tasks": ["5.2", "5.4", "5.5", "6.1"] },
    { "id": 9, "tasks": ["5.6", "5.7", "6.2", "7.1", "7.2"] },
    { "id": 10, "tasks": ["6.3", "7.3", "8.1", "8.2", "8.3", "9.1"] },
    { "id": 11, "tasks": ["8.4", "9.2", "10.1", "12.1"] },
    { "id": 12, "tasks": ["10.2", "11.1", "12.2", "12.3", "13.1", "13.2", "14.1", "14.2", "14.3", "14.4", "15.1", "15.3"] },
    { "id": 13, "tasks": ["11.2", "11.3", "11.4", "15.2", "16.1", "16.2", "16.3", "17.1", "17.2"] },
    { "id": 14, "tasks": ["17.3", "19.1", "19.2", "19.3", "20.1", "20.2", "21.1", "22.1", "23.1", "23.2", "24.1"] }
  ]
}
```
