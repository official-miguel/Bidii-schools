# Design Document — Diary Module

## Introduction

This document describes the technical architecture, data models, API contracts, component structure, and correctness properties for the Diary Module in the Bidii School Management System.

The module is additive: it introduces new Prisma models, a new `Module` enum value, and new routes under `/teacher/diary` and `/parent/diary`. It does not alter existing models or break existing routes.

---

## Architecture Overview

The Diary Module follows the same layered architecture used throughout the Bidii codebase:

```
Browser
  └── Next.js App Router (React Server Components + Client Components)
        └── API Routes (src/app/api/diary/*)
              └── Prisma ORM (PostgreSQL / Supabase)
```

Key decisions:
- **Server components** handle initial data fetching (no loading spinners on first paint for supported browsers).
- **Client components** handle interactive forms (modal, filters, mark-complete).
- **API routes** follow the `requireSchoolRole` + Zod validation pattern already established in the codebase.
- **Overdue status** is computed on read via `resolveStatus()` — no cron job required for v1.
- **Notifications** are fired-and-forgotten after the transaction commits — a failure never rolls back the diary entry.
- **No rich-text library** — all text input uses plain `<textarea>`.

---

## Data Models

### Prisma Schema Additions

#### Enums

```prisma
// Added to existing Module enum
enum Module {
  // ... existing values ...
  DIARY
}

enum DiaryEntryType {
  ASSIGNMENT
  HOMEWORK
  REVISION
  PROJECT
  ANNOUNCEMENT
}

enum DiaryRecipientStatus {
  PENDING
  COMPLETED
  OVERDUE  // computed at read time; never written to DB
}
```

> **Note:** `DiaryRecipientStatus.OVERDUE` is defined in the enum for type-safety but the DB column stores only `PENDING` or `COMPLETED`. The `OVERDUE` value is computed at query time via `resolveStatus()`.

#### DiaryEntry

```prisma
model DiaryEntry {
  id          String         @id @default(cuid())
  schoolId    String
  teacherId   String
  subjectId   String
  title       String         @db.VarChar(255)
  description String?        @db.Text
  entryType   DiaryEntryType
  dueDate     DateTime?
  deletedAt   DateTime?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  school    School    @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  teacher   Teacher   @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  subject   Subject   @relation(fields: [subjectId], references: [id])

  targets       DiaryTarget[]
  recipients    DiaryRecipient[]
  notifications DiaryNotification[]

  @@index([schoolId, deletedAt])
  @@index([teacherId])
  @@index([schoolId, teacherId, deletedAt])
  @@index([schoolId, dueDate])
}
```

#### DiaryTarget

```prisma
model DiaryTarget {
  id           String      @id @default(cuid())
  diaryEntryId String
  classId      String
  createdAt    DateTime    @default(now())

  diaryEntry  DiaryEntry  @relation(fields: [diaryEntryId], references: [id], onDelete: Cascade)
  schoolClass SchoolClass @relation(fields: [classId], references: [id], onDelete: Cascade)

  @@unique([diaryEntryId, classId])
  @@index([diaryEntryId])
  @@index([classId])
}
```

#### DiaryRecipient

```prisma
model DiaryRecipient {
  id           String               @id @default(cuid())
  diaryEntryId String
  studentId    String
  schoolId     String
  // Stored status: only PENDING or COMPLETED written to DB; OVERDUE computed at read time
  status       DiaryRecipientStatus @default(PENDING)
  completedAt  DateTime?
  createdAt    DateTime             @default(now())
  updatedAt    DateTime             @updatedAt

  diaryEntry DiaryEntry @relation(fields: [diaryEntryId], references: [id], onDelete: Cascade)
  student    Student    @relation(fields: [studentId], references: [id], onDelete: Cascade)
  school     School     @relation(fields: [schoolId], references: [id], onDelete: Cascade)

  @@unique([diaryEntryId, studentId])
  @@index([studentId, status])
  @@index([diaryEntryId])
  @@index([schoolId])
}
```

#### DiaryNotification

```prisma
model DiaryNotification {
  id           String   @id @default(cuid())
  schoolId     String
  diaryEntryId String
  userId       String
  message      String
  isRead       Boolean  @default(false)
  createdAt    DateTime @default(now())

  school     School     @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  diaryEntry DiaryEntry @relation(fields: [diaryEntryId], references: [id], onDelete: Cascade)
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@index([schoolId, createdAt])
  @@index([userId, createdAt])
}
```

### Schema Relations Added to Existing Models

The following back-relations must be added to existing models:

```prisma
// Teacher model — add:
diaryEntries DiaryEntry[]

// Student model — add:
diaryRecipients DiaryRecipient[]

// Subject model — add:
diaryEntries DiaryEntry[]

// School model — add:
diaryEntries     DiaryEntry[]
diaryRecipients  DiaryRecipient[]
diaryNotifications DiaryNotification[]

// SchoolClass model — add:
diaryTargets DiaryTarget[]

// User model — add:
diaryNotifications DiaryNotification[]
```

---

## Business Logic

### Teacher Authorization Context

All teacher diary operations begin with `getTeacherDiaryContext()`:

```typescript
// src/app/api/diary/_lib.ts

import { prisma } from "@/lib/prisma";

export interface TeacherDiaryContext {
  teacher: { id: string };
  authorizedSet: Set<string>; // key = `${classId}:${subjectId}`
  subjectIds: string[];
}

export async function getTeacherDiaryContext(
  userId: string,
  schoolId: string
): Promise<TeacherDiaryContext> {
  const teacher = await prisma.teacher.findUnique({ where: { userId } });
  if (!teacher) throw new Error("No teacher record found.");

  const [core, elective] = await Promise.all([
    prisma.classSubjectTeacher.findMany({
      where: { teacherId: teacher.id },
      include: { schoolClass: true, subject: true },
    }),
    prisma.classElectiveGroupTeacher.findMany({
      where: { teacherId: teacher.id, schoolId },
      select: { classId: true, subjectId: true, schoolClass: true, subject: true },
    }),
  ]);

  const authorizedSet = new Set([
    ...core.map((a) => `${a.classId}:${a.subjectId}`),
    ...elective.map((a) => `${a.classId}:${a.subjectId}`),
  ]);

  const subjectIds = [
    ...new Set([
      ...core.map((a) => a.subjectId),
      ...elective.map((a) => a.subjectId),
    ]),
  ];

  return { teacher, authorizedSet, subjectIds };
}
```

### Overdue Status Resolution

```typescript
// src/app/api/diary/_lib.ts

export function resolveStatus(
  storedStatus: "PENDING" | "COMPLETED",
  dueDate: Date | null
): "PENDING" | "COMPLETED" | "OVERDUE" {
  if (storedStatus === "COMPLETED") return "COMPLETED";
  if (dueDate && new Date() > dueDate) return "OVERDUE";
  return "PENDING";
}
```

### Notification Creation

```typescript
// src/app/api/diary/_lib.ts

const TYPE_LABELS: Record<string, string> = {
  ASSIGNMENT:   "Assignment",
  HOMEWORK:     "Homework",
  REVISION:     "Revision",
  PROJECT:      "Project",
  ANNOUNCEMENT: "Announcement",
};

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });
}

export async function createDiaryNotifications(
  entry: { id: string; schoolId: string; entryType: string; dueDate: Date | null },
  studentIds: string[],
  subjectName: string
): Promise<void> {
  try {
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, fullName: true, userId: true, parentContact: true },
    });

    const typeLabel = TYPE_LABELS[entry.entryType] ?? entry.entryType;
    // ANNOUNCEMENT entries never include a due date segment (Req 9.4)
    const isAnnouncement = entry.entryType === "ANNOUNCEMENT";
    const dueStr =
      !isAnnouncement && entry.dueDate
        ? ` Due ${formatDay(entry.dueDate)}.`
        : "";

    const notifications: {
      schoolId: string;
      diaryEntryId: string;
      userId: string;
      message: string;
    }[] = [];

    for (const student of students) {
      const firstName = student.fullName.split(" ")[0];
      const msg = `📚 New ${subjectName} ${typeLabel} — ${firstName} has a new ${subjectName} ${typeLabel.toLowerCase()}.${dueStr}`;

      if (student.userId) {
        notifications.push({
          schoolId: entry.schoolId,
          diaryEntryId: entry.id,
          userId: student.userId,
          message: msg,
        });
      }

      if (student.parentContact) {
        const parentUser = await prisma.user.findFirst({
          where: {
            email: student.parentContact,
            schoolId: entry.schoolId,
            role: "PARENT",
          },
        });
        if (parentUser) {
          notifications.push({
            schoolId: entry.schoolId,
            diaryEntryId: entry.id,
            userId: parentUser.id,
            message: msg,
          });
        }
      }
    }

    if (notifications.length > 0) {
      await prisma.diaryNotification.createMany({
        data: notifications,
        skipDuplicates: true,
      });
    }
  } catch (err) {
    // Non-fatal: notification failures must never roll back the diary entry (Req 9.6)
    console.error("[DiaryNotifications] Failed to create notifications:", err);
  }
}
```

---

## API Routes

### POST `/api/diary` — Create diary entry

```typescript
// src/app/api/diary/route.ts

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { getTeacherDiaryContext, createDiaryNotifications } from "./_lib";

const createSchema = z.object({
  subjectId:     z.string().cuid(),
  classIds:      z.array(z.string().cuid()).min(1),
  title:         z.string().trim().min(1, "Title is required.").max(255),
  description:   z.string().trim().optional(),
  entryType:     z.enum(["ASSIGNMENT", "HOMEWORK", "REVISION", "PROJECT", "ANNOUNCEMENT"]),
  dueDate:       z.string().datetime({ offset: true }).optional().nullable(),
  studentIds:    z.array(z.string().cuid()).optional(), // if undefined, all students in targeted classes
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { subjectId, classIds, title, description, entryType, dueDate, studentIds } = parsed.data;

  let ctx;
  try {
    ctx = await getTeacherDiaryContext(user.id, user.schoolId);
  } catch {
    return NextResponse.json({ error: "Teacher record not found." }, { status: 403 });
  }

  // Validate teacher is authorized for every (classId, subjectId) pair (Req 3.13)
  for (const classId of classIds) {
    const key = `${classId}:${subjectId}`;
    if (!ctx.authorizedSet.has(key)) {
      return NextResponse.json(
        { error: "You can't post to this class because you are not assigned to teach this subject there." },
        { status: 403 }
      );
    }
  }

  // Load students in targeted classes (Req 11.1 — never load all school students)
  const allStudents = await prisma.student.findMany({
    where: {
      schoolId: user.schoolId,
      classId:  { in: classIds },
      archivedAt: null,
    },
    select: { id: true },
  });

  let recipientStudentIds: string[];
  if (studentIds && studentIds.length > 0) {
    // Validate specific students belong to targeted classes (Req 3.14)
    const validIds = new Set(allStudents.map((s) => s.id));
    const invalid = studentIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Some specified students do not belong to the targeted classes." },
        { status: 400 }
      );
    }
    recipientStudentIds = studentIds;
  } else {
    recipientStudentIds = allStudents.map((s) => s.id);
  }

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.diaryEntry.create({
        data: {
          schoolId:    user.schoolId,
          teacherId:   ctx.teacher.id,
          subjectId,
          title,
          description: description ?? null,
          entryType,
          dueDate:     dueDate ? new Date(dueDate) : null,
        },
      });

      await tx.diaryTarget.createMany({
        data: classIds.map((classId) => ({
          diaryEntryId: created.id,
          classId,
        })),
        skipDuplicates: true,
      });

      if (recipientStudentIds.length > 0) {
        await tx.diaryRecipient.createMany({
          data: recipientStudentIds.map((studentId) => ({
            diaryEntryId: created.id,
            studentId,
            schoolId:     user.schoolId,
            status:       "PENDING" as const,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    // Fire-and-forget notifications — never block the response (Req 9.6)
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { name: true },
    });
    createDiaryNotifications(
      entry,
      recipientStudentIds,
      subject?.name ?? "Unknown Subject"
    );

    return NextResponse.json({ ok: true, id: entry.id }, { status: 201 });
  } catch (err) {
    console.error("[DiaryEntry] Creation failed:", err);
    // Never expose raw Prisma error to client (Req 12.3)
    return NextResponse.json({ error: "Could not create diary entry. Please try again." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp       = req.nextUrl.searchParams;
  const typeFilter = sp.get("type") as string | null;
  const cursor   = sp.get("cursor") || undefined;
  const LIMIT    = 20;

  let ctx;
  try {
    ctx = await getTeacherDiaryContext(user.id, user.schoolId);
  } catch {
    return NextResponse.json({ error: "Teacher record not found." }, { status: 403 });
  }

  const where: Record<string, unknown> = {
    schoolId:  user.schoolId,
    teacherId: ctx.teacher.id,
    deletedAt: null,
    ...(typeFilter ? { entryType: typeFilter } : {}),
    ...(cursor ? { id: { lt: cursor } } : {}),
  };

  const entries = await prisma.diaryEntry.findMany({
    where,
    include: {
      subject: { select: { name: true } },
      targets: { include: { schoolClass: { select: { name: true } } } },
      _count:  { select: { recipients: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIMIT + 1,
  });

  const hasMore   = entries.length > LIMIT;
  const page      = hasMore ? entries.slice(0, LIMIT) : entries;
  const nextCursor = hasMore ? page[page.length - 1].id : undefined;

  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (nextCursor) headers["X-Next-Cursor"] = nextCursor;

  return NextResponse.json(page, { headers });
}
```

### GET/PATCH/DELETE `/api/diary/[id]`

```typescript
// src/app/api/diary/[id]/route.ts

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entry = await prisma.diaryEntry.findFirst({
    where: { id: params.id, schoolId: user.schoolId, deletedAt: null },
    include: {
      subject: { select: { name: true } },
      targets: { include: { schoolClass: { select: { name: true } } } },
    },
  });

  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Guard: only the teacher who created the entry may view the detail
  const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
  if (!teacher || entry.teacherId !== teacher.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(entry);
}

const patchSchema = z.object({
  title:       z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().optional().nullable(),
  dueDate:     z.string().datetime({ offset: true }).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message }, { status: 400 });
  }

  const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const entry = await prisma.diaryEntry.findFirst({
    where: { id: params.id, schoolId: user.schoolId, teacherId: teacher.id, deletedAt: null },
  });
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const updated = await prisma.diaryEntry.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.title !== undefined       ? { title: parsed.data.title }             : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.dueDate !== undefined     ? { dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const entry = await prisma.diaryEntry.findFirst({
    where: { id: params.id, schoolId: user.schoolId, teacherId: teacher.id, deletedAt: null },
  });
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.diaryEntry.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
```

### GET `/api/diary/[id]/recipients` — Student list with completion stats

```typescript
// src/app/api/diary/[id]/recipients/route.ts

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp        = req.nextUrl.searchParams;
  const search    = sp.get("q")?.trim() || undefined;
  const status    = sp.get("status") || undefined;
  const cursor    = sp.get("cursor") || undefined;
  const LIMIT     = 20;

  const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  // Ownership guard
  const entry = await prisma.diaryEntry.findFirst({
    where: { id: params.id, schoolId: user.schoolId, teacherId: teacher.id, deletedAt: null },
    select: { id: true, dueDate: true },
  });
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const recipientWhere: Record<string, unknown> = {
    diaryEntryId: params.id,
    ...(search   ? { student: { fullName: { contains: search, mode: "insensitive" } } } : {}),
    ...(cursor   ? { id: { gt: cursor } } : {}),
  };

  // Status filter is handled post-query because OVERDUE is computed
  const rawRecipients = await prisma.diaryRecipient.findMany({
    where: recipientWhere,
    include: { student: { select: { id: true, fullName: true } } },
    orderBy: [{ student: { fullName: "asc" } }, { id: "asc" }],
    take: LIMIT + 1,
  });

  const withStatus = rawRecipients.map((r) => ({
    ...r,
    resolvedStatus: resolveStatus(r.status as "PENDING" | "COMPLETED", entry.dueDate),
  }));

  const filtered = status
    ? withStatus.filter((r) => r.resolvedStatus === status)
    : withStatus;

  const hasMore   = filtered.length > LIMIT;
  const page      = hasMore ? filtered.slice(0, LIMIT) : filtered;
  const nextCursor = hasMore ? page[page.length - 1].id : undefined;

  // Completion stats: counts computed from all recipients (no pagination)
  const allRecipients = await prisma.diaryRecipient.findMany({
    where: { diaryEntryId: params.id },
    select: { status: true },
  });
  const stats = allRecipients.reduce(
    (acc, r) => {
      const resolved = resolveStatus(r.status as "PENDING" | "COMPLETED", entry.dueDate);
      acc[resolved] = (acc[resolved] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const headers: Record<string, string> = { "Cache-Control": "private, no-store" };
  if (nextCursor) headers["X-Next-Cursor"] = nextCursor;

  return NextResponse.json({ stats, recipients: page }, { headers });
}
```

### PATCH `/api/diary/[id]/recipients` — Mark student complete

```typescript
// src/app/api/diary/[id]/recipients/route.ts (continued)

const markCompleteSchema = z.object({
  studentId: z.string().cuid(),
  status:    z.enum(["COMPLETED", "PENDING"]),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = markCompleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message }, { status: 400 });
  }

  const teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  // Ownership guard
  const entry = await prisma.diaryEntry.findFirst({
    where: { id: params.id, schoolId: user.schoolId, teacherId: teacher.id, deletedAt: null },
  });
  if (!entry) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const updated = await prisma.diaryRecipient.updateMany({
    where: { diaryEntryId: params.id, studentId: parsed.data.studentId },
    data: {
      status:      parsed.data.status,
      completedAt: parsed.data.status === "COMPLETED" ? new Date() : null,
    },
  });

  if (updated.count === 0) return NextResponse.json({ error: "Recipient not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
```

### GET `/api/diary/student` — Student's own entries

```typescript
// src/app/api/diary/student/route.ts

export async function GET(req: NextRequest) {
  const user = await requireSchoolRole("STUDENT");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const student = await prisma.student.findFirst({
    where: { userId: user.id, schoolId: user.schoolId, archivedAt: null },
    select: { id: true },
  });
  if (!student) return NextResponse.json({ error: "Student record not found." }, { status: 404 });

  const recipients = await prisma.diaryRecipient.findMany({
    where: {
      studentId: student.id,
      schoolId:  user.schoolId,
      diaryEntry: { deletedAt: null },
    },
    include: {
      diaryEntry: {
        include: {
          subject: { select: { name: true } },
          targets: { include: { schoolClass: { select: { name: true } } } },
        },
      },
    },
    orderBy: { diaryEntry: { createdAt: "desc" } },
    take: 20,
  });

  // Compute resolved status and group
  const enriched = recipients.map((r) => ({
    ...r,
    resolvedStatus: resolveStatus(r.status as "PENDING" | "COMPLETED", r.diaryEntry.dueDate),
  }));

  return NextResponse.json(enriched);
}
```

### GET `/api/diary/parent` — Parent's children's entries

```typescript
// src/app/api/diary/parent/route.ts

export async function GET(req: NextRequest) {
  const user = await requireSchoolRole("PARENT", "STUDENT");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp        = req.nextUrl.searchParams;
  const studentId = sp.get("studentId") || undefined;

  // Find linked students (Req 8.2)
  const students = await prisma.student.findMany({
    where: {
      schoolId:  user.schoolId,
      archivedAt: null,
      OR: [
        { userId:        user.id },
        { parentContact: user.email },
      ],
    },
    select: { id: true, fullName: true, classId: true, schoolClass: { select: { name: true } } },
  });

  if (students.length === 0) {
    return NextResponse.json({ students: [], entries: [] });
  }

  // If a specific studentId is requested, verify it belongs to this parent
  let targetStudentId: string;
  if (studentId) {
    const owned = students.find((s) => s.id === studentId);
    if (!owned) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    targetStudentId = studentId;
  } else {
    targetStudentId = students[0].id;
  }

  const recipients = await prisma.diaryRecipient.findMany({
    where: {
      studentId: targetStudentId,
      schoolId:  user.schoolId,
      diaryEntry: { deletedAt: null },
    },
    include: {
      diaryEntry: {
        include: {
          subject: { select: { name: true } },
          targets: { include: { schoolClass: { select: { name: true } } } },
        },
      },
    },
    orderBy: { diaryEntry: { createdAt: "desc" } },
    take: 20,
  });

  const enriched = recipients.map((r) => ({
    ...r,
    resolvedStatus: resolveStatus(r.status as "PENDING" | "COMPLETED", r.diaryEntry.dueDate),
  }));

  return NextResponse.json({ students, entries: enriched });
}
```

### GET `/api/diary/teacher-context` — Teacher's subjects and authorized classes

```typescript
// src/app/api/diary/teacher-context/route.ts

export async function GET() {
  const user = await requireSchoolRole("TEACHER");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let ctx;
  try {
    ctx = await getTeacherDiaryContext(user.id, user.schoolId);
  } catch {
    return NextResponse.json({ error: "Teacher record not found." }, { status: 403 });
  }

  const subjects = await prisma.subject.findMany({
    where: { id: { in: ctx.subjectIds } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  // Build subject → authorized classes mapping
  const classIdsBySubject: Record<string, string[]> = {};
  for (const key of ctx.authorizedSet) {
    const [classId, subjectId] = key.split(":");
    if (!classIdsBySubject[subjectId]) classIdsBySubject[subjectId] = [];
    classIdsBySubject[subjectId].push(classId);
  }

  const allClassIds = [...new Set(Object.values(classIdsBySubject).flat())];
  const classes = await prisma.schoolClass.findMany({
    where: { id: { in: allClassIds } },
    select: { id: true, name: true, form: true, stream: true },
    orderBy: [{ form: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ subjects, classIdsBySubject, classes });
}
```

### GET/PATCH `/api/diary/notifications`

```typescript
// src/app/api/diary/notifications/route.ts

export async function GET(req: NextRequest) {
  const user = await requireSchoolRole("TEACHER", "STUDENT", "PARENT");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp    = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(sp.get("limit") ?? "20", 10), 50);

  const [notifications, unreadCount] = await Promise.all([
    prisma.diaryNotification.findMany({
      where: { userId: user.id, schoolId: user.schoolId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.diaryNotification.count({
      where: { userId: user.id, schoolId: user.schoolId, isRead: false },
    }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH(req: NextRequest) {
  const user = await requireSchoolRole("TEACHER", "STUDENT", "PARENT");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const notificationIds: string[] | undefined = body?.ids;

  if (notificationIds && notificationIds.length > 0) {
    // Mark specific notifications as read
    await prisma.diaryNotification.updateMany({
      where: { id: { in: notificationIds }, userId: user.id, schoolId: user.schoolId },
      data: { isRead: true },
    });
  } else {
    // Mark all as read
    await prisma.diaryNotification.updateMany({
      where: { userId: user.id, schoolId: user.schoolId, isRead: false },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
}
```

---

## Navigation Bootstrap

### `src/lib/permissions.ts` additions

```typescript
// Add "diary" to NavHub type:
export type NavHub =
  | "dashboard"
  | "academic"
  | "people"
  | "student-life"
  | "calendar"
  | "communication"
  | "administration"
  | "diary";  // NEW

// Add to MODULE_INFO:
DIARY: { label: "Diary", description: "Post and view assignments, homework, and announcements", hub: "diary" },
```

### `src/components/HubSidebar.tsx` additions

```typescript
import { BookOpen } from "lucide-react";

// Add to HUB_DEFS array:
{ id: "diary" as NavHub, label: "Diary", Icon: BookOpen, seg: "diary" },

// Add to HUB_SEG_MAP:
diary: "diary",
```

### `src/app/teacher/layout.tsx` addition

```typescript
// After visibleHubs is computed:
visibleHubs.add("diary");
```

### `src/app/parent/layout.tsx` addition

```typescript
const PARENT_HUBS = new Set<NavHub>(["dashboard", "calendar", "communication", "diary"]);
```

---

## Pages

### Teacher Diary Home — `src/app/teacher/diary/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DiaryFilters from "@/components/diary/DiaryFilters";
import DiaryEntryCard from "@/components/diary/DiaryEntryCard";
import CreateEntryModal from "@/components/diary/CreateEntryModal";

export default async function TeacherDiaryPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!teacher) redirect("/teacher");

  const typeFilter = searchParams.type || undefined;
  const LIMIT = 20;
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

  const [entries, dueSoon] = await Promise.all([
    prisma.diaryEntry.findMany({
      where: {
        schoolId:  user.schoolId!,
        teacherId: teacher.id,
        deletedAt: null,
        ...(typeFilter ? { entryType: typeFilter as never } : {}),
      },
      include: {
        subject: { select: { name: true } },
        targets: { include: { schoolClass: { select: { name: true } } } },
        _count:  { select: { recipients: true } },
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    prisma.diaryEntry.findMany({
      where: {
        schoolId:  user.schoolId!,
        teacherId: teacher.id,
        deletedAt: null,
        dueDate:   { gte: now, lte: soon },
      },
      include: {
        subject: { select: { name: true } },
        targets: { include: { schoolClass: { select: { name: true } } } },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink dark:text-dark-text">Diary</h1>
        {/* CreateEntryModal is a client component */}
        <CreateEntryModal />
      </div>

      {dueSoon.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-slate dark:text-dark-muted mb-3">Due Soon</h2>
          <div className="space-y-2">
            {dueSoon.map((entry) => (
              <DiaryEntryCard key={entry.id} entry={entry} variant="compact" />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-slate dark:text-dark-muted">Recent Entries</h2>
          <DiaryFilters activeType={typeFilter} />
        </div>

        {entries.length === 0 ? (
          <div className="text-center py-12 text-slate dark:text-dark-muted">
            <p className="text-sm">No entries yet.</p>
            <p className="text-xs mt-1">Create your first entry to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <DiaryEntryCard key={entry.id} entry={entry} variant="full" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

### Teacher Entry Detail — `src/app/teacher/diary/[id]/page.tsx`

```tsx
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EntryDetailClient from "@/components/diary/EntryDetailClient";
import { resolveStatus } from "@/app/api/diary/_lib";

export default async function EntryDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!teacher) redirect("/teacher");

  const entry = await prisma.diaryEntry.findFirst({
    where: {
      id:        params.id,
      schoolId:  user.schoolId!,
      teacherId: teacher.id,
      deletedAt: null,
    },
    include: {
      subject: { select: { name: true } },
      targets: { include: { schoolClass: { select: { name: true } } } },
    },
  });

  if (!entry) notFound();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <EntryDetailClient entry={entry} />
    </div>
  );
}
```

### Parent/Student Diary — `src/app/parent/diary/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import StudentDiaryView from "@/components/diary/StudentDiaryView";
import ParentDiaryView from "@/components/diary/ParentDiaryView";
import { resolveStatus } from "@/app/api/diary/_lib";

export default async function ParentDiaryPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "PARENT" && user.role !== "STUDENT")) redirect("/login");

  if (user.role === "STUDENT") {
    const student = await prisma.student.findFirst({
      where: { userId: user.id, schoolId: user.schoolId!, archivedAt: null },
      select: { id: true },
    });

    if (!student) {
      return <StudentDiaryView entries={[]} />;
    }

    const recipients = await prisma.diaryRecipient.findMany({
      where: {
        studentId:  student.id,
        schoolId:   user.schoolId!,
        diaryEntry: { deletedAt: null },
      },
      include: {
        diaryEntry: {
          include: { subject: { select: { name: true } } },
        },
      },
      orderBy: { diaryEntry: { createdAt: "desc" } },
    });

    const enriched = recipients.map((r) => ({
      ...r,
      resolvedStatus: resolveStatus(
        r.status as "PENDING" | "COMPLETED",
        r.diaryEntry.dueDate
      ),
    }));

    return <StudentDiaryView entries={enriched} />;
  }

  // PARENT role
  const students = await prisma.student.findMany({
    where: {
      schoolId:  user.schoolId!,
      archivedAt: null,
      OR: [
        { userId:        user.id },
        { parentContact: user.email },
      ],
    },
    select: {
      id: true,
      fullName: true,
      classId: true,
      schoolClass: { select: { name: true } },
    },
  });

  return <ParentDiaryView students={students} parentUserId={user.id} schoolId={user.schoolId!} />;
}
```

---

## Client Components

### `CreateEntryModal.tsx`

The primary teacher interaction surface. Opens as a slide-over sheet or modal.

**State machine:**
```
idle → open → selectType → fillForm → submitting → success/error
```

**Key responsibilities:**
- Fetch teacher context from `/api/diary/teacher-context` on open.
- Auto-hide subject selector if `subjects.length === 1`.
- Cascade: selecting a subject repopulates the class selector.
- Show/hide due date based on `entryType !== "ANNOUNCEMENT"`.
- Update Post button label dynamically: `"Post ${TYPE_LABELS[entryType]}"`.
- POST to `/api/diary` on submit; close modal and refresh on success.

```tsx
"use client";

import { useState, useEffect } from "react";

const TYPE_LABELS: Record<string, string> = {
  ASSIGNMENT:   "Assignment",
  HOMEWORK:     "Homework",
  REVISION:     "Revision",
  PROJECT:      "Project",
  ANNOUNCEMENT: "Announcement",
};

const TYPES = Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[];

export default function CreateEntryModal() {
  const [open, setOpen] = useState(false);
  const [entryType, setEntryType] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [context, setContext] = useState<{
    subjects: { id: string; name: string }[];
    classIdsBySubject: Record<string, string[]>;
    classes: { id: string; name: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    if (open && !context) {
      fetch("/api/diary/teacher-context")
        .then((r) => r.json())
        .then(setContext);
    }
  }, [open, context]);

  const availableClasses = context && subjectId
    ? (context.classIdsBySubject[subjectId] ?? [])
        .map((id) => context.classes.find((c) => c.id === id))
        .filter(Boolean)
    : [];

  const showSubjectSelector = context && context.subjects.length > 1;
  const showDueDate = entryType !== "" && entryType !== "ANNOUNCEMENT";
  const postLabel = entryType ? `Post ${TYPE_LABELS[entryType]}` : "Post";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTitleError(null);
    if (!title.trim()) {
      setTitleError("Title is required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId,
        classIds,
        title:       title.trim(),
        description: description.trim() || undefined,
        entryType,
        dueDate:     dueDate || null,
      }),
    });

    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create entry.");
      return;
    }
    setOpen(false);
    window.location.reload(); // or router.refresh() in a router-aware context
  }

  // ... render form with type tiles, subject/class selectors, textarea, etc.
}
```

### `DiaryEntryCard.tsx`

```tsx
// Displays a diary entry as a card with:
// - Type badge (colour-coded: ASSIGNMENT=teal, HOMEWORK=slate, REVISION=warn, PROJECT=success, ANNOUNCEMENT=slate)
// - Title
// - Subject name
// - Class name(s)
// - Due date (formatted, "Due Mon 12 May")
// - Recipient count (for teacher view)
// - Link to /teacher/diary/[id]
```

### `DiaryFilters.tsx`

```tsx
"use client";
// Filter pills for diary entry type + class dropdown
// Updates URL search params with router.push for server-side filtering
```

### `EntryDetailClient.tsx`

```tsx
"use client";
// Displays:
// - Entry metadata (title, subject, class(es), posted date, due date, instructions)
// - "Edited X ago" if entry.updatedAt > entry.createdAt by > 1 min
// - Completion stats bar (COMPLETED / PENDING / OVERDUE counts)
// - Student list with search input, status filter, and mark-complete toggle
// - Fetches /api/diary/[id]/recipients with search/filter/cursor pagination
```

### `StudentDiaryView.tsx`

```tsx
"use client";
// Groups entries into four sections: New, Due Soon, Completed, Overdue
// Section logic:
//   New: resolvedStatus === "PENDING" and dueDate > now+2days (or no dueDate)
//   Due Soon: resolvedStatus === "PENDING" and dueDate within 2 days
//   Completed: resolvedStatus === "COMPLETED"
//   Overdue: resolvedStatus === "OVERDUE"
// Shows skeleton cards while loading
// Shows empty state per section
```

### `ParentDiaryView.tsx`

```tsx
"use client";
// When students.length > 1: renders child switcher tabs/dropdown
// Fetches /api/diary/parent?studentId=... for selected child
// Delegates rendering to StudentDiaryView for the active child
// Shows child name, class name, new entry count badge
```

---

## Data Flow Summary

### Entry Creation Flow

```
CreateEntryModal
→ POST /api/diary
  → requireSchoolRole("TEACHER")
  → Zod validation
  → getTeacherDiaryContext()
  → validate each classId in authorizedSet
  → if studentIds provided: validate each belongs to targeted class
  → prisma.student.findMany({ classId: { in: classIds } }) ← scoped query
  → prisma.$transaction([
      create DiaryEntry,
      createMany DiaryTarget (1 per class),
      createMany DiaryRecipient (1 per student),
    ])
  → createDiaryNotifications() ← fire-and-forget
  → return { ok: true, id: entry.id }
```

### Student View Flow

```
/parent/diary (server component)
→ getCurrentUser() → role === STUDENT
→ prisma.student.findFirst({ userId })
→ prisma.diaryRecipient.findMany({ studentId, diaryEntry: { deletedAt: null } })
→ resolveStatus() per recipient
→ <StudentDiaryView entries={enriched} />
  → group by resolvedStatus into 4 sections
```

### Parent View Flow

```
/parent/diary (server component)
→ getCurrentUser() → role === PARENT
→ prisma.student.findMany({ OR: [{ userId }, { parentContact: email }] })
→ <ParentDiaryView students={students} />
  → child switcher (if >1)
  → fetch /api/diary/parent?studentId=...
  → render cards with status badge
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

**Property reflection notes:** After reviewing all identified testable criteria, the following consolidations were made:
- Properties 2.2, 7.4, 8.6, 10.1–10.5 all concern data isolation; these are consolidated into a single family of isolation properties (Properties 1, 2, 3).
- Properties 3.13 and 10.2 both test authorization rejection; consolidated into Property 4.
- Properties 6.2 and 10.6 both test soft-delete exclusion; consolidated into Property 5.
- Properties 3.12 (empty title) is a specific edge case of the validation guard and forms its own property.

---

### Property 1: Teacher query isolation

*For any* teacher querying their diary entries, the result set SHALL contain only DiaryEntry records where both `schoolId` equals the teacher's `schoolId` AND `teacherId` equals the teacher's id AND `deletedAt` IS NULL. No entry belonging to a different teacher or a different school shall appear in the result.

**Validates: Requirements 2.2, 10.1, 10.5**

---

### Property 2: Student view isolation

*For any* student querying their diary entries, the result set SHALL contain only DiaryRecipient records where `studentId` corresponds to that student's own Student record and the linked DiaryEntry has `deletedAt` IS NULL. No entry belonging to another student shall appear.

**Validates: Requirements 7.4, 10.3**

---

### Property 3: Parent view isolation

*For any* parent user querying diary entries, the result set SHALL contain only DiaryRecipient records for students where `Student.parentContact` equals the parent's email OR `Student.userId` equals the parent's id. No entry for a student not linked to this parent shall appear.

**Validates: Requirements 8.2, 8.6, 10.4**

---

### Property 4: Unauthorized class creation guard

*For any* diary entry creation request containing a `classId` not present in the teacher's AuthorizedClass set (the union of ClassSubjectTeacher and ClassElectiveGroupTeacher for that teacher's `subjectId`), the system SHALL reject the entire request with a 403 error and SHALL NOT create any DiaryEntry, DiaryTarget, or DiaryRecipient records.

**Validates: Requirements 3.13, 10.2**

---

### Property 5: Soft-deleted entries are universally excluded

*For any* DiaryEntry with `deletedAt` IS NOT NULL, that entry SHALL be absent from every query result returned to teachers, students, and parents — including list queries, detail queries, recipient queries, and notification detail views.

**Validates: Requirements 6.1, 6.2, 10.6**

---

### Property 6: Entry creation atomicity

*For any* valid diary entry creation request targeting N classes containing a total of M non-archived students, the system SHALL create exactly 1 DiaryEntry record, exactly N DiaryTarget records, and exactly M DiaryRecipient records (or fewer if `studentIds` is specified), all within a single atomic transaction such that partial creation is impossible.

**Validates: Requirements 3.11**

---

### Property 7: Type filter correctness

*For any* diary type filter value T applied to the teacher's entry list, every entry in the result set SHALL have `entryType` equal to T, and no entry with a different `entryType` shall appear in the result.

**Validates: Requirements 2.3**

---

### Property 8: Pagination bound

*For any* paginated list query in the diary module (teacher home, entry detail student list, student view), the number of records returned in a single response page SHALL never exceed 20.

**Validates: Requirements 2.6, 4.3, 11.2**

---

### Property 9: Specific student class membership guard

*For any* diary entry creation request targeting specific `studentIds`, every studentId in that list SHALL belong to a student whose `classId` is one of the request's `classIds`. If any studentId does not satisfy this membership, the system SHALL reject the entire request with a 400 error and create no records.

**Validates: Requirements 3.14**

---

### Property 10: Student-scoped recipient creation

*For any* diary entry creation request, the set of DiaryRecipient records created SHALL contain only students whose `classId` is one of the targeted classes. No student from a non-targeted class shall receive a DiaryRecipient record for the entry.

**Validates: Requirements 3.11, 10.1, 11.1**

---

### Property 11: Completion status round-trip

*For any* DiaryRecipient in PENDING state, after the teacher marks that recipient as complete via PATCH `/api/diary/[id]/recipients`, the DiaryRecipient record SHALL have `status` equal to `COMPLETED` and `completedAt` set to a non-null timestamp close to the time of the request.

**Validates: Requirements 4.6**

---

### Property 12: Edit round-trip

*For any* DiaryEntry, after a PATCH request supplying new values for `title`, `description`, and `dueDate`, a subsequent GET of the same entry SHALL return exactly those new values for those fields. All other fields (subject, targets, entryType, teacherId) SHALL remain unchanged.

**Validates: Requirements 5.1, 5.2, 5.3**

---

### Property 13: Authorization ownership guard

*For any* mutating operation (PATCH or DELETE) on a DiaryEntry, a request authenticated as a different teacher or a teacher in a different school SHALL be rejected without modifying any record. The entry SHALL remain unmodified.

**Validates: Requirements 5.5, 6.3**

---

### Property 14: Student grouping exhaustiveness

*For any* set of DiaryRecipient records belonging to a student, when rendered by StudentDiaryView, each recipient SHALL appear in exactly one of the four sections (New, Due Soon, Completed, Overdue) and the union of all four sections SHALL equal the complete set of the student's recipients.

**Validates: Requirements 7.2**

---

### Property 15: Notification count invariant — students

*For any* diary entry creation resulting in M DiaryRecipient records, the number of DiaryNotification records created for student users SHALL equal the count of those M recipient students who have a non-null `userId`. No student without a `userId` shall receive a notification record.

**Validates: Requirements 9.1**

---

### Property 16: Notification count invariant — parents

*For any* diary entry creation resulting in M DiaryRecipient records, the number of DiaryNotification records created for parent users SHALL equal the count of distinct parent User records whose `email` matches a `Student.parentContact` value for any student in the recipient list.

**Validates: Requirements 9.2**

---

### Property 17: Notification message format

*For any* diary entry and any recipient student, the DiaryNotification message SHALL match the format: `"📚 New {SubjectName} {TypeLabel} — {StudentFirstName} has a new {SubjectName} {typeLabelLower}."` optionally followed by `" Due {dueDay}."` when the entry has a non-null `dueDate` and the `entryType` is not `ANNOUNCEMENT`.

**Validates: Requirements 9.3, 9.4**

---

### Property 18: ANNOUNCEMENT entries never emit due date in notifications

*For any* DiaryEntry with `entryType` equal to `ANNOUNCEMENT`, every DiaryNotification message generated for that entry SHALL NOT contain the substring `"Due"`, regardless of whether a `dueDate` value is stored on the entry.

**Validates: Requirements 9.4**

---

### Property 19: Whitespace-only title rejection

*For any* string composed entirely of whitespace characters (spaces, tabs, newlines), submitting it as the `title` field in a diary entry creation request SHALL result in a validation error response and no DiaryEntry record being created.

**Validates: Requirements 3.12, 12.3**

---

### Property 20: Human-readable error responses

*For any* database or server error occurring during diary API route handling, the error response body SHALL contain only a human-readable `error` string and SHALL NOT contain any Prisma error codes, stack traces, raw SQL, or internal model names.

**Validates: Requirements 3.15, 12.3**

---

## Error Handling Strategy

All API routes follow the same error surface:

| Condition | HTTP Status | Response body |
|---|---|---|
| Unauthenticated | 401 | `{ "error": "Unauthorized" }` |
| Wrong role | 401 | `{ "error": "Unauthorized" }` |
| No teacher record | 403 | `{ "error": "Teacher record not found." }` |
| Unauthorized class | 403 | `{ "error": "You can't post to this class because you are not assigned to teach this subject there." }` |
| Unauthorized student | 400 | `{ "error": "Some specified students do not belong to the targeted classes." }` |
| Invalid input | 400 | `{ "error": "<first Zod error message>" }` |
| Entry not found / wrong teacher | 404 | `{ "error": "Not found." }` |
| DB / unexpected error | 500 | `{ "error": "Could not create diary entry. Please try again." }` |

Raw Prisma errors are never propagated to the client response body.

---

## Performance Considerations

1. **Student queries are always class-scoped** — `prisma.student.findMany({ classId: { in: classIds } })` — never school-scoped (Req 11.1).
2. **All list queries are paginated at 20 records** with cursor-based pagination.
3. **Required indexes:**
   - `DiaryEntry(schoolId, deletedAt)` — teacher list queries
   - `DiaryEntry(teacherId)` — teacher ownership filter
   - `DiaryEntry(schoolId, teacherId, deletedAt)` — composite for common teacher query pattern
   - `DiaryRecipient(studentId, status)` — student view grouping
   - `DiaryNotification(userId, isRead)` — unread count
   - `DiaryNotification(schoolId, createdAt)` — notification feed
4. **Notification creation** runs outside the main transaction (fire-and-forget) so it never blocks the API response.
5. **Overdue computation** happens at the application layer on read (`resolveStatus`), avoiding the need for a scheduled job.

---

## Accessibility and UX Notes

- All interactive elements are sized to a minimum of 44×44 CSS pixels (Req 12.1).
- Type tiles in the create form use large, touch-friendly buttons — each tile is at minimum `h-20` with full-width label.
- Skeleton card placeholders are rendered during all loading states.
- Every empty state includes a contextually relevant call-to-action.
- Dark mode is supported via the existing `dark:` Tailwind variants throughout.
- The `<textarea>` for instructions is a plain HTML `<textarea>` — no rich-text library (Req 12.2).
