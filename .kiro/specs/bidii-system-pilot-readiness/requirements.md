# Requirements Document

## Introduction

This document specifies the pilot-readiness hardening pass for the Bidii School
Management System (Next.js 14, TypeScript, Prisma, Supabase Postgres, bcrypt, Zod,
Tailwind). The pass covers five concern areas:

1. **Build-breaking TypeScript errors** â€” spread-type errors in the health endpoint.
2. **Dead code cleanup** â€” unused imports and variables across ~40+ files.
3. **Type safety** â€” replacement of `any` casts with precise types.
4. **Correctness bugs** â€” date-range queries, session cookie `maxAge`, missing
   `confirmPassword` validation, and the unprotected / hardcoded-hash health endpoint.
5. **Performance** â€” Prisma dev logging missing the `"warn"` level.

All changes must leave existing runtime behaviour and the database schema unchanged.
The build must reach zero TypeScript errors before any other work proceeds.

---

## Glossary

- **System**: The Bidii School Management System Next.js application.
- **HealthRoute**: The API route at `GET /api/auth/health`.
- **ChangePasswordRoute**: The API route at `POST /api/auth/change-password`.
- **LoginRoute**: The API route at `POST /api/auth/login`.
- **LogoutRoute**: The API route at `POST /api/auth/logout`.
- **UnifiedDashboard**: The React Server Component at
  `src/components/dashboard/UnifiedDashboard.tsx`.
- **PrismaClient**: The singleton Prisma client exported from `src/lib/prisma.ts`.
- **SESSION_TTL_MS**: The numeric constant exported from `src/lib/auth.ts` that
  holds the session lifetime in milliseconds (7 days).
- **SUPER_ADMIN**: The application role whose holders are the only users permitted
  to call the HealthRoute.
- **DiagnosticsRecord**: The `checks` property of the diagnostics object built
  inside the HealthRoute.
- **fetchSchoolOverview**: The private async function in UnifiedDashboard that
  queries school-wide metrics.
- **DayRange**: A pair `{ gte: Date, lt: Date }` representing the start
  (inclusive, 00:00:00.000) and end (exclusive, 00:00:00.000 of the next day) of
  a calendar day in UTC, used in Prisma `where` clauses.
- **Dead Symbol**: Any imported identifier or declared variable that is never
  referenced in the file after the import/declaration statement.

---

## Requirements

### Requirement 1 â€” Fix Build-Breaking TypeScript Errors

**User Story:** As a developer, I want the project to compile without TypeScript
errors, so that CI passes and the build can be deployed.

#### Acceptance Criteria

1. THE System SHALL compile with zero TypeScript errors when `tsc --noEmit` is
   executed against the project.

2. WHEN the TypeScript compiler evaluates `diagnostics.checks`, THE HealthRoute
   SHALL declare `checks` as `Record<string, unknown>` so that spread operations
   (`{ ...diagnostics.checks, key: value }`) satisfy the `TS2698` constraint.

3. THE HealthRoute SHALL initialise the `diagnostics` variable with an explicit
   inline type annotation of `{ timestamp: string; checks: Record<string, unknown>;
   overallStatus?: string }` rather than relying on widened inference.

4. WHEN a spread assignment adds a key to `diagnostics.checks`, THE HealthRoute
   SHALL assign the spread result back to `diagnostics.checks` (typed as
   `Record<string, unknown>`), not to the outer `diagnostics` object.

---

### Requirement 2 â€” Secure the Health Endpoint

**User Story:** As a system administrator, I want the health endpoint to reject
unauthenticated and non-super-admin callers, so that internal diagnostics and
credential hashes are not exposed to unauthorised users.

#### Acceptance Criteria

1. WHEN a request arrives at `GET /api/auth/health` without a valid session cookie,
   THE HealthRoute SHALL return HTTP 401 before executing any diagnostic checks.

2. WHEN a request arrives at `GET /api/auth/health` with a valid session whose
   role is not `SUPER_ADMIN`, THE HealthRoute SHALL return HTTP 403 before
   executing any diagnostic checks.

3. WHEN a request arrives at `GET /api/auth/health` with a valid `SUPER_ADMIN`
   session, THE HealthRoute SHALL execute all diagnostic checks and return HTTP 200.

4. THE HealthRoute SHALL NOT contain a hardcoded bcrypt hash string in source
   code; the bcrypt round-trip check SHALL use `hashPassword` to generate a
   fresh hash at runtime and verify it immediately.

5. THE HealthRoute SHALL use `getCurrentUser` from `src/lib/auth.ts` for session
   resolution, consistent with all other protected routes in the System.

---

### Requirement 3 â€” Add `confirmPassword` Server-Side Validation

**User Story:** As a teacher completing a first-login password change, I want the
server to verify that my `newPassword` and `confirmPassword` fields match, so that
a network-layer mismatch is caught even if the client-side check is bypassed.

#### Acceptance Criteria

1. WHEN a `POST /api/auth/change-password` request body contains a `confirmPassword`
   field whose value does not equal `newPassword`, THE ChangePasswordRoute SHALL
   return HTTP 400 with a human-readable error message before hashing any password.

2. THE ChangePasswordRoute Zod schema SHALL include a `confirmPassword` field of
   type `z.string()` and a `.refine()` (or `.superRefine()`) check that asserts
   `newPassword === confirmPassword`.

3. WHEN a `POST /api/auth/change-password` request body omits `confirmPassword`,
   THE ChangePasswordRoute SHALL return HTTP 400 with a validation error message.

4. WHEN `newPassword` equals `confirmPassword` and all other validations pass,
   THE ChangePasswordRoute SHALL proceed with the password update as before.

---

### Requirement 4 â€” Fix Date Comparisons to Use Day Ranges

**User Story:** As a school administrator viewing today's dashboard metrics, I
want attendance and absence counts to reflect all records for today regardless of
the time they were created, so that the counts are accurate throughout the school day.

#### Acceptance Criteria

1. WHEN `fetchSchoolOverview` queries for today's absent students, THE System
   SHALL apply a DayRange filter `{ gte: startOfDay, lt: startOfNextDay }` to the
   `date` field rather than an exact datetime equality match.

2. THE `startOfDay` value used in the DayRange SHALL be a `Date` object set to
   `00:00:00.000` in UTC for the current calendar day, constructed from the `today`
   parameter passed into `fetchSchoolOverview`.

3. THE `startOfNextDay` value used in the DayRange SHALL be a `Date` object set to
   `00:00:00.000` in UTC for the day immediately following `today`.

4. WHILE the DayRange filter is applied, THE System SHALL NOT use an exact
   datetime equality match (`date: today`) for any attendance count query in
   `fetchSchoolOverview`.

---

### Requirement 5 â€” Honour `SESSION_TTL_MS` in All Cookie Set Calls

**User Story:** As a developer maintaining session expiry, I want all cookie
`maxAge` values to derive from the single `SESSION_TTL_MS` constant, so that
changing the session lifetime in one place propagates everywhere automatically.

#### Acceptance Criteria

1. WHEN the LoginRoute sets the session cookie, THE LoginRoute SHALL compute
   `maxAge` as `Math.floor(SESSION_TTL_MS / 1000)` rather than a literal integer.

2. WHEN the ChangePasswordRoute sets the rotated session cookie after a password
   change, THE ChangePasswordRoute SHALL compute `maxAge` as
   `Math.floor(SESSION_TTL_MS / 1000)` rather than a literal integer.

3. IF a future route sets the session cookie, THE System SHALL compute `maxAge`
   using `SESSION_TTL_MS` in the same manner.

4. THE System SHALL import `SESSION_TTL_MS` into every file that sets a session
   cookie, so that the constant is always in scope.

---

### Requirement 6 â€” Remove Dead Code (Unused Imports and Variables)

**User Story:** As a developer, I want source files to be free of unused imports
and unreferenced variables, so that the codebase compiles cleanly, bundle size
is minimised, and future readers are not misled by phantom symbols.

#### Acceptance Criteria

1. THE System SHALL contain zero Dead Symbols after the cleanup pass, as
   verified by TypeScript's `noUnusedLocals` and `noUnusedParameters` compiler
   checks (or equivalent ESLint `no-unused-vars` rule).

2. WHEN an API route imports `requireRole`, `requirePermission`, or
   `requireSchoolRole` from `src/lib/auth.ts` but does not call them, THE
   System SHALL remove those imports from that file.

3. WHEN a super-admin page imports a Lucide icon (such as `Search`,
   `AlertTriangle`, `Clock`, `useRef`, or similar) that is never rendered or
   referenced in the file, THE System SHALL remove that import.

4. WHEN a React component declares a `useRef` variable that is never attached
   to a DOM element and never read, THE System SHALL remove that declaration.

5. THE signup page at `src/app/signup/page.tsx` SHALL NOT contain comment blocks
   that describe removed functionality beyond the minimal redirect implementation.

---

### Requirement 7 â€” Eliminate `any` Type Casts

**User Story:** As a developer, I want all `any` casts replaced with precise
types, so that type errors are caught at compile time rather than at runtime.

#### Acceptance Criteria

1. THE UnifiedDashboard SHALL NOT use `const db = prisma as any`; the Prisma
   client SHALL be accessed as its generated `PrismaClient` type throughout
   `fetchHODData` and all other functions in the file.

2. WHEN `fetchHODData` calls `assessmentFramework.findFirst`,
   `assessmentPeriod.findFirst`, `paper.groupBy`, or
   `classSubjectTeacher.findMany`, THE System SHALL annotate the return type
   explicitly rather than casting through `any`.

3. WHEN a super-admin page component fetches data from an API and maps over an
   array, THE System SHALL define a named interface or type alias for each
   element shape rather than casting elements to `any`.

4. THE System SHALL resolve all remaining `// eslint-disable-next-line
   @typescript-eslint/no-explicit-any` suppressions in super-admin pages by
   replacing the `any` annotation with a named interface or type alias.

---

### Requirement 8 â€” Add `"warn"` Level to Prisma Dev Logging

**User Story:** As a developer debugging queries during development, I want
Prisma to surface slow-query warnings in addition to errors, so that performance
regressions are visible in the development console before they reach production.

#### Acceptance Criteria

1. WHEN `NODE_ENV` equals `"development"`, THE PrismaClient SHALL be constructed
   with a `log` array of `["warn", "error"]`.

2. WHEN `NODE_ENV` does not equal `"development"`, THE PrismaClient SHALL be
   constructed with a `log` array of `["error"]` only, unchanged from the
   current production behaviour.

3. THE PrismaClient `log` configuration SHALL be the only change made to
   `src/lib/prisma.ts`; no other connection or pool parameters SHALL be altered.


---

### Requirement 9 — Add Missing Composite Indexes for Fast Data Fetching

**User Story:** As a school using the Bidii system with hundreds of students, I want all database queries to execute in milliseconds even under load, so that dashboards, attendance rosters, marksheets, and reports feel instant.

#### Acceptance Criteria

1. THE Prisma schema SHALL add @@index([schoolId, date, status]) to the Attendance model, accelerating the dashboard absent-count query (WHERE schoolId = ? AND date BETWEEN ? AND ? AND status = 'ABSENT') and the absentToday report.

2. THE Prisma schema SHALL add @@index([schoolId, classId, date]) to the Attendance model, accelerating the class roster fetch (WHERE schoolId = ? AND classId = ? AND date = ?) and the per-class stats group-by query.

3. THE Prisma schema SHALL add @@index([schoolId, classId, archivedAt]) to the Student model, accelerating the class roster query (WHERE schoolId = ? AND classId = ? AND archivedAt IS NULL) used by the attendance register and marksheet loaders.

4. THE Prisma schema SHALL add @@index([schoolId, returnedAt]) to the LibraryBorrow model, accelerating the active-borrows count query (WHERE schoolId = ? AND returnedAt IS NULL).

5. THE Prisma schema SHALL add @@index([schoolId, returnedAt, dueAt]) to the LibraryBorrow model, accelerating the overdue-count query (WHERE schoolId = ? AND returnedAt IS NULL AND dueAt < ?).

6. THE Prisma schema SHALL add @@index([schoolId, status]) to the DisciplineRecord model, accelerating the unresolved-discipline dashboard count (WHERE schoolId = ? AND status IN ('OPEN','UNDER_REVIEW','ESCALATED')).

7. THE Prisma schema SHALL add @@index([schoolId, periodId, subjectId]) to the AssessmentItem model, accelerating department analytics queries (WHERE schoolId = ? AND periodId = ? AND subjectId IN (?)).

8. AFTER adding all indexes, THE System SHALL generate and apply a Prisma migration named dd_performance_indexes so the indexes exist in the Supabase Postgres database.

9. THE addition of these indexes SHALL NOT alter any existing @@index, @@unique, model field, or relation in the schema.

10. WHEN the migration is applied, THE database SHALL reflect all seven new indexes with no data loss or constraint violations.
