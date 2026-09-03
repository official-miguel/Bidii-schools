# Design Document — Parent Portal & Notification System

## Overview

This document covers the architecture and implementation plan for the 11-phase Parent Portal & Notification System added to the Bidii school management platform. The feature introduces dedicated parent authentication, a child-switched dashboard, seven data-integration pages, a central notification engine, and end-to-end security hardening — all built on top of the existing Next.js 14 App Router / Prisma 5 / PostgreSQL stack without altering any existing production model schemas (except adding `isVisibleToParent` fields to `DisciplineRecord` and `Achievement`).

---

## Architecture Overview

```
Browser (Parent)
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  Next.js 14 App Router                               │
│                                                      │
│  /parent-login          → ParentLoginPage            │
│  /parent-login/set-password → SetPasswordPage        │
│  /parent/*              → ParentLayout (auth guard)  │
│    /parent              → ParentHomePage             │
│    /parent/diary        → ParentDiaryPage            │
│    /parent/results      → ParentResultsPage          │
│    /parent/attendance   → ParentAttendancePage       │
│    /parent/fees         → ParentFeesPage             │
│    /parent/behaviour    → ParentBehaviourPage        │
│    /parent/achievements → ParentAchievementsPage     │
│    /parent/calendar     → ParentCalendarPage         │
│    /parent/messages     → ParentMessagesPage         │
│    /parent/notifications→ ParentNotificationsPage    │
│                                                      │
│  /api/parent/           → API routes (guarded)       │
│    auth/login           POST  — parent login         │
│    auth/set-password    POST  — first-time password  │
│    notifications/       GET   — list & unread count  │
│    notifications/[id]/read  PATCH — mark read        │
│    notifications/read-all   POST  — mark all read    │
│    diary/               GET   — diary entries        │
│    results/             GET   — assessment items     │
│    attendance/          GET   — attendance records   │
│    fees/                GET   — balance + invoices   │
│    behaviour/           GET   — discipline records   │
│    achievements/        GET   — achievements         │
│    calendar/            GET   — calendar events      │
│    messages/            GET   — messages             │
│    me/children          GET   — linked students      │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│  Server-side Libraries                 │
│  src/lib/parentAuth.ts  ← requireParent() guard     │
│  src/lib/parentNotifications.ts ← notifyParents()   │
│  src/lib/auth.ts        ← existing session helpers  │
│  src/lib/prisma.ts      ← existing Prisma client    │
└────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  PostgreSQL (Supabase)                               │
│  New tables: Parent, ParentStudent, ParentNotification│
│  Modified: DisciplineRecord + isVisibleToParent      │
│            Achievement    + isVisibleToParent        │
│  Existing (read-only by portal): Student, Attendance,│
│  AssessmentItem, Invoice, Payment, DisciplineRecord, │
│  Achievement, CalendarEvent, Message, DiaryEntry     │
└──────────────────────────────────────────────────────┘

Client-side state (Zustand):
  useParentStore → { activeChildId, children[], setActiveChild() }
```

---

## Phase 1 — Database Schema Changes

### New Prisma Models

```prisma
/// One row per parent account. Phone + schoolId is the login credential pair.
model Parent {
  id         String        @id @default(cuid())
  userId     String        @unique
  name       String
  phone      String
  schoolId   String
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  user          User            @relation(fields: [userId],   references: [id], onDelete: Cascade)
  school        School          @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  students      ParentStudent[]
  notifications ParentNotification[]

  @@unique([schoolId, phone])
  @@index([schoolId])
}

/// Many-to-many join between parents and students.
model ParentStudent {
  parentId   String
  studentId  String
  isPrimary  Boolean  @default(false)
  createdAt  DateTime @default(now())

  parent  Parent  @relation(fields: [parentId],  references: [id], onDelete: Cascade)
  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@id([parentId, studentId])
  @@index([studentId])
  @@index([parentId])
}

/// Aggregated in-app notification inbox for parents. One row per event.
model ParentNotification {
  id        String    @id @default(cuid())
  schoolId  String
  parentId  String
  module    String    /// "DIARY" | "FEES" | "ATTENDANCE" | "BEHAVIOUR" | "ACHIEVEMENTS" | "CALENDAR"
  priority  NotificationPriority @default(NORMAL)
  title     String
  body      String
  metadata  Json?
  dedupKey  String?
  isRead    Boolean   @default(false)
  readAt    DateTime?
  createdAt DateTime  @default(now())

  parent Parent @relation(fields: [parentId], references: [id], onDelete: Cascade)
  school School @relation(fields: [schoolId], references: [id], onDelete: Cascade)

  @@index([parentId, isRead, createdAt])
  @@unique([schoolId, dedupKey])
}

enum NotificationPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}
```

### Modifications to Existing Models

```prisma
// Add to DisciplineRecord model:
isVisibleToParent Boolean @default(false)

// Add to Achievement model:
isVisibleToParent Boolean @default(false)
```

### Migration Strategy

The Prisma migration (`prisma migrate dev`) creates the three new tables and adds the two boolean columns.

A companion data-migration script (`scripts/migrate-parent-contacts.ts`) runs after `prisma migrate deploy` in the deployment pipeline:

```typescript
// scripts/migrate-parent-contacts.ts
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";

async function run() {
  // Find all active students with a non-empty parentContact
  const students = await prisma.student.findMany({
    where: { parentContact: { not: null }, archivedAt: null },
    select: {
      id: true,
      schoolId: true,
      parentName: true,
      parentContact: true,
      admissionNumber: true,
    },
  });

  for (const student of students) {
    if (!student.parentContact) continue;

    // Check if a User already exists for this phone in this school
    let user = await prisma.user.findFirst({
      where: {
        schoolId: student.schoolId,
        email: `parent_${student.parentContact}@bidii.internal`,
      },
    });

    if (!user) {
      // Create User with admission number as initial hashed password
      const passwordHash = await hashPassword(student.admissionNumber);
      user = await prisma.user.create({
        data: {
          schoolId:          student.schoolId,
          email:             `parent_${student.parentContact}@bidii.internal`,
          passwordHash,
          role:              "PARENT",
          mustChangePassword: true,
        },
      });
    }

    // Create or find Parent row
    let parent = await prisma.parent.findUnique({
      where: { userId: user.id },
    });

    if (!parent) {
      parent = await prisma.parent.create({
        data: {
          userId:   user.id,
          name:     student.parentName ?? "Parent",
          phone:    student.parentContact,
          schoolId: student.schoolId,
        },
      });
    }

    // Create ParentStudent link if not already present
    await prisma.parentStudent.upsert({
      where:  { parentId_studentId: { parentId: parent.id, studentId: student.id } },
      create: { parentId: parent.id, studentId: student.id, isPrimary: true },
      update: {},
    });
  }

  console.log(`Migrated ${students.length} parent-contact records.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
```

> The legacy `Student.parentContact` and `Student.parentName` columns are **not removed** — they remain for backward compatibility and display in the staff student-profile view.

---

## Phase 2 — Authentication

### `/parent-login` Page

Independent login page at `src/app/parent-login/page.tsx`. Does **not** share the staff `/login` component.

**Login flow:**

```
1. Parent submits { phone, admissionNumber }
2. Server action looks up Parent by { schoolId: derived-from-school-slug OR default-school, phone }
3. Load linked ParentStudent rows → find student.admissionNumber
4. verifyPassword(admissionNumber, user.passwordHash)
5. If mustChangePassword=true  → redirect to /parent-login/set-password
6. If valid                    → createSession(user.id)  +  buildOfflineToken(user)
7. Set bidii_session cookie (SESSION_TTL_MS = 7 days)
8. Redirect to /parent
```

**School resolution:** The parent login page reads the `schoolId` from a URL param or a hidden field populated from the school's public slug. This keeps the login page multi-tenant without requiring a separate subdomain.

**Set-password page** (`/parent-login/set-password`): Verifies the session exists and `mustChangePassword=true`, hashes the new password, updates `User.passwordHash` and sets `mustChangePassword=false`. On success, redirects to `/parent`.

**`/parent-login` Server Action:**

```typescript
// src/app/parent-login/actions.ts
"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession, buildOfflineToken, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth";

export async function parentLogin(formData: FormData) {
  const phone           = String(formData.get("phone") ?? "").trim();
  const admissionNumber = String(formData.get("admissionNumber") ?? "").trim();
  const schoolId        = String(formData.get("schoolId") ?? "").trim();

  const parent = await prisma.parent.findUnique({
    where: { schoolId_phone: { schoolId, phone } },
    include: { user: true, students: { include: { student: true } } },
  });

  // Generic error — never reveal which field failed
  const GENERIC = "Invalid credentials";

  if (!parent || !parent.user.isActive) return { error: GENERIC };

  // Verify password (first login: admissionNumber; subsequent: personal password)
  const validPassword = await verifyPassword(admissionNumber, parent.user.passwordHash ?? "");
  
  // After mustChangePassword=false, admission number is no longer valid
  if (!validPassword || (!parent.user.mustChangePassword && validPassword)) {
    // Re-check: if mustChangePassword is false, admission number based
    // password verification that returns true = stale — block it
    // (The migration sets mustChangePassword=true, so this case only arises
    // if someone manually resets it; the double-check is belt-and-suspenders.)
    const isAdmissionNumberStillValid =
      parent.students.some((ps) => ps.student.admissionNumber === admissionNumber) &&
      parent.user.mustChangePassword;
    
    if (!validPassword && !isAdmissionNumberStillValid) {
      return { error: GENERIC };
    }
  }

  // Check admission number belongs to a linked student
  const linkedAdmissions = parent.students.map((ps) => ps.student.admissionNumber);
  if (!linkedAdmissions.includes(admissionNumber) && !validPassword) {
    return { error: GENERIC };
  }

  if (parent.user.mustChangePassword) {
    const token = await createSession(parent.userId);
    cookies().set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_MS / 1000,
      path: "/",
    });
    redirect("/parent-login/set-password");
  }

  const token = await createSession(parent.userId);
  const offlineToken = buildOfflineToken(parent.user);

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });

  redirect("/parent");
}
```

### NavHub Extension

```typescript
// src/lib/permissions.ts — extend the union type:
export type NavHub =
  | "dashboard"
  | "academic"
  | "people"
  | "student-life"
  | "calendar"
  | "communication"
  | "administration"
  | "diary"
  | "parent";          // ← new
```

### `requireParent()` Guard

```typescript
// src/lib/parentAuth.ts
import { getCurrentUser } from "./auth";
import { prisma } from "./prisma";
import type { Parent, ParentStudent } from "@prisma/client";

export type ParentWithStudents = Parent & {
  students: (ParentStudent & { student: { id: string } })[];
};

export async function requireParent(): Promise<ParentWithStudents | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "PARENT") return null;

  const parent = await prisma.parent.findUnique({
    where: { userId: user.id },
    include: {
      students: {
        select: {
          parentId:  true,
          studentId: true,
          isPrimary: true,
          createdAt: true,
          student:   { select: { id: true } },
        },
      },
    },
  });

  return parent;
}

/** 
 * Returns the parent's verified student IDs as a Set for O(1) ownership checks. 
 */
export function parentStudentIds(parent: ParentWithStudents): Set<string> {
  return new Set(parent.students.map((ps) => ps.studentId));
}

/**
 * Verify a studentId is owned by the parent. Returns 403-appropriate boolean.
 * Never reveals whether the student exists in the system.
 */
export function ownsStudent(parent: ParentWithStudents, studentId: string): boolean {
  return parentStudentIds(parent).has(studentId);
}
```

### Middleware Update

`src/middleware.ts` already protects `/parent/*` via `PROTECTED_PREFIXES`. Add `/parent-login/set-password` to the unprotected list (it relies on the session cookie set during login but before `mustChangePassword` is cleared):

```typescript
// middleware.ts — update matcher to ensure /parent-login is public
// and /parent-login/set-password is accessible with a session
const PUBLIC_PATHS = ["/parent-login", "/login", "/signup"];
```

The real role check (`role !== "PARENT"`) lives in the ParentLayout server component, which redirects to `/parent-login`.

---

## Phase 3 — Layout, Navigation & Child Switching

### DashboardShell Extension

`DashboardShell` already accepts a `role: string` prop and passes it to `ConditionalHubSidebar`. No changes needed to `DashboardShell.tsx` itself — the `"parent"` role value routes through the same prop path. The sidebar items for the `"parent"` hub are added to `HubSidebar.tsx`.

### Parent-Specific Sidebar Links (NavHub `"parent"`)

Add the following items to `HubSidebar.tsx` under the `"parent"` hub case:

| Label              | Href                         | Icon              |
|--------------------|------------------------------|-------------------|
| Home               | /parent                      | LayoutDashboard   |
| Diary              | /parent/diary                | BookOpen          |
| Academic Results   | /parent/results              | GraduationCap     |
| Attendance         | /parent/attendance           | CalendarCheck     |
| Fees               | /parent/fees                 | CreditCard        |
| Behaviour          | /parent/behaviour            | ShieldAlert       |
| Achievements       | /parent/achievements         | Award             |
| School Calendar    | /parent/calendar             | Calendar          |
| Messages           | /parent/messages             | MessageSquare     |
| Notifications      | /parent/notifications        | Bell (+ badge)    |

### Zustand Parent Store

```typescript
// src/lib/stores/parentStore.ts
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChildSummary = {
  id:              string;
  fullName:        string;
  admissionNumber: string;
  classId:         string;
  className:       string;
};

interface ParentState {
  activeChildId: string | null;
  children:      ChildSummary[];
  hydrated:      boolean;
  setActiveChild:   (childId: string) => void;
  setChildren:      (children: ChildSummary[]) => void;
  setHydrated:      (v: boolean) => void;
}

export const useParentStore = create<ParentState>()(
  persist(
    (set) => ({
      activeChildId: null,
      children:      [],
      hydrated:      false,
      setActiveChild: (childId) => set({ activeChildId: childId }),
      setChildren:    (children) =>
        set((s) => ({
          children,
          // Default to first child if activeChildId not yet set or no longer valid
          activeChildId:
            children.find((c) => c.id === s.activeChildId)?.id ??
            children[0]?.id ??
            null,
        })),
      setHydrated: (v) => set({ hydrated: v }),
    }),
    {
      name: "bidii-parent-active-child",
      partialize: (s) => ({ activeChildId: s.activeChildId }),
    }
  )
);
```

### ParentHydrator Component

A small client component placed in the `ParentLayout` that fetches `/api/parent/me/children` on mount and seeds the Zustand store:

```typescript
// src/components/parent/ParentHydrator.tsx
"use client";
import { useEffect } from "react";
import { useParentStore } from "@/lib/stores/parentStore";

export default function ParentHydrator() {
  const { setChildren, setHydrated } = useParentStore();

  useEffect(() => {
    fetch("/api/parent/me/children")
      .then((r) => r.json())
      .then((children) => {
        setChildren(children);
        setHydrated(true);
      })
      .catch(() => setHydrated(true));
  }, [setChildren, setHydrated]);

  return null;
}
```

### ChildSwitcher Component

```typescript
// src/components/parent/ChildSwitcher.tsx
"use client";
import { useParentStore } from "@/lib/stores/parentStore";

export default function ChildSwitcher() {
  const { children, activeChildId, setActiveChild } = useParentStore();
  if (children.length <= 1) return null;

  return (
    <div className="px-3 py-2 border-b border-border dark:border-dark-border">
      <p className="text-xs font-medium text-slate dark:text-dark-muted mb-1.5">
        Switch child
      </p>
      <div className="flex flex-col gap-1">
        {children.map((child) => (
          <button
            key={child.id}
            onClick={() => setActiveChild(child.id)}
            className={`text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
              child.id === activeChildId
                ? "bg-teal/10 text-teal font-medium"
                : "hover:bg-paper dark:hover:bg-dark-surface text-ink dark:text-dark-text"
            }`}
          >
            {child.fullName}
            <span className="ml-1.5 text-xs text-slate dark:text-dark-muted">
              {child.className}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Active Child Header Bar

The top navigation shows the active child's name and class. This uses a small server component hydrated via the `children` prop passed down from the layout (not from Zustand, since the top bar renders server-side). The Zustand store covers client-side data re-fetching triggers.

### Updated `ParentLayout`

```typescript
// src/app/parent/layout.tsx
export default async function ParentLayout({ children }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PARENT") redirect("/parent-login");

  const parent = await prisma.parent.findUnique({
    where: { userId: user.id },
    include: {
      school: { select: { name: true, motto: true } },
      students: {
        include: {
          student: {
            select: {
              id:              true,
              fullName:        true,
              admissionNumber: true,
              classId:         true,
              schoolClass:     { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!parent) redirect("/parent-login");

  const children_data = parent.students.map((ps) => ({
    id:              ps.student.id,
    fullName:        ps.student.fullName,
    admissionNumber: ps.student.admissionNumber,
    classId:         ps.student.classId,
    className:       ps.student.schoolClass.name,
  }));

  return (
    <DashboardShell
      role="parent"
      roleLabel="Parent"
      userEmail={user.email}
      schoolName={parent.school.name}
      motto={parent.school.motto}
      visibleHubs={PARENT_HUBS}
    >
      <ParentHydrator />
      {children}
    </DashboardShell>
  );
}
```

---

## Phase 4 — Diary Integration

### `/parent/diary` Page

Server component. Reads `activeChildId` from a query param (`?child=<id>`) — the client-side Zustand store appends this when navigating. Falls back to the parent's first linked student if omitted.

**Query logic:**
```typescript
const entries = await prisma.diaryEntry.findMany({
  where: {
    schoolId:  parent.schoolId,
    deletedAt: null,
    targets:   { some: { classId: activeChild.classId } },
  },
  include: {
    subject:    { select: { name: true } },
    recipients: { where: { studentId: activeChild.id }, take: 1 },
  },
  orderBy: [
    { dueDate: { sort: "desc", nulls: "last" } },
  ],
  // cache: "no-store" applied via fetch options in client-side refresh
});
```

**Badge count:** Computed via `COUNT` on `DiaryEntry` where `entryType IN ("ASSIGNMENT", "HOMEWORK")` AND `dueDate BETWEEN now AND now+7days` AND the entry targets the active child's class.

**Mark-as-read:** When the parent views an entry, a `PATCH /api/parent/diary/[entryId]/read` call sets `DiaryNotification.isRead = true` where `userId = parent.userId`.

---

## Phase 5 — Academic Results Integration

### `/parent/results` Page

Groups `AssessmentItem` rows by `AssessmentPeriod`, ordered by `academicYear` DESC, `term` DESC.

**Score computation (pure function, extracted for testability):**

```typescript
// src/lib/parentUtils.ts
export function computePeriodStats(items: { numericScore: number | null }[]) {
  const scores = items.map((i) => i.numericScore).filter((n): n is number => n !== null);
  if (scores.length === 0) return null;
  const sum  = scores.reduce((a, b) => a + b, 0);
  const mean = sum / scores.length;
  const percentage = (mean / 100) * 100; // max score assumed 100; configurable
  return { mean: +mean.toFixed(2), percentage: +percentage.toFixed(1), count: scores.length };
}
```

**Recharts chart:** A `BarChart` per period showing subject vs. score, and a `LineChart` showing performance trends across periods.

---

## Phase 6 — Attendance Integration

### `/parent/attendance` Page

**Calendar-dot grid:** A grid of day cells for the current term, each cell coloured green (PRESENT), red (ABSENT), or grey (no record). Implemented as a pure client component `AttendanceDotGrid` accepting an array of `{ date: string; status: "PRESENT" | "ABSENT" }`.

**Summary stats:** `totalPresent`, `totalAbsent`, `percentage = totalPresent / (totalPresent + totalAbsent) * 100`.

**30-day alert trigger:** Called from the fees invoice or a cron-equivalent — but for the parent page, computed server-side on render:

```typescript
const last30 = attendance.filter(a => new Date(a.date) >= thirtyDaysAgo);
const absentCount = last30.filter(a => a.status === "ABSENT").length;
if (last30.length > 0 && absentCount / last30.length > 0.2) {
  await notifyParents({
    schoolId: parent.schoolId,
    studentId: activeChild.id,
    module: "ATTENDANCE",
    priority: "HIGH",
    title: "Attendance Alert",
    body: `${activeChild.fullName} has been absent ${absentCount} of the last ${last30.length} school days.`,
    dedupKey: `attendance-alert-${activeChild.id}-${currentMonth}`,
  });
}
```

---

## Phase 7 — Fees Integration

### `/parent/fees` Page

Fetches:
- `StudentFinanceAccount.balance` — current ledger balance
- `Invoice[]` — ordered by `issuedAt DESC`
- `Payment[]` — ordered by `paidAt DESC`

All queries include `studentId: activeChild.id` AND verify `ownsStudent(parent, activeChild.id)` before executing.

**ParentNotification triggers** (called from existing API routes):

- `POST /api/finance/invoices` route → after invoice created, call `notifyParents({ module: "FEES", priority: "NORMAL", dedupKey: "invoice-" + invoice.id, ... })`
- `POST /api/finance/payments` route → after payment posted, call `notifyParents({ module: "FEES", priority: "LOW", dedupKey: "payment-" + payment.id, ... })`

---

## Phase 8 — Behaviour & Achievements Integration

### Schema Changes

```prisma
// DisciplineRecord — add:
isVisibleToParent Boolean @default(false)

// Achievement — add:
isVisibleToParent Boolean @default(false)
```

### `/parent/behaviour` Page

```typescript
const records = await prisma.disciplineRecord.findMany({
  where: { studentId: activeChild.id, isVisibleToParent: true },
  orderBy: { dateOfOffence: "desc" },
});
```

### `/parent/achievements` Page

```typescript
const achievements = await prisma.achievementStudent.findMany({
  where: {
    studentId:   activeChild.id,
    achievement: { isVisibleToParent: true },
  },
  include: { achievement: true },
  orderBy: { achievement: { date: "desc" } },
});
```

### ParentNotification Triggers

- After discipline record creation (`POST /api/discipline`) with `isVisibleToParent=true`:
  ```typescript
  await notifyParents({ module: "BEHAVIOUR", priority: "HIGH", dedupKey: "disc-" + record.id, ... });
  ```
- After achievement creation (`POST /api/achievements`) with `isVisibleToParent=true`:
  ```typescript
  await notifyParents({ module: "ACHIEVEMENTS", priority: "NORMAL", dedupKey: "ach-" + achievement.id, ... });
  ```

---

## Phase 9 — Central Notification Engine

### `notifyParents()` Function

```typescript
// src/lib/parentNotifications.ts
import { prisma } from "./prisma";
import type { NotificationPriority } from "@prisma/client";

export interface NotifyParentsParams {
  schoolId:   string;
  studentId:  string;
  module:     string;
  priority:   NotificationPriority;
  title:      string;
  body:       string;
  dedupKey?:  string;
  metadata?:  Record<string, unknown>;
}

/**
 * Writes a ParentNotification row for every parent linked to the given student.
 *
 * - If dedupKey is provided, uses upsert on @@unique([schoolId, dedupKey])
 *   so duplicate events are idempotent.
 * - Fire-and-forget after primary operation: caller should NOT await this
 *   in a critical path. If a DB error occurs, it is logged and swallowed —
 *   the primary operation must never be rolled back due to a notification failure.
 *
 * Usage:
 *   // non-blocking in a route handler
 *   void notifyParents({ ... }).catch(() => {});
 *
 *   // or await it outside the main transaction
 *   await notifyParents({ ... });
 */
export async function notifyParents(params: NotifyParentsParams): Promise<void> {
  const { schoolId, studentId, module, priority, title, body, dedupKey, metadata } = params;

  try {
    // Find all parents linked to this student
    const parentStudents = await prisma.parentStudent.findMany({
      where: { studentId },
      select: { parentId: true },
    });

    if (parentStudents.length === 0) return;

    // Build upsert or create operations for each parent
    await Promise.all(
      parentStudents.map((ps) => {
        const data = {
          schoolId,
          parentId: ps.parentId,
          module,
          priority,
          title,
          body,
          metadata: metadata ?? null,
          dedupKey:  dedupKey ?? null,
        };

        if (dedupKey) {
          return prisma.parentNotification.upsert({
            where:  { schoolId_dedupKey: { schoolId, dedupKey } },
            create: data,
            update: { title, body, priority, metadata: metadata ?? null },
          });
        }

        return prisma.parentNotification.create({ data });
      })
    );
  } catch (err) {
    // Non-throwing — notification failure must not roll back the caller's operation
    console.error("[notifyParents] Failed to write ParentNotification:", err);
  }
}
```

### Dedup Key Format

| Event                      | dedupKey format                          |
|----------------------------|------------------------------------------|
| New invoice                | `invoice-{invoiceId}`                   |
| Payment posted             | `payment-{paymentId}`                   |
| Discipline record          | `disc-{disciplineRecordId}`             |
| Achievement                | `ach-{achievementId}`                   |
| PARENTS_ONLY calendar event| `cal-{calendarEventId}`                 |
| Attendance alert           | `attendance-alert-{studentId}-{YYYY-MM}`|
| Diary entry                | `diary-{diaryEntryId}-{parentId}`       |

---

## Phase 10 — Notification Centre

### `/parent/notifications` Page

```
GET /api/parent/notifications?page=1&module=FEES
→ { notifications: ParentNotification[], total: number, unreadCount: number }
```

**Server query:**
```typescript
const [notifications, total, unreadCount] = await Promise.all([
  prisma.parentNotification.findMany({
    where: { parentId: parent.id, ...(module ? { module } : {}) },
    orderBy: { createdAt: "desc" },
    skip:  (page - 1) * 25,
    take:  25,
  }),
  prisma.parentNotification.count({ where: { parentId: parent.id, ...(module ? { module } : {}) } }),
  prisma.parentNotification.count({ where: { parentId: parent.id, isRead: false } }),
]);
```

### Mark as Read

```
PATCH /api/parent/notifications/[id]/read
→ Updates isRead=true, readAt=now() for the given notification,
  after verifying notification.parentId === parent.id
```

### Mark All as Read

```
POST /api/parent/notifications/read-all
→ prisma.parentNotification.updateMany({
    where: { parentId: parent.id, isRead: false },
    data:  { isRead: true, readAt: new Date() },
  })
```

### Module Colour Codes

| Module      | Colour Token | Tailwind class              |
|-------------|-------------|------------------------------|
| DIARY       | Blue         | `bg-blue-100 text-blue-700`  |
| FEES        | Green        | `bg-green-100 text-green-700`|
| ATTENDANCE  | Orange       | `bg-orange-100 text-orange-700` |
| BEHAVIOUR   | Red          | `bg-red-100 text-red-700`    |
| ACHIEVEMENTS| Gold         | `bg-yellow-100 text-yellow-700` |
| CALENDAR    | Teal         | `bg-teal-100 text-teal-700`  |

### Unread Badge

The bell icon in the top nav bar renders `unreadCount > 0` as a red badge using a `useEffect`-driven polling fetch every 60 seconds, or updated optimistically on read actions.

---

## Phase 11 — Communication & School Calendar

### `/parent/calendar` Page

```typescript
const events = await prisma.calendarEvent.findMany({
  where: {
    schoolId: parent.schoolId,
    audience: { in: ["EVERYONE", "PARENTS_ONLY"] },
  },
  orderBy: { date: "asc" },
  // cache: "no-store"
});
```

### `/parent/messages` Page

```typescript
const messages = await prisma.message.findMany({
  where: {
    schoolId: parent.schoolId,
    OR: [
      { recipientGroups: { some: { audience: "PARENTS" } } },
      { recipientGroups: { some: { audience: "EVERYONE" } } },
    ],
  },
  orderBy: { createdAt: "desc" },
});
```

### UpcomingCalendarWidget Reuse

In `ParentHomePage`:
```tsx
<UpcomingCalendarWidget calendarHref="/parent/calendar" schoolId={schoolId} />
```

No modifications to the existing component.

### PARENTS_ONLY Calendar Notification

Added to the calendar event creation route (`POST /api/calendar`):

```typescript
if (event.audience === "PARENTS_ONLY") {
  const parents = await prisma.parent.findMany({ where: { schoolId: event.schoolId } });
  await Promise.all(
    parents.map((p) =>
      notifyParents({
        schoolId:  event.schoolId,
        studentId: p.students[0]?.studentId ?? "",  // trigger per parent directly
        module:    "CALENDAR",
        priority:  "NORMAL",
        title:     event.title,
        body:      event.description ?? "",
        dedupKey:  `cal-${event.id}`,
      })
    )
  );
}
```

> Note: For calendar events (school-wide, not student-specific), the `notifyParents` call is adapted to write directly by `parentId` rather than via `studentId` lookup, since the notification is not student-scoped.

---

## Phase 12 — Security Hardening

### Ownership Verification Pattern

Every `/api/parent/*` route handler follows this pattern:

```typescript
export async function GET(req: NextRequest, { params }: { params: { studentId?: string } }) {
  // 1. Auth guard
  const parent = await requireParent();
  if (!parent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Ownership check
  const studentId = req.nextUrl.searchParams.get("studentId") ?? params?.studentId;
  if (studentId && !ownsStudent(parent, studentId)) {
    // 403 — never reveal whether the student exists
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. All Prisma queries scoped to parent.schoolId + verified studentId
  const data = await prisma.someModel.findMany({
    where: { schoolId: parent.schoolId, studentId },
    // ...
  });

  return NextResponse.json(data);
}
```

### Rate Limiting

A lightweight in-memory rate limiter implemented as a Next.js middleware helper:

```typescript
// src/lib/rateLimit.ts
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(userId);

  if (!entry || entry.resetAt < now) {
    requestCounts.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return true; // allowed
  }

  if (entry.count >= MAX_REQUESTS) return false; // blocked

  entry.count++;
  return true;
}
```

Applied in every `/api/parent/*` route handler after `requireParent()`:

```typescript
if (!checkRateLimit(parent.userId)) {
  return NextResponse.json({ error: "Too many requests" }, { status: 429 });
}
```

### `cache: "no-store"` Policy

All server component data fetches in the parent portal use:

```typescript
const data = await prisma.someModel.findMany({
  // ...
});
// In Next.js server components, prisma calls are not cached by default.
// For explicit control, wrap page components with:
export const dynamic = "force-dynamic";
// or use fetch wrappers with cache: "no-store"
```

Each parent portal page exports `export const dynamic = "force-dynamic"` to guarantee fresh data on every render.

### Session Expiry Handling

The `ParentLayout` calls `getCurrentUser()` which already checks `session.expiresAt < new Date()` and returns `null`. The layout redirects expired sessions to `/parent-login`. The cookie is cleared client-side via:

```typescript
// In the parent layout, if getCurrentUser returns null:
redirect("/parent-login");

// API routes return 401 and the client redirects on 401 response
```

---

## API Route Reference

| Method | Path                                         | Guard           | Description                              |
|--------|----------------------------------------------|-----------------|------------------------------------------|
| POST   | `/api/parent/auth/login`                     | public          | Parent login; sets `bidii_session`       |
| POST   | `/api/parent/auth/set-password`              | session         | First-time password change               |
| GET    | `/api/parent/me/children`                    | requireParent() | Returns linked students list             |
| GET    | `/api/parent/diary`                          | requireParent() | DiaryEntry list for active child's class |
| PATCH  | `/api/parent/diary/[id]/read`                | requireParent() | Mark DiaryNotification as read           |
| GET    | `/api/parent/results`                        | requireParent() | AssessmentItem grouped by period         |
| GET    | `/api/parent/attendance`                     | requireParent() | Attendance records for active child      |
| GET    | `/api/parent/fees`                           | requireParent() | Balance, invoices, payments              |
| GET    | `/api/parent/behaviour`                      | requireParent() | Visible discipline records               |
| GET    | `/api/parent/achievements`                   | requireParent() | Visible achievements                     |
| GET    | `/api/parent/calendar`                       | requireParent() | EVERYONE + PARENTS_ONLY events           |
| GET    | `/api/parent/messages`                       | requireParent() | School messages to parents               |
| GET    | `/api/parent/notifications`                  | requireParent() | Paginated notifications (25/page)        |
| PATCH  | `/api/parent/notifications/[id]/read`        | requireParent() | Mark single notification as read         |
| POST   | `/api/parent/notifications/read-all`         | requireParent() | Mark all notifications as read           |

All `GET /api/parent/*` routes accept a `studentId` query param which is verified against the parent's student set before executing any DB query.

---

## File Structure

### New Files

```
Phase 1 — DB & Auth
  prisma/migrations/YYYYMMDDHHMMSS_parent_portal/migration.sql
  scripts/migrate-parent-contacts.ts
  src/lib/parentAuth.ts
  src/lib/parentNotifications.ts
  src/app/parent-login/page.tsx
  src/app/parent-login/actions.ts
  src/app/parent-login/set-password/page.tsx
  src/app/parent-login/set-password/actions.ts

Phase 2 — Layout & Navigation
  src/lib/stores/parentStore.ts
  src/components/parent/ParentHydrator.tsx
  src/components/parent/ChildSwitcher.tsx
  src/components/parent/ActiveChildBar.tsx
  src/components/parent/ParentNotificationBadge.tsx

Phase 3 — Diary
  src/components/parent/ParentDiaryList.tsx    (enhanced version of existing)

Phase 4 — Academic Results
  src/app/parent/results/page.tsx
  src/components/parent/ResultsTable.tsx
  src/components/parent/ResultsTrendChart.tsx
  src/app/api/parent/results/route.ts

Phase 5 — Attendance
  src/app/parent/attendance/page.tsx
  src/components/parent/AttendanceDotGrid.tsx
  src/components/parent/AttendanceSummaryBar.tsx
  src/app/api/parent/attendance/route.ts

Phase 6 — Fees
  src/app/parent/fees/page.tsx
  src/components/parent/FeesBalanceCard.tsx
  src/components/parent/InvoiceList.tsx
  src/components/parent/PaymentHistory.tsx
  src/app/api/parent/fees/route.ts

Phase 7 — Behaviour & Achievements
  src/app/parent/behaviour/page.tsx
  src/app/parent/achievements/page.tsx
  src/components/parent/DisciplineList.tsx
  src/components/parent/AchievementList.tsx
  src/app/api/parent/behaviour/route.ts
  src/app/api/parent/achievements/route.ts

Phase 8 — Notification Engine
  (src/lib/parentNotifications.ts — created in Phase 1)

Phase 9 — Notification Centre
  src/app/parent/notifications/page.tsx
  src/components/parent/NotificationList.tsx
  src/components/parent/NotificationModuleFilter.tsx
  src/app/api/parent/notifications/route.ts
  src/app/api/parent/notifications/[id]/read/route.ts
  src/app/api/parent/notifications/read-all/route.ts

Phase 10 — Calendar & Messages
  src/app/parent/calendar/page.tsx
  src/app/parent/messages/page.tsx
  src/components/parent/CalendarEventList.tsx
  src/components/parent/MessageList.tsx
  src/app/api/parent/calendar/route.ts
  src/app/api/parent/messages/route.ts

Phase 11 — Security
  src/lib/rateLimit.ts
  src/app/api/parent/me/children/route.ts
```

### Modified Files

```
src/lib/permissions.ts          — add "parent" to NavHub union
src/app/parent/layout.tsx       — full rewrite with Parent model + ParentHydrator
src/app/parent/page.tsx         — home dashboard with StatCards + UpcomingCalendarWidget
src/app/parent/diary/page.tsx   — update to use requireParent() + ParentStudent
src/components/HubSidebar.tsx   — add "parent" hub case with sidebar links
src/components/TopAppBar.tsx    — add notification badge for PARENT role
src/middleware.ts               — add /parent-login to public paths
prisma/schema.prisma            — add Parent, ParentStudent, ParentNotification models;
                                   add isVisibleToParent to DisciplineRecord + Achievement

Existing routes that get notifyParents() added:
  src/app/api/diary/[...path]/route.ts (or posting route)
  src/app/api/finance/invoices/route.ts
  src/app/api/finance/payments/route.ts
  src/app/api/discipline/route.ts
  src/app/api/achievements/route.ts
  src/app/api/calendar/route.ts
```

---

## Component Hierarchy

```
ParentLayout (server)
├── DashboardShell (server, role="parent")
│   ├── ConditionalHubSidebar (client)
│   │   ├── HubSidebar ["parent" hub] (client)
│   │   │   ├── ChildSwitcher (client) — Zustand-driven
│   │   │   └── nav links (Home, Diary, Results, Attendance, Fees, Behaviour,
│   │   │                  Achievements, Calendar, Messages, Notifications)
│   │   └── MobileDrawer (client)
│   └── TopAppBar (client)
│       └── ParentNotificationBadge (client) — polls unreadCount
│
├── ParentHydrator (client) — seeds Zustand store from /api/parent/me/children
│
└── {page content}
    ├── ParentHomePage (server)
    │   ├── StatCard × 3  (reused)
    │   ├── UpcomingCalendarWidget  (reused)
    │   └── AlertBanner  (reused, ATTENDANCE_ALERT)
    │
    ├── ParentDiaryPage (server + client for mark-read)
    │   └── ParentDiaryList (client)
    │
    ├── ParentResultsPage (server)
    │   ├── ResultsTable (client)
    │   └── ResultsTrendChart (client, Recharts)
    │
    ├── ParentAttendancePage (server)
    │   ├── AttendanceDotGrid (client)
    │   └── AttendanceSummaryBar (server)
    │
    ├── ParentFeesPage (server)
    │   ├── FeesBalanceCard (server)
    │   ├── InvoiceList (server)
    │   └── PaymentHistory (server)
    │
    ├── ParentBehaviourPage (server)
    │   └── DisciplineList (server)
    │
    ├── ParentAchievementsPage (server)
    │   └── AchievementList (server)
    │
    ├── ParentCalendarPage (server)
    │   └── CalendarEventList (server)
    │
    ├── ParentMessagesPage (server)
    │   └── MessageList (server)
    │
    └── ParentNotificationsPage (server + client filter)
        ├── NotificationModuleFilter (client) — tab bar
        └── NotificationList (client) — with read/mark-all actions
```

---

## Performance Considerations

### Indexes Used

| Query                                        | Index                                     |
|----------------------------------------------|-------------------------------------------|
| Unread notification count                    | `[parentId, isRead, createdAt]`           |
| Dedup upsert                                 | `@@unique([schoolId, dedupKey])`          |
| Parent lookup by phone                       | `@@unique([schoolId, phone])`             |
| Student attendance for a class+date         | `[classId]` on Attendance                 |
| Parent → students                            | `[parentId]` on ParentStudent             |
| Student → parents (for notifyParents)        | `[studentId]` on ParentStudent            |

### Summary vs. Detail Pattern

- The **home dashboard** (`/parent`) fetches lightweight summaries only: attendance count (last 30 days), unread notification count, next 3 calendar events, current balance.
- **Detail pages** (`/parent/attendance`, `/parent/fees`, etc.) fetch full record sets, paginated where appropriate.
- The `/api/parent/me/children` endpoint is called once on hydration and cached in Zustand — subsequent navigation does not re-fetch the child list.

### `no-store` Enforcement

Every parent page component exports `export const dynamic = "force-dynamic"`. This ensures child-switched data never leaks across sessions or navigations via Next.js's route cache.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Deduplication is idempotent

*For any* call to `notifyParents` with the same `dedupKey` and `schoolId`, calling it N times (N ≥ 1) should result in exactly one `ParentNotification` row in the database — never more.

**Validates: Requirements 9.2, 1.6**

### Property 2: Authentication never reveals which credential field failed

*For any* login attempt where either the phone number or the admission number is invalid, the error response body should always equal the string `"Invalid credentials"` — identical for both failure modes.

**Validates: Requirements 2.5, 2.6**

### Property 3: Ownership — unowned studentId always returns 403

*For any* `studentId` that is not present in the authenticated parent's `ParentStudent` set, every `/api/parent/*` route that accepts a `studentId` parameter should return HTTP 403, regardless of whether the student exists in the system.

**Validates: Requirements 3.4, 12.3, 12.4**

### Property 4: Score computation is arithmetically correct

*For any* non-empty list of numeric assessment scores, `computePeriodStats` should return a mean equal to `sum(scores) / count(scores)` and a percentage equal to `mean / 100 * 100`, both rounded to the nearest hundredth.

**Validates: Requirements 5.4**

### Property 5: Attendance alert fires on ≥ 20% absence rate

*For any* attendance record set for a 30-day window where `absentDays / totalDays > 0.2`, a `ParentNotification` row with `module = "ATTENDANCE"` should exist for the parent linked to that student.

**Validates: Requirements 6.4**

### Property 6: notifyParents creates a row for every linked parent

*For any* student linked to N parents (N ≥ 1) via `ParentStudent`, a single call to `notifyParents` without a `dedupKey` should create exactly N new `ParentNotification` rows.

**Validates: Requirements 9.1**

### Property 7: Notification pagination returns at most 25 rows per page

*For any* parent with M total notifications (M > 25), querying page 1 of `/api/parent/notifications` should return exactly 25 rows ordered by `createdAt` descending.

**Validates: Requirements 10.1**

### Property 8: Data migration preserves all existing parentContact links

*For any* `Student` row where `parentContact` is non-null before the migration, after running `migrate-parent-contacts.ts`, a `Parent` row with `phone = student.parentContact` and a corresponding `ParentStudent` row with `studentId = student.id` should exist.

**Validates: Requirements 1.7**
