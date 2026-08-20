# Implementation Plan: Bidii System Pilot-Readiness Hardening Pass

## Overview

A hardening pass across the existing Bidii School Management System codebase. All changes are strictly contained to existing modules — no new database tables, no new API routes beyond the indexes migration, no schema migrations except for composite indexes. Tasks 1 and 2 must be completed before all others (build must be green first). Tasks 3–11 can proceed in parallel once the build is stable. Task 12 depends on Task 11.

## Tasks

- [x] 1. Fix health/route.ts TS2698 type errors
  - [x] 1.1 Add explicit inline type annotation to the `diagnostics` variable in `src/app/api/auth/health/route.ts`
    - Declare `diagnostics` with type `{ timestamp: string; checks: Record<string, unknown>; overallStatus?: string }` so all spread assignments satisfy the `TS2698` constraint
    - Change every `diagnostics.checks = { ...diagnostics.checks, key: value }` assignment so the spread result is assigned back to `diagnostics.checks` (typed as `Record<string, unknown>`), not to the outer `diagnostics` object
    - Run `tsc --noEmit` to confirm zero TypeScript errors in this file
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Secure the health endpoint
  - [x] 2.1 Add `getCurrentUser` 401/403 guard at the top of the `GET` handler in `src/app/api/auth/health/route.ts`
    - Import `getCurrentUser` from `@/lib/auth`
    - Return `NextResponse.json({ error: "Unauthorized." }, { status: 401 })` when `getCurrentUser()` returns `null`
    - Return `NextResponse.json({ error: "Forbidden." }, { status: 403 })` when the resolved user's `role` is not `"SUPER_ADMIN"`
    - Allow the handler to proceed to diagnostic checks only for a confirmed `SUPER_ADMIN` session
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
  - [x] 2.2 Replace hardcoded bcrypt hash with runtime `hashPassword` round-trip
    - Remove the static `"$2b$12$LQv3…"` hash string from source
    - Import `hashPassword` and `verifyPassword` from `@/lib/auth`
    - Inside the bcrypt check block: call `await hashPassword("password")` to produce `testHash`, then call `await verifyPassword("password", testHash)` to validate
    - _Requirements: 2.4_

- [x] 3. Add `confirmPassword` server-side validation to ChangePasswordRoute
  - [x] 3.1 Extend the Zod schema in `src/app/api/auth/change-password/route.ts` with a `confirmPassword` field and a `.superRefine()` cross-field check
    - Add `confirmPassword: z.string()` to the schema object
    - Add `.superRefine((data, ctx) => { if (data.newPassword !== data.confirmPassword) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Passwords do not match.", path: ["confirmPassword"] }); })`
    - Ensure validation runs before any call to `hashPassword`; no password hashing occurs when validation fails
    - Verify HTTP 400 is returned when `confirmPassword` is absent or does not equal `newPassword`, and HTTP 200 proceeds when they match
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Centralise session cookie `maxAge` using `SESSION_TTL_MS`
  - [x] 4.1 Replace the `60 * 60 * 24 * 7` literal in `src/app/api/auth/login/route.ts` with `Math.floor(SESSION_TTL_MS / 1000)`
    - Import `SESSION_TTL_MS` from `@/lib/auth` if not already imported
    - Replace every hardcoded `maxAge` integer literal in this file with `Math.floor(SESSION_TTL_MS / 1000)`
    - _Requirements: 5.1, 5.4_
  - [x] 4.2 Replace the `60 * 60 * 24 * 7` literal in `src/app/api/auth/change-password/route.ts` with `Math.floor(SESSION_TTL_MS / 1000)`
    - Import `SESSION_TTL_MS` from `@/lib/auth`
    - Replace the cookie `maxAge` literal with `Math.floor(SESSION_TTL_MS / 1000)`
    - _Requirements: 5.2, 5.4_

- [x] 5. Fix attendance DayRange in `fetchSchoolOverview`
  - [x] 5.1 Replace the exact datetime equality filter `date: today` with a half-open UTC day-boundary range in `src/components/dashboard/UnifiedDashboard.tsx`
    - Inside `fetchSchoolOverview`, construct `startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))`
    - Construct `startOfNextDay = new Date(startOfDay.getTime() + 86_400_000)`
    - Replace every `date: today` Prisma `where` clause in `fetchSchoolOverview` with `date: { gte: startOfDay, lt: startOfNextDay }`
    - Reuse the same `startOfDay`/`startOfNextDay` pair for all attendance count queries within the function
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 6. Remove `prisma as any` casts and add explicit return types
  - [x] 6.1 Remove `const db = prisma as any` from `fetchHODData` in `src/components/dashboard/UnifiedDashboard.tsx` and replace all `db.*` calls with `prisma.*`
    - Replace `db.assessmentFramework.findFirst(...)`, `db.assessmentPeriod.findFirst(...)`, `db.paper.groupBy(...)`, and `db.classSubjectTeacher.findMany(...)` with `prisma.*` equivalents
    - Remove the `as { id: string } | null` cast where return type is now inferred by Prisma
    - _Requirements: 7.1, 7.2_
  - [x] 6.2 Remove `any` casts in `src/app/api/assessments/marksheet/route.ts` and any other assessment route files that cast Prisma results through `any`
    - Define named interfaces or type aliases at the top of each affected file for each element shape
    - Replace `(item: any) =>` or `as any` patterns with the named interfaces
    - Remove `// eslint-disable-next-line @typescript-eslint/no-explicit-any` suppression comments alongside the replaced casts
    - _Requirements: 7.2, 7.4_

- [x] 7. Remove dead imports from API route files
  - [x] 7.1 Audit all files under `src/app/api/` for unused `requireRole`, `requirePermission`, and `requireSchoolRole` imports from `@/lib/auth`
    - For each file that imports one of these identifiers but never calls it, remove the unused identifier from the import statement
    - Preserve other identifiers in the same import statement that are used
    - After removal, run `tsc --noEmit` to confirm no new errors introduced
    - _Requirements: 6.1, 6.2_

- [x] 8. Clean super-admin pages — remove unused imports, dead variables, and replace `any` casts
  - [x] 8.1 Remove unused Lucide icon imports and dead `useRef` declarations across super-admin page components
    - Identify all `import { Search, AlertTriangle, Clock, … }` entries in super-admin page files where the identifier is never rendered or referenced
    - Remove those identifiers from their import statements
    - Remove `const ref = useRef(...)` declarations that are never attached to a DOM element and never read
    - _Requirements: 6.3, 6.4_
  - [x] 8.2 Replace `any` casts in super-admin page data-fetching map callbacks with named interfaces
    - For each super-admin page that maps over an API response array with `(item: any) =>`, define a named interface (e.g., `interface StudentRow { id: string; fullName: string; … }`) at the top of the file
    - Replace the `any` annotation with the named interface
    - Remove any accompanying `// eslint-disable-next-line @typescript-eslint/no-explicit-any` suppression comments
    - _Requirements: 7.3, 7.4_

- [x] 9. Clean up `src/app/signup/page.tsx` comment block
  - [x] 9.1 Remove verbose removed-feature comment blocks from `src/app/signup/page.tsx` and replace with a minimal redirect comment
    - Delete all multi-line comment blocks that describe removed signup functionality
    - Retain a single short comment indicating the page redirects (e.g., `// Signup is disabled — redirect to login`)
    - _Requirements: 6.5_

- [x] 10. Add `"warn"` level to Prisma dev logging
  - [x] 10.1 Change the `log` array in `src/lib/prisma.ts` for `NODE_ENV === "development"` from `["error"]` to `["warn", "error"]`
    - Modify only the `log` property of the `PrismaClient` constructor options
    - Leave the production branch `["error"]` unchanged
    - Make no other changes to the file (datasource, pool config, singleton pattern all untouched)
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 11. Add 7 composite indexes to Prisma schema
  - [x] 11.1 Add `@@index([schoolId, date, status])` to the `Attendance` model in `prisma/schema.prisma`
    - _Requirements: 9.1_
  - [x] 11.2 Add `@@index([schoolId, classId, date])` to the `Attendance` model in `prisma/schema.prisma`
    - _Requirements: 9.2_
  - [x] 11.3 Add `@@index([schoolId, classId, archivedAt])` to the `Student` model in `prisma/schema.prisma`
    - _Requirements: 9.3_
  - [x] 11.4 Add `@@index([schoolId, returnedAt])` to the `LibraryBorrow` model in `prisma/schema.prisma`
    - _Requirements: 9.4_
  - [x] 11.5 Add `@@index([schoolId, returnedAt, dueAt])` to the `LibraryBorrow` model in `prisma/schema.prisma`
    - _Requirements: 9.5_
  - [x] 11.6 Add `@@index([schoolId, status])` to the `DisciplineRecord` model in `prisma/schema.prisma`
    - _Requirements: 9.6_
  - [x] 11.7 Add `@@index([schoolId, periodId, subjectId])` to the `AssessmentItem` model in `prisma/schema.prisma`
    - Confirm that no existing `@@index`, `@@unique`, model field, or relation has been altered
    - _Requirements: 9.7, 9.9_

- [x] 12. Generate and apply Prisma migration for performance indexes
  - [x] 12.1 Run `prisma migrate dev --name add_performance_indexes` to generate and apply the migration
    - Confirm the generated migration file contains only `CREATE INDEX` statements — no `DROP`, `ALTER TABLE`, or DML
    - Verify the database reflects all seven new composite indexes after the migration completes
    - _Requirements: 9.8, 9.10_

- [x] 13. Final checkpoint — Ensure all tests pass
  - Run `tsc --noEmit` and confirm zero TypeScript errors across the entire project
  - Verify the build compiles successfully
  - Ask the user if any questions arise before closing the hardening pass.

## Notes

- Tasks 1 and 2 are blocking: the TypeScript build must reach zero errors before Tasks 3–11 are executed
- Tasks 3–11 are independent and can be executed in parallel once Tasks 1 and 2 are complete
- Task 12 depends on Task 11 (indexes must be in the schema before the migration can be generated)
- No new database tables, API routes, or schema fields are introduced by any task
- All changes are strictly in-place edits to existing files, except for Task 12 which generates a new migration file
- Each task references specific requirements for traceability

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "4.1", "4.2", "5.1", "6.1", "6.2", "7.1", "8.1", "8.2", "9.1", "10.1", "11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7"] },
    { "id": 3, "tasks": ["12.1"] }
  ]
}
```
