# Requirements Document

## Introduction

The Fees & Ledger module adds complete school finance management to Bidii, a multi-tenant School Management System serving Kenyan secondary schools. The module introduces a single-entry, immutable ledger with materialised per-student balances, term-based batch invoicing, M-Pesa C2B payment matching, manual payment posting, debtor tracking, analytics, CSV/Excel import tooling, and role-gated UI dashboards for both the Bursar (`/staff/finance`) and Principal (`/principal/finance`). It extends the existing Prisma schema, RBAC `Module` enum, and `Role` enum without breaking any existing module.

---

## Glossary

- **System**: The Bidii Fees & Ledger module running on Next.js 14 App Router with Prisma 5 and Supabase Postgres.
- **Bursar**: A staff user whose `User.role` is `ADMIN_STAFF` and whose assigned `StaffRole` holds `FEES` module permissions, OR a user whose `User.role` is the new `BURSAR` enum value.
- **Principal**: A user whose `User.role` is `PRINCIPAL`. Always has full read access to finance; write access is shared with the Bursar.
- **Student**: A row in the `Student` table scoped to a `schoolId`.
- **SchoolId**: The application-level `School.id` used to scope every data query; passed as `caller.schoolId` from the auth guard.
- **LedgerEntry**: An immutable financial transaction row. Once inserted it is never updated or deleted; corrections are made by inserting a new offsetting row.
- **StudentFinanceAccount**: A materialised summary row, one per student per school, whose `currentBalance` is updated atomically in the same Prisma transaction as every `LedgerEntry` write.
- **FeeStructure**: A school-defined mapping of (form, stream, boardingStatus) to a KES amount per term.
- **Term**: A named academic period with a start date, end date, and invoicing lifecycle.
- **Invoice**: A record of fees charged to a student for a term, backed by a corresponding `LedgerEntry` of type `INVOICE`.
- **Payment**: A record of money received from or on behalf of a student, backed by a corresponding `LedgerEntry` of type `PAYMENT`.
- **MpesaReconciliationQueue**: A holding table for C2B M-Pesa callbacks that could not be automatically matched to a student.
- **DebtorFlag**: A record that a student's balance has crossed the school-defined threshold, with lifecycle tracking.
- **FinanceNotification**: An in-app notification row for finance events (setup required, payment received, reconciliation needed, etc.).
- **FinanceImportJob**: A record of a CSV or Excel import run for ledger or opening-balance data.
- **ExpenseCategory**: A school-defined grouping for ad-hoc charges.
- **ExpenseItem**: A named, priced ad-hoc charge belonging to an `ExpenseCategory`.
- **StudentExpenseAttachment**: A join row linking a student to an `ExpenseItem` for the current term.
- **FinanceSettings**: A school-level configuration row for thresholds, M-Pesa Paybill, receipt prefix, and webhook.
- **Levenshtein Distance**: Edit-distance metric used to fuzzy-match an M-Pesa raw account number to a student admission number.
- **RLS**: Row-Level Security enforced at the Postgres layer using `SET LOCAL app.current_school_id` per transaction.
- **EARS**: Easy Approach to Requirements Syntax — structured natural-language requirements patterns used throughout this document.
- **INCOSE**: International Council on Systems Engineering quality rules applied to every acceptance criterion.

---

## Requirements

### Requirement 1 — Schema Extensions: RBAC Enum Values

**User Story:** As a Principal, I want the RBAC system to recognise a dedicated `BURSAR` role and a `FEES` module permission so that I can grant finance-specific access to staff without giving them unrelated capabilities.

#### Acceptance Criteria

1. THE System SHALL add the value `BURSAR` to the existing `Role` enum in `prisma/schema.prisma`, positioned after `ADMIN_STAFF`.
2. THE System SHALL add the value `FEES` to the existing `Module` enum in `prisma/schema.prisma`, with a doc comment explaining its scope.
3. WHEN a `User` row has `role = BURSAR`, THE System SHALL treat that user identically to `ADMIN_STAFF` in all existing authentication guards (`requireSchoolRole`, `requireSchoolPermission`) with respect to session validation and school scoping.
4. THE System SHALL extend `requireSchoolRole` to accept `BURSAR` as a valid role argument wherever `ADMIN_STAFF` is currently accepted, without altering any existing call sites.

---

### Requirement 2 — Schema Extensions: Finance Data Models

**User Story:** As an architect, I want all finance data persisted in well-defined, school-scoped Prisma models so that the ledger is correct, auditable, and isolated per tenant.

#### Acceptance Criteria

1. THE System SHALL define a `FinanceSettings` model with fields: `schoolId` (PK, FK → School), `balanceThreshold` (Decimal), `daysOverdueThreshold` (Int), `receiptPrefix` (String), `invoicePrefix` (String), `mpesaPaybillNumber` (String, optional), `mpesaWebhookSecret` (String, optional — stored AES-256-GCM encrypted via the existing `crypto.ts`), `mpesaWebhookUrl` (String, optional — unique UUID path per school).
2. THE System SHALL define a `FeeStructure` model with fields: `id`, `schoolId`, `form` (Int 1–4), `stream` (String, optional), `boardingStatus` (enum `DAY | BOARDING`, optional — null means both), `amountPerTerm` (Decimal), `createdById`, `createdAt`; with no deletion support (superseded rows are retained for history).
3. THE System SHALL define an `ExpenseCategory` model with fields: `id`, `schoolId`, `name`, `description` (optional), `icon` (optional), `createdAt`.
4. THE System SHALL define an `ExpenseItem` model with fields: `id`, `schoolId`, `categoryId` (FK → ExpenseCategory), `name`, `description` (optional), `currentPrice` (Decimal), `isActive` (Bool, default true), `createdAt`, `updatedAt`.
5. THE System SHALL define a `StudentExpenseAttachment` model with fields: `id`, `studentId`, `expenseItemId`, `schoolId`, `attachedAt`, `attachedById`, `detachedAt` (optional), `detachedById` (optional).
6. THE System SHALL define a `Term` model with fields: `id`, `schoolId`, `name`, `academicYear`, `startDate`, `endDate`, `isActive` (Bool), `invoicingCompletedAt` (optional DateTime), `createdById`, `createdAt`.
7. THE System SHALL define a `StudentFinanceAccount` model with fields: `id`, `schoolId`, `studentId` (unique per school), `currentBalance` (Decimal), `totalInvoiced` (Decimal), `totalPaid` (Decimal), `lastActivityAt` (DateTime), `financeSetupCompletedAt` (optional DateTime — null until Bursar completes setup); with a unique constraint on `(schoolId, studentId)`.
8. THE System SHALL define a `LedgerEntry` model with fields: `id`, `schoolId`, `studentId`, `termId` (optional FK → Term), `entryType` (enum `INVOICE | PAYMENT | CREDIT_ADJUSTMENT | DEBIT_ADJUSTMENT | OPENING_BALANCE`), `amount` (Decimal, always stored as a positive number), `description`, `referenceId` (optional), `referenceType` (optional), `postedById`, `postedAt`, `mpesaTransactionId` (optional, unique), `paymentMethod` (optional enum `MPESA | CASH | BANK_TRANSFER | CHEQUE`), `isVoided` (Bool, default false); with no delete support on this model.
9. THE System SHALL define an `Invoice` model with fields: `id`, `schoolId`, `studentId`, `termId`, `totalAmount` (Decimal), `lineItems` (Json), `invoiceNumber` (String — sequential within school), `isProrated` (Bool), `proratedDays` (optional Int), `generatedById`, `generatedAt`.
10. THE System SHALL define a `Payment` model with fields: `id`, `schoolId`, `studentId`, `termId` (optional FK), `amount` (Decimal), `method` (enum `MPESA | CASH | BANK_TRANSFER | CHEQUE`), `mpesaTransactionId` (optional, unique), `mpesaRawPayload` (optional Json), `reference` (optional), `receiptNumber` (String — sequential within school), `paidAt`, `postedById`, `reconciliationStatus` (enum `AUTO_MATCHED | MANUAL_RECONCILED | PENDING`).
11. THE System SHALL define a `MpesaReconciliationQueue` model with fields: `id`, `schoolId`, `mpesaTransactionId`, `rawAccountNumber`, `amount` (Decimal), `paidAt`, `rawPayload` (Json), `suggestedStudentId` (optional), `suggestedConfidence` (optional Float), `status` (enum `PENDING | RESOLVED | REJECTED`), `resolvedById` (optional), `resolvedAt` (optional), `resolvedStudentId` (optional).
12. THE System SHALL define a `DebtorFlag` model with fields: `id`, `schoolId`, `studentId`, `flaggedAt`, `balanceAtFlag` (Decimal), `daysOverdueAtFlag` (Int), `isCurrent` (Bool), `unflaggedAt` (optional).
13. THE System SHALL define a `FinanceNotification` model with fields: `id`, `schoolId`, `studentId` (optional), `type` (enum `SETUP_REQUIRED | REMINDER_SENT | PAYMENT_RECEIVED | INVOICE_GENERATED | RECONCILIATION_NEEDED`), `message`, `metadata` (optional Json), `isRead` (Bool, default false), `createdAt`.
14. THE System SHALL define a `FinanceImportJob` model with fields: `id`, `schoolId`, `importType` (enum `PLAIN_LEDGER | OPENING_BALANCE`), `fileName`, `columnMapping` (optional Json), `status` (enum `QUEUED | PROCESSING | COMPLETED | FAILED`), `totalRows` (Int), `succeeded` (Int), `failed` (Int), `errorReport` (optional Json), `createdById`, `createdAt`.
15. THE System SHALL add back-relation arrays to the existing `School` model for every new finance model, following the existing Prisma relation pattern.
16. THE System SHALL add back-relation arrays to the existing `Student` model for `LedgerEntry`, `StudentFinanceAccount`, `Invoice`, `Payment`, `StudentExpenseAttachment`, `DebtorFlag`, and `FinanceNotification`.
17. WHEN the System executes a transaction that writes a `LedgerEntry`, THE System SHALL include a corresponding `StudentFinanceAccount` update in the same `prisma.$transaction` call so that `currentBalance` is always consistent with the ledger.

---

### Requirement 3 — RLS: Per-Transaction School Scoping

**User Story:** As a platform engineer, I want every finance write transaction to set the Postgres session variable `app.current_school_id` so that Row-Level Security policies can enforce tenant isolation at the database layer without breaking PgBouncer.

#### Acceptance Criteria

1. WHEN the System executes a `prisma.$transaction` that writes any finance model row, THE System SHALL issue `SET LOCAL app.current_school_id = '<schoolId>'` as the first statement within the transaction using `tx.$executeRaw`.
2. THE System SHALL use `SET LOCAL` (not `SET`) so that the variable is scoped to the current transaction and released automatically when the transaction commits or rolls back, ensuring PgBouncer connection pooling is not affected.
3. IF a finance transaction is called without a valid `schoolId` from `caller.schoolId`, THEN THE System SHALL throw an error before executing any database write.

---

### Requirement 4 — Finance Settings Management

**User Story:** As a Bursar, I want to configure school-specific finance thresholds, Paybill number, receipt/invoice prefixes, and M-Pesa webhook details so that the module behaves correctly for my school.

#### Acceptance Criteria

1. WHEN a Bursar or Principal submits a valid `FinanceSettings` payload to `POST /api/finance/settings`, THE System SHALL upsert the `FinanceSettings` row for `caller.schoolId` within a transaction.
2. WHEN the `mpesaWebhookSecret` field is present in the payload, THE System SHALL encrypt it using the existing `crypto.ts` AES-256-GCM helper before persisting, and SHALL NOT store the plaintext value.
3. WHEN `FinanceSettings` does not yet exist for a school and a request is made to read settings, THE System SHALL return a default-valued response rather than a 404, so that the settings page renders without error on first visit.
4. THE System SHALL generate a unique UUID-based `mpesaWebhookUrl` path per school on first settings creation and SHALL NOT regenerate it on subsequent updates unless explicitly requested.
5. THE System SHALL validate that `balanceThreshold` is a non-negative Decimal and `daysOverdueThreshold` is a positive integer using Zod before any write.

---

### Requirement 5 — Fee Structure CRUD

**User Story:** As a Bursar, I want to define per-term fee amounts by form, stream, and boarding status so that invoicing knows what to charge each student.

#### Acceptance Criteria

1. WHEN a Bursar submits a valid fee structure payload to `POST /api/finance/fee-structures`, THE System SHALL create a new `FeeStructure` row scoped to `caller.schoolId`.
2. THE System SHALL validate that `form` is an integer between 1 and 4 inclusive and `amountPerTerm` is a positive Decimal using Zod.
3. THE System SHALL NOT delete `FeeStructure` rows; WHEN a DELETE request is received, THE System SHALL return HTTP 405 (Method Not Allowed).
4. WHEN a GET request is made to `/api/finance/fee-structures`, THE System SHALL return all `FeeStructure` rows for `caller.schoolId` ordered by `form` ascending then `stream` ascending.
5. WHEN the invoicing engine selects a fee structure for a student, THE System SHALL match by `form`, then by `stream` (exact or null), then by `boardingStatus` (exact or null), choosing the most-specific match.

---

### Requirement 6 — Expense Categories and Items

**User Story:** As a Bursar, I want to create expense categories and items so that ad-hoc charges (e.g. lab fees, uniforms) can be attached to individual students.

#### Acceptance Criteria

1. WHEN a Bursar submits a valid payload to `POST /api/finance/expense-categories`, THE System SHALL create an `ExpenseCategory` row scoped to `caller.schoolId`.
2. WHEN a Bursar submits a valid payload to `POST /api/finance/expense-items`, THE System SHALL create an `ExpenseItem` row scoped to `caller.schoolId` with `isActive` defaulting to true.
3. WHEN a Bursar submits a valid payload to `POST /api/finance/expense-attachments`, THE System SHALL create a `StudentExpenseAttachment` row and, if the current term's invoicing has already completed, THE System SHALL also create a `DEBIT_ADJUSTMENT` `LedgerEntry` for the prorated amount within the same transaction.
4. WHEN a mid-term proration `LedgerEntry` is computed for an expense attachment, THE System SHALL calculate the amount as `(remainingDays / totalTermDays) × expenseItem.currentPrice`, where `remainingDays = term.endDate − today` and `totalTermDays = term.endDate − term.startDate`.
5. WHEN a Bursar deactivates an `ExpenseItem` (sets `isActive = false`), THE System SHALL NOT delete existing `StudentExpenseAttachment` rows for that item; those charges remain on the ledger.

---

### Requirement 7 — Term Management and Batch Invoicing

**User Story:** As a Bursar, I want to create a term and trigger a batch invoicing run so that all active students are charged the correct fees in one operation.

#### Acceptance Criteria

1. WHEN a Bursar submits a valid term payload to `POST /api/finance/terms`, THE System SHALL create a `Term` row scoped to `caller.schoolId` and return the created term.
2. WHEN a Bursar calls `POST /api/finance/terms/[termId]/invoice`, THE System SHALL execute a batch invoicing run that iterates every non-archived student in `caller.schoolId`.
3. WHEN the batch invoicing run processes a student, THE System SHALL select the matching `FeeStructure` (by form, stream, boardingStatus), sum all active `StudentExpenseAttachment` prices for that student, create an `Invoice` row, create a single `INVOICE` `LedgerEntry`, and update `StudentFinanceAccount.currentBalance` and `totalInvoiced` — all within one `prisma.$transaction` per student.
4. WHEN a student has already been invoiced for the given term (an `Invoice` row with matching `studentId` and `termId` exists), THE System SHALL skip that student, making the batch run idempotent.
5. WHEN the batch invoicing run finishes all students, THE System SHALL set `Term.invoicingCompletedAt` to the current timestamp.
6. WHEN a new student registers mid-term (after `Term.invoicingCompletedAt` is set), THE System SHALL create a prorated `INVOICE` `LedgerEntry` using `(remainingDays / totalTermDays) × feeStructureAmount`, or a custom Bursar-specified amount, and create a `FinanceNotification` of type `INVOICE_GENERATED`.
7. IF no matching `FeeStructure` is found for a student during the batch run, THEN THE System SHALL record that student in the job's error report and continue processing the remaining students without aborting the entire run.

---

### Requirement 8 — New Student Finance Setup

**User Story:** As a Bursar, I want to be notified when a new student is registered and complete their finance setup, so that no student slips through without a finance account.

#### Acceptance Criteria

1. WHEN a new `Student` row is created in the system, THE System SHALL create a `FinanceNotification` row of type `SETUP_REQUIRED` scoped to that `schoolId`, referencing the new student.
2. WHEN a new `Student` row is created, THE System SHALL also create a `StudentFinanceAccount` row for that student with `currentBalance = 0`, `totalInvoiced = 0`, `totalPaid = 0`, and `financeSetupCompletedAt = null`.
3. WHILE `StudentFinanceAccount.financeSetupCompletedAt` is null, THE System SHALL include a "Finance Pending" indicator in any API response or UI component that lists students.
4. WHEN a Bursar calls `PATCH /api/finance/accounts/[studentId]/complete-setup`, THE System SHALL set `financeSetupCompletedAt` to the current timestamp and mark the corresponding `SETUP_REQUIRED` `FinanceNotification` as `isRead = true`.

---

### Requirement 9 — Manual Payment Posting

**User Story:** As a Bursar, I want to post cash, cheque, or bank-transfer payments manually so that non-M-Pesa payments are recorded with a receipt.

#### Acceptance Criteria

1. WHEN a Bursar submits a valid payment payload to `POST /api/finance/payments`, THE System SHALL create a `Payment` row, a `PAYMENT` `LedgerEntry`, and update `StudentFinanceAccount.currentBalance` and `totalPaid` atomically in one `prisma.$transaction`.
2. THE System SHALL assign a `receiptNumber` by computing `MAX(receiptNumber) + 1` within the same transaction, prefixed with `FinanceSettings.receiptPrefix`, so that receipt numbers are sequential and collision-free within the school.
3. WHEN a manual payment is posted, THE System SHALL set `Payment.reconciliationStatus = PENDING` for cash/cheque/bank-transfer and `reconciliationStatus = MANUAL_RECONCILED` when explicitly confirmed by the Bursar.
4. THE System SHALL validate `amount` as a positive Decimal greater than zero using Zod before any write.
5. WHEN a payment is posted successfully, THE System SHALL create a `FinanceNotification` of type `PAYMENT_RECEIVED` referencing the student and the amount.

---

### Requirement 10 — M-Pesa C2B Webhook and Auto-Matching

**User Story:** As a Bursar, I want M-Pesa C2B callbacks to be automatically matched to students and credited to their accounts, so that manual reconciliation is minimised.

#### Acceptance Criteria

1. WHEN a C2B callback is received at `POST /api/finance/mpesa/webhook/[webhookToken]`, THE System SHALL validate the request HMAC signature against the school's `FinanceSettings.mpesaWebhookSecret` before processing any payload.
2. IF the HMAC signature is invalid, THEN THE System SHALL return HTTP 401 and SHALL NOT create any rows.
3. THE System SHALL check `mpesaTransactionId` against both `LedgerEntry.mpesaTransactionId` and `MpesaReconciliationQueue.mpesaTransactionId` before processing; WHEN a duplicate is found, THE System SHALL return HTTP 200 (idempotency) without creating any rows.
4. WHEN the `rawAccountNumber` in the callback exactly matches a `Student.admissionNumber` within the school, THE System SHALL automatically create a `Payment` row, a `PAYMENT` `LedgerEntry`, update `StudentFinanceAccount.currentBalance` and `totalPaid`, set `reconciliationStatus = AUTO_MATCHED`, and create a `FinanceNotification` of type `PAYMENT_RECEIVED` — all within one `prisma.$transaction`.
5. WHEN the `rawAccountNumber` does not exactly match any admission number, THE System SHALL compute the Levenshtein distance between `rawAccountNumber` and each `Student.admissionNumber` in the school, store the closest match as `suggestedStudentId` with a normalised `suggestedConfidence` float (0–1), create a `MpesaReconciliationQueue` row with `status = PENDING`, and create a `FinanceNotification` of type `RECONCILIATION_NEEDED`.
6. WHEN a Bursar resolves a `MpesaReconciliationQueue` entry by calling `POST /api/finance/reconciliation/[id]/resolve`, THE System SHALL create a `Payment` row, a `PAYMENT` `LedgerEntry`, update `StudentFinanceAccount`, set `reconciliationStatus = MANUAL_RECONCILED`, and set `MpesaReconciliationQueue.status = RESOLVED` — all in one transaction.

---

### Requirement 11 — Receipts

**User Story:** As a Bursar, I want to generate and print a receipt for each payment so that the student and parent have proof of payment.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/finance/payments/[paymentId]/receipt`, THE System SHALL return a receipt payload containing: student full name, admission number, class name, term name, amount paid, payment method, reference, receiptNumber, paidAt, and `currentBalance` after the payment.
2. THE System SHALL scope the receipt query to `caller.schoolId`, returning HTTP 404 if the payment does not belong to that school.
3. THE System SHALL NOT expose raw M-Pesa payload fields in the receipt response.

---

### Requirement 12 — Debtor Flagging

**User Story:** As a Bursar, I want students who owe beyond the configured threshold to be automatically flagged as debtors so that I can take follow-up action.

#### Acceptance Criteria

1. WHEN a `LedgerEntry` write completes for a student, THE System SHALL recompute that student's `currentBalance` and compare it against `FinanceSettings.balanceThreshold` for the school.
2. WHEN `currentBalance` is less than the negative of `balanceThreshold` AND no `DebtorFlag` with `isCurrent = true` exists for that student, THE System SHALL create a new `DebtorFlag` row with `isCurrent = true`, `flaggedAt = now()`, and `balanceAtFlag = currentBalance`.
3. WHEN `currentBalance` is greater than or equal to the negative of `balanceThreshold` AND a `DebtorFlag` with `isCurrent = true` exists for that student, THE System SHALL set `DebtorFlag.isCurrent = false` and `unflaggedAt = now()`.
4. WHEN the daily scheduled job runs, THE System SHALL iterate all students with `isCurrent = true` `DebtorFlag` rows and recalculate `daysOverdueAtFlag` based on the oldest unpaid `INVOICE` `LedgerEntry` date, updating the flag row.
5. WHEN a Bursar selects students from the debtors list and submits a bulk SMS request, THE System SHALL create `Message` and `MessageLog` rows using the existing messaging infrastructure for each selected student's `parentContact` number.

---

### Requirement 13 — Analytics and Reports

**User Story:** As a Principal or Bursar, I want finance analytics — collection rates, payment volume trends, class comparisons, and an aging report — so that I can make informed decisions.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/finance/reports/summary`, THE System SHALL return: `totalInvoiced`, `totalCollected`, `totalOutstanding`, and `collectionRate` (percentage, two decimal places) for the school, optionally filtered by `termId`.
2. WHEN a GET request is made to `/api/finance/reports/aging`, THE System SHALL return one row per student with: `studentId`, `fullName`, `admissionNumber`, `className`, `totalInvoiced`, `totalPaid`, `balance`, `daysOverdue`, and `bucket` (one of `0-30`, `31-60`, `61-90`, `90+`), scoped to `caller.schoolId`.
3. WHEN a GET request is made to `/api/finance/reports/payment-volume`, THE System SHALL return daily or weekly aggregated payment totals within a requested date range, suitable for rendering a Recharts `BarChart`.
4. WHEN a GET request is made to `/api/finance/reports/class-collection`, THE System SHALL return per-class collection rate percentages suitable for rendering a Recharts `BarChart`.
5. THE System SHALL scope all report queries to `caller.schoolId` and SHALL NOT return data from other schools.

---

### Requirement 14 — Finance Imports (CSV / Excel)

**User Story:** As a Bursar, I want to import historical ledger data or opening balances from a CSV or Excel file so that the system starts with accurate records.

#### Acceptance Criteria

1. WHEN a Bursar uploads a CSV or XLSX file to `POST /api/finance/imports`, THE System SHALL create a `FinanceImportJob` row with `status = QUEUED` and return the job ID immediately, without waiting for processing to complete.
2. WHEN the import job processor handles a `PLAIN_LEDGER` job, THE System SHALL create one `LedgerEntry` row per valid data row, updating `StudentFinanceAccount.currentBalance` after each batch within a transaction.
3. WHEN the import job processor handles an `OPENING_BALANCE` job, THE System SHALL create one `OPENING_BALANCE` `LedgerEntry` per student, updating `StudentFinanceAccount.currentBalance`.
4. WHEN a row in the import file fails validation (e.g. unknown student, invalid amount), THE System SHALL record the row number, column values, and error reason in `FinanceImportJob.errorReport` and continue processing remaining rows.
5. WHEN all rows have been processed, THE System SHALL set `FinanceImportJob.status` to `COMPLETED` (if succeeded > 0) or `FAILED` (if succeeded = 0), and record final `totalRows`, `succeeded`, and `failed` counts.
6. THE System SHALL provide a downloadable CSV template at `GET /api/finance/imports/template/[importType]` containing the required column headers and one example row.

---

### Requirement 15 — Full School Ledger View

**User Story:** As a Bursar or Principal, I want to view the complete school ledger with filtering and sorting so that I can audit and investigate any transaction.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/finance/ledger`, THE System SHALL return a paginated list of `LedgerEntry` rows scoped to `caller.schoolId`, ordered by `postedAt` descending by default.
2. THE System SHALL support query parameters: `studentId`, `termId`, `entryType`, `fromDate`, `toDate`, `isVoided`, `page`, and `pageSize` (default 50, max 200).
3. THE System SHALL include student `fullName` and `admissionNumber`, term `name`, and Bursar `fullName` in each row's response payload, resolving them via Prisma `include` rather than raw SQL joins.
4. WHEN `isVoided = true` entries are included in the response, THE System SHALL annotate each with a `voided: true` flag in the JSON; they SHALL NOT be excluded from the ledger total, and the correction entry's `referenceId` SHALL link back to the voided entry.

---

### Requirement 16 — Individual Student Ledger

**User Story:** As a Bursar or Principal, I want to view an individual student's itemised ledger, invoices, payments, and running balance so that I can answer parent queries accurately.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/finance/students/[studentId]/ledger`, THE System SHALL return all `LedgerEntry` rows for that student scoped to `caller.schoolId`, ordered by `postedAt` ascending, each annotated with a running balance computed from the first row onward.
2. THE System SHALL also return the student's `Invoice` list, `Payment` list, and current `StudentFinanceAccount` summary in the same response.
3. IF the student does not belong to `caller.schoolId`, THEN THE System SHALL return HTTP 404.

---

### Requirement 17 — Bursar Dashboard

**User Story:** As a Bursar, I want a dashboard showing summary cards, recent activity, and unread notifications so that I can quickly see the school's current financial status.

#### Acceptance Criteria

1. THE System SHALL render a `/staff/finance` page accessible only to users with `role = BURSAR` OR `role = ADMIN_STAFF` with `FEES.canView` permission OR `role = PRINCIPAL`.
2. THE System SHALL display summary cards on the dashboard: total invoiced this term, total collected this term, total outstanding, and current debtor count.
3. THE System SHALL display a list of the 10 most recent `LedgerEntry` rows for the school, with student name, entry type, amount, and time elapsed.
4. THE System SHALL display unread `FinanceNotification` rows as a notification feed, with a count badge.
5. WHEN a notification is clicked, THE System SHALL mark it as `isRead = true` via `PATCH /api/finance/notifications/[id]/read`.

---

### Requirement 18 — Principal Finance View

**User Story:** As a Principal, I want read-only access to finance analytics and the debtors list so that I can oversee the school's financial health without accidental writes.

#### Acceptance Criteria

1. THE System SHALL render a `/principal/finance` page accessible only to users with `role = PRINCIPAL`.
2. THE System SHALL display the same analytics charts and summary cards as the Bursar dashboard.
3. THE System SHALL display the debtors list with student name, class, balance, and days overdue.
4. THE System SHALL NOT render any write actions (post payment, create invoice, configure settings) on the Principal finance view; all such controls SHALL be absent from the component tree, not merely hidden via CSS.

---

### Requirement 19 — Student Finance List with "Finance Pending" Badge

**User Story:** As a Bursar, I want to see a searchable student list that highlights students whose finance setup is incomplete so that I can prioritise onboarding them.

#### Acceptance Criteria

1. THE System SHALL render a `/staff/finance/students` page displaying all non-archived students for the school with columns: name, admission number, class, current balance, and finance status.
2. WHILE `StudentFinanceAccount.financeSetupCompletedAt` is null for a student, THE System SHALL display a "Finance Pending" badge on that student's row.
3. THE System SHALL support free-text search by `fullName`, `admissionNumber`, and class name.
4. THE System SHALL support filter combinations: balance threshold (greater than, less than, between), class/form, and stream — combinable in a single query.
5. WHEN the search or filter query changes, THE System SHALL debounce the API call by 300 ms before dispatching to `/api/finance/students`.

---

### Requirement 20 — API Authorization Guards

**User Story:** As a security engineer, I want every finance API route to enforce role and permission checks so that unauthorised users cannot read or modify financial data.

#### Acceptance Criteria

1. WHEN any finance API route is called, THE System SHALL invoke `requireSchoolRole("PRINCIPAL", "BURSAR")` OR `requireSchoolPermission("FEES", "<action>")` as the first operation, before any Zod parsing or database access.
2. IF the caller is not authenticated or does not belong to a school, THEN THE System SHALL return HTTP 401 with `{ "error": "Unauthorized." }`.
3. IF the caller is authenticated but lacks the required role or permission, THEN THE System SHALL return HTTP 403 with `{ "error": "Forbidden." }`.
4. THE System SHALL scope all database queries to `caller.schoolId` and SHALL NOT accept a `schoolId` parameter from the request body or query string for any sensitive data operation.
5. THE webhook endpoint (`/api/finance/mpesa/webhook/[webhookToken]`) is the only finance route exempt from session-cookie authentication; it SHALL authenticate solely via HMAC signature validation.

---

### Requirement 21 — UI Routing and Page Shell

**User Story:** As a developer, I want all finance UI pages to be under the correct routing segments with appropriate layout guards so that navigation and auth enforcement are consistent with the rest of Bidii.

#### Acceptance Criteria

1. THE System SHALL create all Bursar-facing finance pages under the `/staff/finance` route segment, using a layout file that enforces `role = BURSAR | ADMIN_STAFF | PRINCIPAL` before rendering.
2. THE System SHALL create the Principal finance page at `/principal/finance`, using the existing `/principal/layout.tsx` guard.
3. THE System SHALL add navigation links to the finance section in the existing staff and principal layout navigation menus.
4. WHEN a user navigates to any finance sub-page without the required role, THE System SHALL redirect to the appropriate dashboard root rather than rendering a blank or error page.

---

### Requirement 22 — Zod Validation and Error Handling

**User Story:** As a developer, I want all finance API inputs validated with Zod schemas so that invalid data is rejected with clear error messages before reaching the database.

#### Acceptance Criteria

1. THE System SHALL define a Zod schema for every finance API route that accepts a request body, covering all required fields, their types, and their constraints (e.g. positive Decimal, valid enum value, non-empty string).
2. WHEN Zod validation fails, THE System SHALL return HTTP 400 with `{ "error": "<first validation error message>" }`, matching the existing API error format used throughout Bidii.
3. THE System SHALL use `z.string().trim()` for all string fields to prevent whitespace-only values from passing validation.
4. IF a `prisma.$transaction` throws a Prisma `P2002` (unique constraint) error, THEN THE System SHALL return HTTP 409 with a human-readable conflict message rather than propagating the raw Prisma error.
5. IF a `prisma.$transaction` throws any other unexpected error, THEN THE System SHALL log the error server-side via `console.error` and return HTTP 500 with `{ "error": "An unexpected error occurred." }`.
