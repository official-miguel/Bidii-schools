# Design Document

## Bidii System Pilot-Readiness Hardening Pass

---

## Overview

This document describes the architecture and implementation plan for the
pilot-readiness hardening pass of the Bidii School Management System. The
work consists of eight concern areas â€” all changes are **strictly contained to
existing modules**: no new database tables, no new API routes, no schema
migrations.  The principal constraint is that every change must leave the
existing runtime behaviour intact while fixing bugs, tightening security, and
removing technical debt.

The application is a **Next.js 14 App Router** project written in TypeScript,
using Prisma (Supabase Postgres), bcrypt, Zod, and Tailwind.  All API routes
are Next.js Route Handlers; all server-rendered pages are React Server
Components.

---

## Architecture

### Component Map

```
src/
â”œâ”€â”€ lib/
â”‚   â”œâ”€â”€ auth.ts            â† session management, getCurrentUser, requireRole
â”‚   â””â”€â”€ prisma.ts          â† singleton PrismaClient (log config fix here)
â”œâ”€â”€ app/
â”‚   â””â”€â”€ api/
â”‚       â””â”€â”€ auth/
â”‚           â”œâ”€â”€ health/route.ts         â† security hardening + type fix
â”‚           â”œâ”€â”€ login/route.ts          â† maxAge constant fix
â”‚           â””â”€â”€ change-password/route.ts â† confirmPassword + maxAge fix
â””â”€â”€ components/
    â””â”€â”€ dashboard/
        â””â”€â”€ UnifiedDashboard.tsx        â† DayRange fix + any-cast removal
```

All other files touched during this pass fall under **dead-code / any-cast
cleanup** (Requirement 6 and 7) and follow the same in-place edit pattern.

### Dependency Flow

```
getCurrentUser (auth.ts)
        â”‚
        â–¼
HealthRoute  â†â”€â”€ adds SUPER_ADMIN guard on top of existing getCurrentUser
LoginRoute   â†â”€â”€ SESSION_TTL_MS already imported; just replace literal maxAge
ChangePasswordRoute â†â”€â”€ adds confirmPassword field + SESSION_TTL_MS maxAge

PrismaClient (prisma.ts) â†â”€â”€ add "warn" to dev log array

UnifiedDashboard (fetchSchoolOverview) â†â”€â”€ DayRange replaces exact equality
                          (fetchHODData)      â†â”€â”€ prisma typed directly, no any cast
```

No circular dependencies are introduced.  No new interfaces cross module
boundaries except `SchemaWithConfirmPassword` (internal to the route file).

---

## Components

### 1. HealthRoute â€” Type Fix + Security Hardening

**File:** `src/app/api/auth/health/route.ts`

#### 1a. Type Fix (Requirement 1)

The root cause of the `TS2698` spread errors is that TypeScript infers
`diagnostics.checks` as the widened `{}` type from the initialiser literal,
which does not satisfy the constraint required by the object spread operator.

**Fix:** Add an explicit inline type annotation to the `diagnostics`
variable declaration so the compiler knows `checks` is
`Record<string, unknown>`.

```typescript
const diagnostics: {
  timestamp:     string;
  checks:        Record<string, unknown>;
  overallStatus?: string;
} = {
  timestamp: new Date().toISOString(),
  checks:    {},
};
```

All subsequent `diagnostics.checks = { ...diagnostics.checks, key: value }`
assignments then satisfy `TS2698` because both the target and the source are
typed as `Record<string, unknown>`.

#### 1b. Security Hardening (Requirement 2)

**Before:** The endpoint was entirely public.

**After:**

```
GET /api/auth/health
  â”œâ”€ getCurrentUser() â†’ null          â†’ 401 Unauthorized
  â”œâ”€ user.role â‰  SUPER_ADMIN          â†’ 403 Forbidden
  â””â”€ user.role === SUPER_ADMIN        â†’ run diagnostic checks â†’ 200 OK
```

Implementation uses the **existing** `getCurrentUser` helper from
`src/lib/auth.ts` â€” the same pattern used by every other protected route.
`requireRole` is not used here because the route needs to distinguish 401
(no session) from 403 (wrong role) explicitly.

```typescript
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  // ... diagnostics ...
}
```

#### 1c. Remove Hardcoded Hash (Requirement 2.4)

The static bcrypt hash string `"$2b$12$LQv3..."` is removed.  The bcrypt
check generates a fresh hash at request time:

```typescript
import { hashPassword, verifyPassword } from "@/lib/auth";

// inside the bcrypt check block:
const testHash   = await hashPassword("password");
const testResult = await verifyPassword("password", testHash);
```

This eliminates a credential-like artefact from source control while still
exercising the bcrypt code path.

---

### 2. ChangePasswordRoute â€” confirmPassword + maxAge (Requirements 3 & 5)

**File:** `src/app/api/auth/change-password/route.ts`

#### 2a. confirmPassword Validation (Requirement 3)

The Zod schema is extended with a `confirmPassword` field and a
`.superRefine()` cross-field check:

```typescript
const schema = z.object({
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters.")
    .regex(/[A-Z]/, "Include at least one uppercase letter.")
    .regex(/[0-9]/, "Include at least one number."),
  confirmPassword: z.string(),
}).superRefine((data, ctx) => {
  if (data.newPassword !== data.confirmPassword) {
    ctx.addIssue({
      code:    z.ZodIssueCode.custom,
      message: "Passwords do not match.",
      path:    ["confirmPassword"],
    });
  }
});
```

The `.superRefine()` approach (versus `.refine()`) is chosen because it
supports attaching the error to the specific `confirmPassword` path, giving
the client a structured error response.

If `confirmPassword` is absent from the body, Zod's type coercion returns
`undefined`, which fails the `z.string()` parse with a standard type-error
message â€” satisfying Requirement 3.3 without additional code.

No password hashing occurs before the schema validation resolves.

#### 2b. maxAge Constant (Requirement 5)

```typescript
import { SESSION_TTL_MS } from "@/lib/auth";

res.cookies.set(SESSION_COOKIE, newToken, {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "lax",
  path:     "/",
  maxAge:   Math.floor(SESSION_TTL_MS / 1000),  // was: 60 * 60 * 24 * 7
});
```

---

### 3. LoginRoute â€” maxAge Constant (Requirement 5)

**File:** `src/app/api/auth/login/route.ts`

`SESSION_TTL_MS` is imported (it is already re-exported from `auth.ts`) and
the hardcoded `60 * 60 * 24 * 7` literal is replaced:

```typescript
import { SESSION_TTL_MS } from "@/lib/auth";

// cookie set call:
maxAge: Math.floor(SESSION_TTL_MS / 1000),
```

---

### 4. UnifiedDashboard â€” DayRange Fix (Requirement 4)

**File:** `src/components/dashboard/UnifiedDashboard.tsx`

#### Problem

`fetchSchoolOverview` currently passes `date: today` (an exact `Date` object
set at request time, e.g., `2025-07-14T09:23:45.123Z`) to Prisma's `where`
clause.  Because `Attendance.date` is stored as a calendar date (midnight UTC),
no attendance record ever matches this exact timestamp, so `todayAbsences`
always returns `0` after the first few milliseconds of the day.

#### Fix â€” DayRange Construction

```typescript
async function fetchSchoolOverview(schoolId: string, today: Date) {
  // Build a UTC day range: [startOfDay, startOfNextDay)
  const startOfDay = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  ));                                              // 2025-07-14T00:00:00.000Z
  const startOfNextDay = new Date(startOfDay.getTime() + 86_400_000); // +24 h

  // ...
  prisma.attendance.count({
    where: {
      schoolId,
      date:   { gte: startOfDay, lt: startOfNextDay },
      status: "ABSENT",
    },
  }),
  // ...
}
```

`Date.UTC` ensures correctness regardless of the server's local timezone.
The same `startOfDay` / `startOfNextDay` pair is reused for all attendance
queries within the function.

#### any-cast Removal in fetchHODData (Requirement 7)

The `const db = prisma as any` cast is removed.  All model access calls use
`prisma` directly.  The three models accessed through `db` that were not in
the standard generated client (`assessmentFramework`, `assessmentPeriod`,
`paper`, `classSubjectTeacher`) are accessed via `prisma` with explicit return
types:

```typescript
// Before:
const db = prisma as any;
const currentFramework = await db.assessmentFramework.findFirst(...) as { id: string } | null;

// After:
const currentFramework = await prisma.assessmentFramework.findFirst({
  where:  { schoolId, isActive: true, type: "EIGHT_FOUR_FOUR" },
  select: { id: true },
});
// Return type is inferred by Prisma as { id: string } | null â€” no cast needed.
```

---

### 5. PrismaClient â€” Dev Log Level (Requirement 8)

**File:** `src/lib/prisma.ts`

```typescript
// Before:
log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],

// After:
log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
```

Only the `log` array is modified.  The datasource URL builder, pool
configuration, and global singleton pattern are untouched.

---

### 6. Dead Code Cleanup (Requirement 6)

**Pattern:** For each file identified in the audit:

1. Remove unused `import { X }` entries where `X` is never referenced.
2. Remove unused `const ref = useRef(...)` declarations.
3. Remove stale comment blocks in pages that contain only a redirect.

The changes are purely subtractive â€” no logic is altered.  Files affected
include (non-exhaustive, to be confirmed during implementation):

- API routes that import `requireRole` / `requireSchoolRole` but never call them
- Super-admin page components that import unused Lucide icons
- `src/app/signup/page.tsx` â€” comment blocks describing removed functionality

---

### 7. `any` Cast Elimination (Requirement 7)

For super-admin pages that cast API response elements to `any`, each page
receives a named interface co-located at the top of the file:

```typescript
// Example pattern for a student list page:
interface StudentRow {
  id:       string;
  fullName: string;
  admNo:    string;
  classId:  string | null;
}

// Before:
.map((s: any) => ...)

// After:
.map((s: StudentRow) => ...)
```

`// eslint-disable-next-line @typescript-eslint/no-explicit-any` suppression
comments are removed alongside the `any` casts they suppress.

---

## Data Models

No schema changes.  All existing Prisma models (`User`, `Session`,
`Attendance`, `AssessmentFramework`, `AssessmentPeriod`, `Paper`,
`ClassSubjectTeacher`) are used as-is.

### DayRange (logical type)

```typescript
/** Represents the half-open interval [startOfDay, startOfNextDay) for a UTC calendar day. */
type DayRange = {
  gte: Date;  // 00:00:00.000 UTC on the target day
  lt:  Date;  // 00:00:00.000 UTC on the following day
};
```

This type is **not exported**; it is a documentation construct describing the
shape used in Prisma `where` clauses.

---

## Interfaces

### Extended ChangePassword Schema (internal)

```typescript
// Internal to src/app/api/auth/change-password/route.ts
type ChangePasswordInput = {
  newPassword:     string;  // min 8, â‰¥1 upper, â‰¥1 digit
  confirmPassword: string;  // must equal newPassword
};
```

### Diagnostics Shape (internal)

```typescript
// Internal to src/app/api/auth/health/route.ts
type DiagnosticsShape = {
  timestamp:     string;
  checks:        Record<string, unknown>;
  overallStatus?: string;
};
```

---

## Error Handling

| Route | Scenario | Response |
|-------|----------|----------|
| `GET /api/auth/health` | No session cookie | 401 `{ error: "Unauthorized." }` |
| `GET /api/auth/health` | Valid session, role â‰  SUPER_ADMIN | 403 `{ error: "Forbidden." }` |
| `GET /api/auth/health` | DB unreachable inside check | 200 with per-check `âŒ` string (existing pattern) |
| `POST /api/auth/change-password` | `confirmPassword` absent | 400 Zod validation error |
| `POST /api/auth/change-password` | `newPassword â‰  confirmPassword` | 400 `"Passwords do not match."` |
| `POST /api/auth/change-password` | Not authenticated | 401 (existing) |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all
valid executions of a system â€” essentially, a formal statement about what the
system should do. Properties serve as the bridge between human-readable
specifications and machine-verifiable correctness guarantees.*

### Property 1: Unauthenticated health requests are rejected with 401

*For any* HTTP request to `GET /api/auth/health` that does not carry a valid
session cookie (absent, expired, or tampered), the HealthRoute SHALL return
HTTP 401 and SHALL NOT execute any diagnostic check.

**Validates: Requirements 2.1**

---

### Property 2: Non-SUPER_ADMIN sessions are rejected with 403

*For any* valid session whose associated user has a role other than
`SUPER_ADMIN` (e.g., `TEACHER`, `PRINCIPAL`, `ADMIN_STAFF`), a request to
`GET /api/auth/health` SHALL return HTTP 403 and SHALL NOT execute any
diagnostic check.

**Validates: Requirements 2.2**

---

### Property 3: Mismatched passwords are always rejected before hashing

*For any* request body where `newPassword` and `confirmPassword` are both
present but not equal to each other (regardless of individual field validity),
`POST /api/auth/change-password` SHALL return HTTP 400 with a human-readable
error message, and the `hashPassword` function SHALL NOT be called.

**Validates: Requirements 3.1, 3.2**

---

### Property 4: DayRange bounds are correct for any input date

*For any* `Date` value passed to `fetchSchoolOverview` as `today`, the
computed `startOfDay` SHALL equal midnight UTC of that calendar day
(`Date.UTC(year, month, day)`), and `startOfNextDay` SHALL equal
`startOfDay + 86_400_000 ms`.  The difference between `startOfNextDay` and
`startOfDay` SHALL always be exactly 86,400,000 milliseconds.

**Validates: Requirements 4.1, 4.2, 4.3**

---

### Property 5: Session cookie maxAge always equals floor(SESSION_TTL_MS / 1000)

*For any* value of `SESSION_TTL_MS`, every call site that sets the session
cookie (LoginRoute and ChangePasswordRoute) SHALL produce a `maxAge` value
equal to `Math.floor(SESSION_TTL_MS / 1000)`.  If `SESSION_TTL_MS` is
changed, all cookie `maxAge` values change proportionally without further
edits.

**Validates: Requirements 5.1, 5.2**

---

### Property 6: Prisma log level selection is determined solely by NODE_ENV

*For any* value of `NODE_ENV`, the PrismaClient `log` option SHALL contain
`"error"`.  When `NODE_ENV` equals `"development"`, the array SHALL also
contain `"warn"`.  When `NODE_ENV` does not equal `"development"`, the array
SHALL contain only `"error"`.  No other log levels are ever included.

**Validates: Requirements 8.1, 8.2**


---

### 8. Database Index Strategy (Requirement 9)

**File:** prisma/schema.prisma

Seven composite indexes are added across five models. Each index is chosen to cover the most-executed query in the module it serves.

#### Attendance indexes

`prisma
model Attendance {
  // ... existing fields and indexes ...
  @@index([schoolId, date, status])        // absentToday report + dashboard absent count
  @@index([schoolId, classId, date])       // class roster fetch + per-class stats groupBy
}
`

- [schoolId, date, status] — covers WHERE schoolId=? AND date BETWEEN ? AND ? AND status='ABSENT'. The existing [schoolId, date] index does not include status, so the planner must filter the result set in memory.
- [schoolId, classId, date] — covers the roster fetch WHERE schoolId=? AND classId=? AND date=?. The existing [classId, date] index is not prefixed by schoolId and is therefore not used when schoolId appears first in the where clause.

#### Student index

`prisma
model Student {
  // ... existing fields and indexes ...
  @@index([schoolId, classId, archivedAt])  // class roster (archivedAt IS NULL filter)
}
`

- Covers WHERE schoolId=? AND classId=? AND archivedAt IS NULL. The existing [classId] index does not include rchivedAt, so Postgres must recheck every student in the class to filter out archived ones.

#### LibraryBorrow indexes

`prisma
model LibraryBorrow {
  // ... existing fields and indexes ...
  @@index([schoolId, returnedAt])           // active borrows count
  @@index([schoolId, returnedAt, dueAt])    // overdue count
}
`

- [schoolId, returnedAt] — covers WHERE schoolId=? AND returnedAt IS NULL (COUNT of active borrows).
- [schoolId, returnedAt, dueAt] — covers WHERE schoolId=? AND returnedAt IS NULL AND dueAt < NOW() (overdue count). The leading eturnedAt IS NULL filter eliminates returned books before evaluating dueAt.

#### DisciplineRecord index

`prisma
model DisciplineRecord {
  // ... existing fields and indexes ...
  @@index([schoolId, status])               // unresolved discipline dashboard count
}
`

- Covers WHERE schoolId=? AND status IN ('OPEN','UNDER_REVIEW','ESCALATED'). The existing [schoolId, studentId] index is not useful for status-only queries.

#### AssessmentItem index

`prisma
model AssessmentItem {
  // ... existing fields and indexes ...
  @@index([schoolId, periodId, subjectId])  // department analytics subjectId IN (...)
}
`

- Covers WHERE schoolId=? AND periodId=? AND subjectId IN (?). The existing [subjectId, periodId] index is prefixed by subjectId, which is an IN list; the new index with schoolId first matches the query planner's leading-column preference when schoolId is always equality-filtered.

#### Migration

The migration file is named dd_performance_indexes. It contains only CREATE INDEX statements and no DROP, ALTER TABLE, or data-manipulation SQL, guaranteeing zero downtime and zero data risk when applied.
