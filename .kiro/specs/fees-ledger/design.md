# Design Document — Fees & Ledger Module

## Overview

The Fees & Ledger module adds school finance management to Bidii. It is built as a self-contained feature layer on top of the existing Next.js 14 App Router, Prisma 5, and Supabase Postgres foundation, sharing the existing auth guards, crypto utilities, messaging infrastructure, and RLS pattern without modifying them.

The core architectural bet is an **immutable, append-only ledger** backed by a **materialised balance cache** per student. Every monetary event — invoice, payment, adjustment, opening balance — is a `LedgerEntry`. Corrections are never edits; they are new offsetting rows. The `StudentFinanceAccount` summarises the ledger so UI reads are fast, but the ledger is always the source of truth and can be used to recompute the balance at any point.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router — RSC + Client Components)                     │
│  /staff/finance/*      /principal/finance                                   │
│  Zustand stores        Recharts       Zod (client-side pre-validation)      │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ fetch / SWR
┌────────────────────────────────▼────────────────────────────────────────────┐
│  Next.js API Routes  src/app/api/finance/**                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ enforceAuth │  │ requireModule│  │  Zod schemas │  │ assertSchoolMatch│ │
│  │ (existing)  │  │ Access(FEES) │  │  (per route) │  │  (existing)      │ │
│  └─────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
│                                                                             │
│  Shared Finance Library  src/lib/finance/                                   │
│  ledger.ts  balance.ts  invoicing.ts  proration.ts  debtor.ts               │
│  mpesa.ts   receipts.ts  imports/processor.ts  imports/columnMapper.ts      │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ prisma.$transaction + SET LOCAL RLS
┌────────────────────────────────▼────────────────────────────────────────────┐
│  Supabase Postgres (session pooler / PgBouncer)                             │
│  14 new finance models   Immutable LedgerEntry   Materialised balance        │
│  Row-Level Security on app.current_school_id                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Immutable ledger with materialised cache.** `LedgerEntry` rows are never updated or deleted. `StudentFinanceAccount.currentBalance` is updated atomically in the same transaction as every ledger write. If the cache ever diverges, `balance.ts:computeBalance()` can rebuild it from the ledger without data loss.

**SET LOCAL for PgBouncer-safe RLS.** Every finance transaction opens with `SET LOCAL app.current_school_id = ?`. The `LOCAL` scope means PgBouncer can reuse the connection after commit without the variable leaking to the next tenant's transaction.

**Synchronous imports for small files.** Files under 500 rows are processed in-request. Larger files are marked `QUEUED` and the client polls `/api/finance/imports/[id]`. No Redis or background queue required — a single Next.js route handles both the work and the status check.

**Levenshtein fuzzy matching for M-Pesa.** When a C2B callback's `rawAccountNumber` does not exactly match an admission number, the system computes edit distance against all admission numbers in the school and surfaces the closest match with a normalised confidence score (0–1). The Bursar resolves unmatched payments in the reconciliation queue.

---

## Component Breakdown

### Shared Finance Library (`src/lib/finance/`)

#### `ledger.ts` — `postLedgerEntry`

The single write path for all monetary events. Every caller uses this function; no route writes `LedgerEntry` directly.

```typescript
export interface LedgerPayload {
  schoolId:          string;
  studentId:         string;
  termId?:           string;
  entryType:         LedgerEntryType;
  amount:            Decimal;          // always positive
  description:       string;
  referenceId?:      string;
  referenceType?:    string;
  postedById:        string;
  mpesaTransactionId?: string;
  paymentMethod?:    PaymentMethod;
}

export async function postLedgerEntry(
  tx: PrismaTransactionClient,
  payload: LedgerPayload
): Promise<LedgerEntry> {
  // 1. SET LOCAL RLS variable (if not already set by outer transaction)
  await tx.$executeRaw`SET LOCAL app.current_school_id = ${payload.schoolId}`;

  // 2. Insert immutable LedgerEntry
  const entry = await tx.ledgerEntry.create({ data: { ...payload, isVoided: false } });

  // 3. Compute balance delta: PAYMENT and CREDIT_ADJUSTMENT increase balance,
  //    INVOICE, DEBIT_ADJUSTMENT, and OPENING_BALANCE decrease it.
  const delta = balanceDelta(payload.entryType, payload.amount);

  // 4. Update StudentFinanceAccount atomically
  await tx.studentFinanceAccount.update({
    where:  { schoolId_studentId: { schoolId: payload.schoolId, studentId: payload.studentId } },
    data: {
      currentBalance:  { increment: delta },
      totalInvoiced:   entryType === "INVOICE" ? { increment: payload.amount } : undefined,
      totalPaid:       entryType === "PAYMENT" ? { increment: payload.amount } : undefined,
      lastActivityAt:  new Date(),
    },
  });

  // 5. Trigger debtor flag recompute (inside same transaction)
  await recomputeDebtorFlag(tx, payload.schoolId, payload.studentId);

  return entry;
}
```

Balance delta rules:
- `PAYMENT`, `CREDIT_ADJUSTMENT`: `+amount` (credits)
- `INVOICE`, `DEBIT_ADJUSTMENT`, `OPENING_BALANCE`: `-amount` (debits)

#### `balance.ts` — `computeBalance`

Fallback recomputation from the ledger. Used for consistency checks and data recovery.

```typescript
export async function computeBalance(
  schoolId: string,
  studentId: string
): Promise<Decimal> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { schoolId, studentId, isVoided: false },
    select: { entryType: true, amount: true },
  });
  return entries.reduce((acc, e) => acc.add(balanceDelta(e.entryType, e.amount)), new Decimal(0));
}
```

#### `invoicing.ts` — `runBatchInvoicing`

Processes all non-archived students for a term. Each student is wrapped in its own transaction so one failure does not roll back others.

```typescript
export async function runBatchInvoicing(
  termId: string,
  schoolId: string,
  userId: string
): Promise<{ succeeded: number; skipped: number; errors: BatchError[] }>;
```

Per-student logic:
1. Check for existing `Invoice(studentId, termId)` → skip if found (idempotent).
2. Load student's `form`, `stream`, `boardingStatus`.
3. Select best-matching `FeeStructure` (see specificity rules below).
4. Sum all active `StudentExpenseAttachment.expenseItem.currentPrice` for the student.
5. Create `Invoice`, call `postLedgerEntry` with type `INVOICE`, create `FinanceNotification(INVOICE_GENERATED)`.
6. On no matching fee structure: record in error report, continue.

**Fee structure specificity** (most-specific match wins):
1. `form` + `stream` + `boardingStatus` (all three match)
2. `form` + `stream` + `boardingStatus = null`
3. `form` + `stream = null` + `boardingStatus` (exact boarding)
4. `form` + `stream = null` + `boardingStatus = null` (form only)

#### `proration.ts` — `computeProratedAmount`

```typescript
export function computeProratedAmount(
  term: { startDate: Date; endDate: Date },
  price: Decimal,
  today: Date = new Date()
): Decimal {
  const totalDays     = daysBetween(term.startDate, term.endDate);
  const remainingDays = daysBetween(today, term.endDate);
  if (totalDays <= 0) return new Decimal(0);
  return price.mul(remainingDays).div(totalDays).toDecimalPlaces(2);
}
```

#### `debtor.ts` — `recomputeDebtorFlag`

Called inside `postLedgerEntry` on every write. Also called by the daily cron job.

```typescript
export async function recomputeDebtorFlag(
  tx: PrismaTransactionClient,
  schoolId: string,
  studentId: string
): Promise<void> {
  const [account, settings] = await Promise.all([
    tx.studentFinanceAccount.findUnique({ where: { schoolId_studentId: { schoolId, studentId } } }),
    tx.financeSettings.findUnique({ where: { schoolId } }),
  ]);
  if (!account || !settings) return;

  const threshold = settings.balanceThreshold.negated(); // e.g. -500
  const isInDebt  = account.currentBalance.lessThan(threshold);
  const current   = await tx.debtorFlag.findFirst({ where: { schoolId, studentId, isCurrent: true } });

  if (isInDebt && !current) {
    await tx.debtorFlag.create({
      data: { schoolId, studentId, flaggedAt: new Date(), balanceAtFlag: account.currentBalance,
              daysOverdueAtFlag: 0, isCurrent: true },
    });
  } else if (!isInDebt && current) {
    await tx.debtorFlag.update({
      where: { id: current.id },
      data:  { isCurrent: false, unflaggedAt: new Date() },
    });
  }
}

export async function runDailyDebtorJob(): Promise<void>;
// Iterates all schools, all students with isCurrent=true DebtorFlag,
// recalculates daysOverdueAtFlag from oldest unpaid INVOICE entry date.
```

#### `mpesa.ts` — HMAC verification and admission number matching

```typescript
export function verifyHmac(secret: string, rawBody: string, signature: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function matchAdmissionNumber(
  admissionNumbers: string[],
  raw: string
): { admissionNumber: string; confidence: number } | null {
  // Exact match first
  if (admissionNumbers.includes(raw)) return { admissionNumber: raw, confidence: 1.0 };

  // Levenshtein closest match
  let best: { admissionNumber: string; distance: number } | null = null;
  for (const adm of admissionNumbers) {
    const d = levenshtein(raw, adm);
    if (!best || d < best.distance) best = { admissionNumber: adm, distance: d };
  }
  if (!best) return null;

  const maxLen    = Math.max(raw.length, best.admissionNumber.length);
  const confidence = maxLen === 0 ? 0 : 1 - best.distance / maxLen;
  return confidence > 0 ? { admissionNumber: best.admissionNumber, confidence } : null;
}
```

#### `receipts.ts` — `nextReceiptNumber`

```typescript
export async function nextReceiptNumber(
  tx: PrismaTransactionClient,
  schoolId: string,
  prefix: string
): Promise<string> {
  // Advisory lock on schoolId hash prevents concurrent gaps under high load
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}))`;

  const last = await tx.payment.findFirst({
    where:   { schoolId },
    orderBy: { receiptNumber: "desc" },
    select:  { receiptNumber: true },
  });

  const lastNum = last ? parseInt(last.receiptNumber.replace(prefix, ""), 10) : 0;
  const next    = isNaN(lastNum) ? 1 : lastNum + 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
}
```

`pg_advisory_xact_lock` is released automatically at transaction end, making it safe with PgBouncer's session pooler.

#### `imports/processor.ts`

Handles both CSV (via Node's built-in stream) and XLSX (via the `xlsx` npm package). Rows are processed in batches of 50 within a single transaction. On validation error, the row is recorded in `errorReport` and processing continues.

```typescript
export async function processImportJob(jobId: string): Promise<void>;
```

Column detection (via `imports/columnMapper.ts`) uses header normalisation — lowercased, whitespace-collapsed — to map flexible column names to canonical fields. Example: `"Admission No."`, `"admissionNumber"`, `"Adm #"` all map to `admissionNumber`.

---

## Data Models

### Prisma Schema Additions

#### New Enums

```prisma
enum LedgerEntryType {
  INVOICE
  PAYMENT
  CREDIT_ADJUSTMENT
  DEBIT_ADJUSTMENT
  OPENING_BALANCE
}

enum PaymentMethod {
  MPESA
  CASH
  BANK_TRANSFER
  CHEQUE
}

enum ReconciliationStatus {
  AUTO_MATCHED
  MANUAL_RECONCILED
  PENDING
}

enum MpesaQueueStatus {
  PENDING
  RESOLVED
  REJECTED
}

enum NotificationType {
  SETUP_REQUIRED
  REMINDER_SENT
  PAYMENT_RECEIVED
  INVOICE_GENERATED
  RECONCILIATION_NEEDED
}

enum FinanceImportType {
  PLAIN_LEDGER
  OPENING_BALANCE
}

enum FinanceImportStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
}
```

#### Existing Enum Extensions

```prisma
// Add to Role enum (after ADMIN_STAFF):
BURSAR

// Add to Module enum:
FEES  /// Finance/Fees module — Bursar access to the full Fees & Ledger feature

// Add to IntegrationProvider enum:
MPESA_DARAJA
```

#### New Models (in dependency order)

```prisma
/// School-level finance configuration — one row per school.
model FinanceSettings {
  schoolId              String   @id
  balanceThreshold      Decimal  @default(0)
  daysOverdueThreshold  Int      @default(30)
  receiptPrefix         String   @default("REC-")
  invoicePrefix         String   @default("INV-")
  mpesaPaybillNumber    String?
  /// AES-256-GCM encrypted via crypto.ts — never stored in plaintext
  mpesaWebhookSecret    String?
  /// Stable UUID path component for the C2B webhook URL
  mpesaWebhookUrl       String?  @unique
  school                School   @relation(fields: [schoolId], references: [id])
}

model FeeStructure {
  id             String   @id @default(cuid())
  schoolId       String
  form           Int      // 1–4
  stream         String?  // null = all streams
  boardingStatus String?  // "DAY" | "BOARDING" | null = both
  amountPerTerm  Decimal
  createdById    String
  createdAt      DateTime @default(now())
  school         School   @relation(fields: [schoolId], references: [id])
  createdBy      User     @relation(fields: [createdById], references: [id])
  @@index([schoolId, form])
}

model ExpenseCategory {
  id          String        @id @default(cuid())
  schoolId    String
  name        String
  description String?
  icon        String?
  createdAt   DateTime      @default(now())
  school      School        @relation(fields: [schoolId], references: [id])
  items       ExpenseItem[]
  @@unique([schoolId, name])
}

model ExpenseItem {
  id           String                    @id @default(cuid())
  schoolId     String
  categoryId   String
  name         String
  description  String?
  currentPrice Decimal
  isActive     Boolean                   @default(true)
  createdAt    DateTime                  @default(now())
  updatedAt    DateTime                  @updatedAt
  school       School                    @relation(fields: [schoolId], references: [id])
  category     ExpenseCategory           @relation(fields: [categoryId], references: [id])
  attachments  StudentExpenseAttachment[]
}

model Term {
  id                   String    @id @default(cuid())
  schoolId             String
  name                 String
  academicYear         Int
  startDate            DateTime
  endDate              DateTime
  isActive             Boolean   @default(true)
  invoicingCompletedAt DateTime?
  createdById          String
  createdAt            DateTime  @default(now())
  school               School    @relation(fields: [schoolId], references: [id])
  createdBy            User      @relation(fields: [createdById], references: [id])
  ledgerEntries        LedgerEntry[]
  invoices             Invoice[]
  payments             Payment[]
  @@index([schoolId, academicYear])
}

/// Materialised per-student finance summary — one row per (school, student).
/// Updated atomically in the same transaction as every LedgerEntry write.
model StudentFinanceAccount {
  id                      String   @id @default(cuid())
  schoolId                String
  studentId               String
  currentBalance          Decimal  @default(0)
  totalInvoiced           Decimal  @default(0)
  totalPaid               Decimal  @default(0)
  lastActivityAt          DateTime @default(now())
  /// Null until the Bursar explicitly completes setup for this student.
  financeSetupCompletedAt DateTime?
  school                  School   @relation(fields: [schoolId], references: [id])
  student                 Student  @relation(fields: [studentId], references: [id])
  @@unique([schoolId, studentId])
  @@index([schoolId, currentBalance])
}

/// Immutable financial event log. Never updated or deleted.
/// Corrections are made via a new offsetting entry.
model LedgerEntry {
  id                 String          @id @default(cuid())
  schoolId           String
  studentId          String
  termId             String?
  entryType          LedgerEntryType
  /// Always stored as a positive number; sign implied by entryType.
  amount             Decimal
  description        String
  referenceId        String?
  referenceType      String?
  postedById         String
  postedAt           DateTime        @default(now())
  mpesaTransactionId String?         @unique
  paymentMethod      PaymentMethod?
  isVoided           Boolean         @default(false)
  school             School          @relation(fields: [schoolId], references: [id])
  student            Student         @relation(fields: [studentId], references: [id])
  term               Term?           @relation(fields: [termId], references: [id])
  postedBy           User            @relation(fields: [postedById], references: [id])
  @@index([schoolId, studentId, postedAt])
  @@index([schoolId, postedAt])
  @@index([mpesaTransactionId])
}

model Invoice {
  id            String   @id @default(cuid())
  schoolId      String
  studentId     String
  termId        String
  totalAmount   Decimal
  lineItems     Json
  invoiceNumber String
  isProrated    Boolean  @default(false)
  proratedDays  Int?
  generatedById String
  generatedAt   DateTime @default(now())
  school        School   @relation(fields: [schoolId], references: [id])
  student       Student  @relation(fields: [studentId], references: [id])
  term          Term     @relation(fields: [termId], references: [id])
  generatedBy   User     @relation(fields: [generatedById], references: [id])
  @@unique([schoolId, studentId, termId])
  @@index([schoolId, termId])
}

model Payment {
  id                   String               @id @default(cuid())
  schoolId             String
  studentId            String
  termId               String?
  amount               Decimal
  method               PaymentMethod
  mpesaTransactionId   String?              @unique
  mpesaRawPayload      Json?
  reference            String?
  receiptNumber        String
  paidAt               DateTime             @default(now())
  postedById           String
  reconciliationStatus ReconciliationStatus @default(PENDING)
  school               School               @relation(fields: [schoolId], references: [id])
  student              Student              @relation(fields: [studentId], references: [id])
  term                 Term?                @relation(fields: [termId], references: [id])
  postedBy             User                 @relation(fields: [postedById], references: [id])
  @@unique([schoolId, receiptNumber])
  @@index([schoolId, studentId, paidAt])
}

model StudentExpenseAttachment {
  id            String      @id @default(cuid())
  studentId     String
  expenseItemId String
  schoolId      String
  attachedAt    DateTime    @default(now())
  attachedById  String
  detachedAt    DateTime?
  detachedById  String?
  school        School      @relation(fields: [schoolId], references: [id])
  student       Student     @relation(fields: [studentId], references: [id])
  expenseItem   ExpenseItem @relation(fields: [expenseItemId], references: [id])
  attachedBy    User        @relation("AttachedBy", fields: [attachedById], references: [id])
  detachedBy    User?       @relation("DetachedBy", fields: [detachedById], references: [id])
  @@index([schoolId, studentId])
}

model MpesaReconciliationQueue {
  id                  String          @id @default(cuid())
  schoolId            String
  mpesaTransactionId  String          @unique
  rawAccountNumber    String
  amount              Decimal
  paidAt              DateTime
  rawPayload          Json
  suggestedStudentId  String?
  suggestedConfidence Float?
  status              MpesaQueueStatus @default(PENDING)
  resolvedById        String?
  resolvedAt          DateTime?
  resolvedStudentId   String?
  school              School           @relation(fields: [schoolId], references: [id])
  @@index([schoolId, status])
}

model DebtorFlag {
  id               String   @id @default(cuid())
  schoolId         String
  studentId        String
  flaggedAt        DateTime @default(now())
  balanceAtFlag    Decimal
  daysOverdueAtFlag Int     @default(0)
  isCurrent        Boolean  @default(true)
  unflaggedAt      DateTime?
  school           School   @relation(fields: [schoolId], references: [id])
  student          Student  @relation(fields: [studentId], references: [id])
  @@index([schoolId, isCurrent])
  @@index([schoolId, studentId])
}

model FinanceNotification {
  id        String           @id @default(cuid())
  schoolId  String
  studentId String?
  type      NotificationType
  message   String
  metadata  Json?
  isRead    Boolean          @default(false)
  createdAt DateTime         @default(now())
  school    School           @relation(fields: [schoolId], references: [id])
  student   Student?         @relation(fields: [studentId], references: [id])
  @@index([schoolId, isRead, createdAt])
}

model FinanceImportJob {
  id            String              @id @default(cuid())
  schoolId      String
  importType    FinanceImportType
  fileName      String
  columnMapping Json?
  status        FinanceImportStatus @default(QUEUED)
  totalRows     Int                 @default(0)
  succeeded     Int                 @default(0)
  failed        Int                 @default(0)
  errorReport   Json?
  createdById   String
  createdAt     DateTime            @default(now())
  school        School              @relation(fields: [schoolId], references: [id])
  createdBy     User                @relation(fields: [createdById], references: [id])
  @@index([schoolId, status])
}
```

### Back-Relations

Added to `School`:
```prisma
financeSettings          FinanceSettings?
feeStructures            FeeStructure[]
expenseCategories        ExpenseCategory[]
expenseItems             ExpenseItem[]
terms                    Term[]
studentFinanceAccounts   StudentFinanceAccount[]
ledgerEntries            LedgerEntry[]
invoices                 Invoice[]
payments                 Payment[]
expenseAttachments       StudentExpenseAttachment[]
mpesaQueue               MpesaReconciliationQueue[]
debtorFlags              DebtorFlag[]
financeNotifications     FinanceNotification[]
financeImportJobs        FinanceImportJob[]
```

Added to `Student`:
```prisma
financeAccount     StudentFinanceAccount?
ledgerEntries      LedgerEntry[]
invoices           Invoice[]
payments           Payment[]
expenseAttachments StudentExpenseAttachment[]
debtorFlags        DebtorFlag[]
financeNotifications FinanceNotification[]
```

---

## API Route Design

### Authorization Pattern

Every finance route (except the webhook) follows this exact pattern, matching the existing convention in `src/lib/apiAuth.ts`:

```typescript
export async function GET(req: NextRequest) {
  const auth = await enforceAuth();
  if (auth.error) return auth.error;

  // For write operations:
  const permError = await requireModuleAccess(auth.user, "FEES", "create");
  if (permError) return permError;

  // BURSAR role gets implicit FEES access — handled in requireModuleAccess
  // by checking user.role === "BURSAR" before the permission lookup.
  const { user, schoolId } = auth;
  // ... Zod parse, DB access, always using schoolId from auth
}
```

`requireModuleAccess` will be extended to short-circuit for `role === "BURSAR"` the same way it does for `role === "PRINCIPAL"`.

### Webhook Route (Public — HMAC-only)

```typescript
// POST /api/finance/mpesa/webhook/[webhookToken]
// No session cookie. Auth is the HMAC signature only.
export async function POST(req: NextRequest, { params }: { params: { webhookToken: string } }) {
  const school = await prisma.financeSettings.findFirst({
    where: { mpesaWebhookUrl: { endsWith: params.webhookToken } },
    select: { schoolId: true, mpesaWebhookSecret: true },
  });
  if (!school?.mpesaWebhookSecret) return NextResponse.json({}, { status: 401 });

  const rawBody  = await req.text();
  const sig      = req.headers.get("x-mpesa-signature") ?? "";
  const secret   = decryptSecret(school.mpesaWebhookSecret);
  if (!verifyHmac(secret, rawBody, sig)) return NextResponse.json({}, { status: 401 });
  // ... idempotency check, matching, routing
  return NextResponse.json({ ResultCode: 0 }); // always 200 after HMAC passes
}
```

### Zod Schemas (representative)

```typescript
// src/app/api/finance/payments/schema.ts
export const createPaymentSchema = z.object({
  studentId:  z.string().trim().min(1),
  termId:     z.string().trim().optional(),
  amount:     z.number().positive("Amount must be greater than zero."),
  method:     z.enum(["CASH", "BANK_TRANSFER", "CHEQUE"]),
  reference:  z.string().trim().optional(),
  paidAt:     z.string().datetime().optional(),
});

// src/app/api/finance/fee-structures/schema.ts
export const createFeeStructureSchema = z.object({
  form:          z.number().int().min(1).max(4),
  stream:        z.string().trim().optional(),
  boardingStatus: z.enum(["DAY", "BOARDING"]).optional(),
  amountPerTerm: z.number().positive(),
});
```

All string fields use `z.string().trim()` to reject whitespace-only values. Decimal fields from the DB are serialised as strings in JSON responses to avoid floating-point precision loss.

### Error Response Contract

Matches the existing Bidii API convention:

| Condition | Status | Body |
|---|---|---|
| Not authenticated | 401 | `{ "error": "Unauthorized" }` |
| Wrong role/permission | 403 | `{ "error": "Forbidden." }` |
| Zod validation failure | 400 | `{ "error": "<first error message>" }` |
| Prisma P2002 unique violation | 409 | `{ "error": "<human-readable conflict>" }` |
| Resource not found or wrong school | 404 | `{ "error": "Not found." }` |
| No DELETE on FeeStructure | 405 | `{ "error": "Fee structures cannot be deleted." }` |
| Unexpected error | 500 | `{ "error": "An unexpected error occurred." }` |

---

## UI Pages

### Layout (`src/app/staff/finance/layout.tsx`)

Server Component. Calls `enforceAuth()` + checks for `BURSAR`, `PRINCIPAL`, or `ADMIN_STAFF` with `FEES.canView`. Redirects to `/staff` if access is denied. Renders the sidebar navigation with links to all finance sub-pages.

### Dashboard (`/staff/finance/page.tsx`)

Fetches four summary cards (totalInvoiced, totalCollected, totalOutstanding, debtorCount for the active term), the 10 most recent `LedgerEntry` rows, and unread `FinanceNotification` rows. All data fetched server-side via direct Prisma calls in the RSC; the notification feed is a Client Component with optimistic mark-as-read.

### Student List (`/staff/finance/students/page.tsx`)

Client Component with a Zustand store for filter state. Debounces search by 300ms before calling `/api/finance/students`. Renders a table with a "Finance Pending" badge (yellow dot) for students where `financeSetupCompletedAt` is null. Supports filters: balance threshold range, form/class, stream.

### Individual Student Ledger (`/staff/finance/students/[studentId]/page.tsx`)

Fetches the full ledger with running balance, invoice list, payment list, and `StudentFinanceAccount` summary. Running balance is computed server-side in the API route — each row annotated with cumulative balance. Renders a `LedgerTable` component with entries in ascending chronological order and a summary row at the bottom.

### Reconciliation (`/staff/finance/reconciliation/page.tsx`)

Lists `MpesaReconciliationQueue` rows with `status = PENDING`. Each row shows the raw account number, suggested student match with confidence percentage, and amount. Resolve and reject actions are inline with optimistic UI updates.

### Reports (`/staff/finance/reports/page.tsx`)

Four Recharts charts:
- **Payment Volume** — `BarChart` of daily/weekly payment totals
- **Class Collection Rate** — `BarChart` per class
- **Summary Cards** — collection rate, outstanding total
- **Aging Table** — server-side rendered, paginated

### Principal Finance View (`/app/principal/finance/page.tsx`)

Read-only. Renders the same analytics components as the Bursar dashboard but imports them without write-action props. The component tree never contains payment forms, settings forms, or reconciliation actions — they are not rendered conditionally, they are simply absent from the import graph.

---

## New Student Integration

When `POST /api/students` creates a student, the existing transaction is extended:

```typescript
const student = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SET LOCAL app.current_school_id = ${schoolId}`;

  const student = await tx.student.create({ /* existing fields */ });

  // New: finance bootstrap
  await tx.studentFinanceAccount.create({
    data: {
      schoolId,
      studentId: student.id,
      currentBalance: 0,
      totalInvoiced:  0,
      totalPaid:      0,
    },
  });

  await tx.financeNotification.create({
    data: {
      schoolId,
      studentId: student.id,
      type:    "SETUP_REQUIRED",
      message: `Finance setup required for ${student.fullName} (${student.admissionNumber}).`,
    },
  });

  // existing: library card, dorm assignment...
  return student;
});
```

---

## Debtor Daily Job

`GET /api/finance/jobs/debtor-refresh` — protected by `Authorization: Bearer ${process.env.CRON_SECRET}`. Returns `{ updated: number }`. Callable from Vercel Cron (`vercel.json` cron entry) or any external scheduler. Internally delegates to `runDailyDebtorJob()`.

---

## Import Processing Flow

```
POST /api/finance/imports
  → validate file (CSV or XLSX, max 10 MB)
  → create FinanceImportJob (status=QUEUED)
  → if rows < 500: process synchronously, return completed job
  → else: return job ID, client polls GET /api/finance/imports/[id]

Background poll:
  GET /api/finance/imports/[id]
  → returns current status + progress counts
  → 200 until COMPLETED or FAILED
```

The processor uses `xlsx` for Excel and Node's built-in `readline` for CSV. Both paths funnel into the same row-level validation and `postLedgerEntry` call.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: BURSAR role is auth-equivalent to ADMIN_STAFF

*For any* API request where the user has `role = BURSAR`, the authentication and school-scoping outcome SHALL be identical to a user with `role = ADMIN_STAFF` — both are granted access to the same routes and both have their `schoolId` bound from the session.

**Validates: Requirements 1.3, 1.4**

---

### Property 2: Ledger balance invariant

*For any* sequence of `postLedgerEntry` calls for a student, the `StudentFinanceAccount.currentBalance` SHALL equal the sum of all non-voided `LedgerEntry` amounts with their respective sign deltas (credits positive, debits negative) at every point in time — the materialised cache is always consistent with the ledger.

**Validates: Requirements 2.17, 9.1**

---

### Property 3: Webhook secret is never stored in plaintext

*For any* call to `POST /api/finance/settings` that includes a `mpesaWebhookSecret`, the value stored in the `FinanceSettings` row in the database SHALL NOT equal the plaintext value submitted — it SHALL be the AES-256-GCM encrypted form produced by `crypto.ts:encryptSecret`.

**Validates: Requirements 4.2**

---

### Property 4: Fee structure specificity — most-specific match wins

*For any* student with a given `(form, stream, boardingStatus)` and any set of `FeeStructure` rows for the school, the invoicing engine SHALL select the single most-specific matching structure, where specificity is determined first by `stream` match (non-null beats null) then by `boardingStatus` match (non-null beats null), with `form` always being an exact match requirement.

**Validates: Requirements 5.5, 7.3**

---

### Property 5: Proration formula correctness

*For any* term with a valid `startDate` and `endDate` and any attachment date between those dates, `computeProratedAmount(term, price, today)` SHALL return `(daysBetween(today, endDate) / daysBetween(startDate, endDate)) × price`, rounded to two decimal places, and SHALL return 0 when `today >= endDate`.

**Validates: Requirements 6.4, 7.6**

---

### Property 6: Batch invoicing idempotency

*For any* student who already has an `Invoice` row for a given `termId`, running the batch invoicing job for that term again SHALL produce no additional `Invoice` rows, no additional `LedgerEntry` rows, and no change to `StudentFinanceAccount.currentBalance` for that student.

**Validates: Requirements 7.4**

---

### Property 7: Receipt numbers are unique and sequential within a school

*For any* sequence of payment posts (including concurrent requests) within a school, all generated `receiptNumber` values SHALL be unique within that school. The numeric suffix SHALL be strictly increasing with no gaps when posted sequentially.

**Validates: Requirements 9.2**

---

### Property 8: HMAC gating — valid signatures pass, invalid signatures are rejected

*For any* C2B webhook request where the HMAC-SHA256 signature computed from the raw body using the school's decrypted `mpesaWebhookSecret` matches the `x-mpesa-signature` header, the request SHALL be processed. *For any* request where the signature does not match, the system SHALL return HTTP 401 and create no rows.

**Validates: Requirements 10.1, 10.2**

---

### Property 9: M-Pesa webhook idempotency

*For any* `mpesaTransactionId` that is already present in either `LedgerEntry.mpesaTransactionId` or `MpesaReconciliationQueue.mpesaTransactionId`, a subsequent C2B callback carrying the same ID SHALL return HTTP 200 without creating any new rows in any table.

**Validates: Requirements 10.3**

---

### Property 10: Debtor flag lifecycle consistency

*For any* student whose `currentBalance` is strictly less than the negation of `FinanceSettings.balanceThreshold` immediately after a `LedgerEntry` write, the student SHALL have exactly one `DebtorFlag` row with `isCurrent = true`. *For any* student whose `currentBalance` is greater than or equal to the negation of the threshold, no `DebtorFlag` row with `isCurrent = true` SHALL exist for that student.

**Validates: Requirements 12.1, 12.2, 12.3**

---

### Property 11: All finance data is scoped to the caller's school

*For any* finance API route (reports, ledger, students, payments, reconciliation), the set of rows returned SHALL contain only rows whose `schoolId` equals `caller.schoolId` derived from the authenticated session — no row from a different school's data SHALL appear in any response, regardless of query parameters.

**Validates: Requirements 3.3, 13.5, 15.1, 20.4**

---

### Property 12: Import job processes valid rows independently of invalid rows

*For any* import file containing a mix of valid and invalid rows, the `FinanceImportJob` processor SHALL create `LedgerEntry` rows for all valid rows and SHALL record all invalid rows (with row number, values, and error reason) in `errorReport`, completing with `status = COMPLETED` if any rows succeeded and `status = FAILED` only if zero rows succeeded — the failure of one row SHALL NOT prevent processing of subsequent rows.

**Validates: Requirements 14.4, 14.5**
