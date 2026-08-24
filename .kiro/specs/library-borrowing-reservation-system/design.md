# Design Document — Library Borrowing & Reservation System

## Overview

This design closes ten circulation gaps in the Bidii School Management System's library module. The work is entirely contained within the existing Next.js 14 App Router codebase: six API routes are modified or created, one shared server helper is introduced, and two client pages receive an SSE-powered toast listener. No Prisma migrations are required.

---

## Architecture

### Component Map

```
Browser (client)
  └── CirculationDesk page  (src/app/staff/library/circulate/page.tsx)
      ├── useReservationToast hook  (NEW — SSE listener + shadcn Toast)
      └── return call → POST /api/library/circulate/return

  └── Scan Mode page  (src/app/staff/library/scan/page.tsx)
      └── useReservationToast hook  (same hook, imported)

Server (API routes)
  ├── src/lib/library/borrowHelper.ts          ← NEW shared loader
  ├── POST /api/library/circulate/return       ← BUG FIX + damaged flow + auto-assign
  ├── GET|POST /api/library/reservations       ← queue position for INDIVIDUAL
  ├── GET|PATCH|DELETE /api/library/reservations/[id]  ← cancellation queue reassign
  ├── POST /api/library/reservations/expire    ← NEW cron endpoint
  ├── GET /api/library/summary                 ← new reservation/copy-status counts
  └── GET /api/library/sse/library             ← NEW SSE stream endpoint for library events

Supporting libraries (unchanged interface)
  ├── src/lib/library/policyEngine.ts
  ├── src/lib/library/circulationEvents.ts
  ├── src/lib/sse.ts  (sseBus + emitSSE)
  └── src/lib/auth.ts / src/lib/permissions.ts
```

### Data Flow — Normal Return With Queue Advancement

```
Browser POST /api/library/circulate/return
  → loadBorrowWithRelations(borrowId, schoolId)
  → validate guards (copy != null, card != null)
  → PolicyEngine.load(schoolId)
  → computeFine(...)
  → prisma.$transaction([
       libraryBorrow.update  (returnedAt, fineAmount, returnType)
       libraryCopy.update    (status: AVAILABLE | UNDER_REPAIR | ARCHIVED)
       libraryCard.update    (currentBorrowCount--, fineBalance++)
       — if AVAILABLE and PENDING reservation exists:
           libraryReservation.update  (status: ACTIVE, allocatedCopyId)
           libraryCopy.update         (status: RESERVED)
     ])
  → recordFineAudit(...)
  → recordCirculationEvent(...)
  → emitSSE(schoolId, "libraryReservation.activated", payload)  ← NEW
  → emitSSE(schoolId, "libraryBorrow.returned", ...)
  → return { borrow, card, catalogueTitle, accessionNumber, studentName, ... }
```

### Data Flow — SSE Toast Delivery

```
Server emitSSE("libraryReservation.activated", payload)
  → sseBus.emit(schoolId, { type, payload })
  ← GET /api/library/sse/library  (long-lived SSE stream, per-tab)
      ← sseBus.on(schoolId, handler)
      → writes "data: {...}\n\n" to ReadableStream
Browser EventSource("/api/library/sse/library")
  → message handler filters type === "libraryReservation.activated"
  → useReservationToast invokes shadcn/ui toast({ ... })
```

---

## Module 1 — Shared Borrow Loading Helper

**File:** `src/lib/library/borrowHelper.ts`

### Exported API

```typescript
export type BorrowWithRelations = Prisma.LibraryBorrowGetPayload<{
  include: {
    card: { include: { student: true } };
    copy: { include: { catalogue: true } };
  };
}>;

export async function loadBorrowWithRelations(
  borrowId: string,
  schoolId: string
): Promise<BorrowWithRelations | null>;
```

### Implementation

```typescript
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type BorrowWithRelations = Prisma.LibraryBorrowGetPayload<{
  include: {
    card: { include: { student: true } };
    copy: { include: { catalogue: true } };
  };
}>;

export async function loadBorrowWithRelations(
  borrowId: string,
  schoolId: string
): Promise<BorrowWithRelations | null> {
  return prisma.libraryBorrow.findFirst({
    where: { id: borrowId, schoolId },
    include: {
      card: { include: { student: true } },
      copy: { include: { catalogue: true } },
    },
  });
}
```

The function returns `null` when no matching row exists. Callers must null-check before accessing nested relations.

---

## Module 2 — Return Route (Bug Fix + Damaged Flow + Auto-Assignment)

**File:** `src/app/api/library/circulate/return/route.ts`

### Root Causes Fixed

| Bug | Root cause | Fix |
|-----|-----------|-----|
| Runtime crash on `borrow.card.studentId` | `findFirst` without `include` | Replace with `loadBorrowWithRelations` |
| `costPerCopy` access on `borrow.copy.catalogue` | same | covered by full include |
| `catalogueId` for reservation query is `undefined` | same | covered by full include |
| Damaged return leaves copy `AVAILABLE` | Missing branch | Add `UNDER_REPAIR` branch |
| Reservation SSE event uses wrong type | `libraryBorrow.returned` with `{ reservationActivated }` | Emit dedicated `libraryReservation.activated` event |

### New Request/Response Contract

**Request body** (unchanged):
```typescript
{
  borrowId:        string;
  returnType:      "NORMAL" | "DAMAGED" | "LOST" | "REPLACEMENT_RECEIVED" | "OVERRIDE";
  returnCondition: "EXCELLENT" | "GOOD" | "FAIR" | "DAMAGED" | "LOST";  // optional
  notes:           string;  // optional
  overrideReason:  string;  // required when returnType = "OVERRIDE"
  patronType:      string;  // optional
}
```

**Response body** (extended):
```typescript
{
  borrow:           LibraryBorrow;
  card:             LibraryCard;
  overdueFine:      number;
  specialFine:      number;
  totalFine:        number;
  finePaused:       boolean;
  returnType:       string;
  newCopyStatus:    "AVAILABLE" | "UNDER_REPAIR" | "ARCHIVED";  // existing
  newCopyCondition: string;
  // NEW fields:
  catalogueTitle:   string;   // from borrow.copy.catalogue.title
  accessionNumber:  string;   // from borrow.copy.accessionNumber
  studentName:      string;   // from borrow.card.student.fullName
}
```

### Copy Status Decision Matrix

```
returnType               → newCopyStatus
───────────────────────────────────────
NORMAL                   → AVAILABLE
DAMAGED                  → UNDER_REPAIR  (NEW)
LOST                     → ARCHIVED
REPLACEMENT_RECEIVED     → AVAILABLE
OVERRIDE                 → AVAILABLE
```

### Guard Sequence

```typescript
const borrow = await loadBorrowWithRelations(borrowId, user.schoolId!);
if (!borrow) return 404 { error: "Borrow record not found." }
if (borrow.returnedAt) return 409 { error: "Book already returned." }
if (!borrow.copy) return 422 { error: "Copy data unavailable for this borrow." }
if (!borrow.card) return 422 { error: "Card data unavailable for this borrow." }
```

### Transaction Structure

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Update borrow row
  await tx.libraryBorrow.update({ where: { id: borrowId }, data: { ... } });

  // 2. Update copy status and condition
  await tx.libraryCopy.update({
    where: { id: borrow.copy.id },
    data: {
      status:    newCopyStatus,   // AVAILABLE | UNDER_REPAIR | ARCHIVED
      condition: newCopyCondition,
      ...(newCopyStatus === "ARCHIVED" && { archivedAt: now, archiveReason: "..." }),
    },
  });

  // 3. Update card: decrement borrow count, increment fine
  await tx.libraryCard.update({
    where: { id: borrow.card.id },
    data: { currentBorrowCount: { decrement: 1 }, fineBalance: { increment: totalFine } },
  });

  // 4. Auto-assign: only when AVAILABLE and not LOST
  if (newCopyStatus === "AVAILABLE") {
    const next = await tx.libraryReservation.findFirst({
      where: {
        catalogueId:     borrow.copy.catalogueId,
        schoolId:        user.schoolId!,
        status:          "PENDING",
        reservationType: "INDIVIDUAL",
      },
      orderBy: [
        { queuePosition: "asc" },  // nulls last (see Queue Ordering section)
        { createdAt: "asc" },
      ],
    });
    if (next) {
      await tx.libraryReservation.update({
        where: { id: next.id },
        data: { status: "ACTIVE", allocatedCopyId: borrow.copy.id },
      });
      await tx.libraryCopy.update({
        where: { id: borrow.copy.id },
        data: { status: "RESERVED" },
      });
      activatedReservation = next;  // captured for SSE emission below
    }
  }
});
```

**Post-transaction side effects** (outside the transaction — fire-and-forget safe):
```typescript
if (activatedReservation) {
  emitSSE(user.schoolId!, "libraryReservation.activated", {
    reservationId: activatedReservation.id,
    studentId:     activatedReservation.studentId,
    catalogueId:   borrow.copy.catalogueId,
    copyId:        borrow.copy.id,
    title:         borrow.copy.catalogue.title,
  });
}
emitSSE(user.schoolId!, "libraryBorrow.returned", updatedBorrow);
emitSSE(user.schoolId!, "libraryCard.updated",    updatedCard);
```

> Note: `emitSSE` emits on the in-process `sseBus` EventEmitter. It is fire-and-forget and never throws; keeping it outside the DB transaction is correct.

---

## Module 3 — Reservation Route: Queue Position for INDIVIDUAL

**File:** `src/app/api/library/reservations/route.ts` (POST handler)

### Current Bug

INDIVIDUAL reservations are created with `queuePosition: null` when no copy is immediately available. The WAITLIST branch correctly computes `max + 1`, but this logic is missing for INDIVIDUAL.

### Fix

Extend the POST handler to compute `queuePosition` for INDIVIDUAL the same way WAITLIST does:

```typescript
// Before creating the reservation row:
let queuePosition: number | null = null;

if (d.reservationType === "INDIVIDUAL" || d.reservationType === "WAITLIST") {
  const maxPos = await prisma.libraryReservation.aggregate({
    where: {
      catalogueId:     d.catalogueId,
      schoolId:        user.schoolId!,
      status:          { in: ["PENDING", "ACTIVE"] },
      reservationType: d.reservationType as never,
    },
    _max: { queuePosition: true },
  });
  queuePosition = (maxPos._max.queuePosition ?? 0) + 1;
}

// If an available copy was found and we set initialStatus = "ACTIVE",
// keep queuePosition = 1 (it was the first — no one is ahead of it).
```

When a copy is available and immediately allocated, the reservation is created with `status: "ACTIVE"` and `queuePosition: 1`.

### Queue Position Algorithm (complete)

```
function nextQueuePosition(catalogueId, schoolId, reservationType):
  maxPos = SELECT MAX(queuePosition)
           FROM LibraryReservation
           WHERE catalogueId = catalogueId
             AND schoolId = schoolId
             AND status IN ('PENDING', 'ACTIVE')
             AND reservationType = reservationType
  RETURN (maxPos ?? 0) + 1
```

Gaps are intentional and acceptable. Sequence is monotonically increasing but not dense.

---

## Module 4 — Reservation Auto-Assignment Algorithm

This algorithm is invoked in two contexts:

1. **ReturnRoute** — after a non-LOST, non-DAMAGED return produces a newly-AVAILABLE copy.
2. **Cancellation flow** — after a PATCH `status: "CANCELLED"` or DELETE releases an allocated copy.
3. **Expiry Cron** — after an expired ACTIVE reservation releases its allocated copy.

### Algorithm Specification

```
function tryAutoAssign(catalogueId, copyId, schoolId, tx):
  next = tx.libraryReservation.findFirst(
    WHERE catalogueId = catalogueId
      AND schoolId    = schoolId
      AND status      = "PENDING"
      AND reservationType = "INDIVIDUAL"
    ORDER BY
      CASE WHEN queuePosition IS NULL THEN 1 ELSE 0 END ASC,  -- nulls last
      queuePosition ASC,
      createdAt     ASC
    LIMIT 1
  )

  IF next IS NULL:
    RETURN { activated: false }

  tx.libraryReservation.update(next.id,
    { status: "ACTIVE", allocatedCopyId: copyId }
  )
  tx.libraryCopy.update(copyId,
    { status: "RESERVED" }
  )
  RETURN { activated: true, reservation: next }
```

> **Null queuePosition handling:** Prisma's default `orderBy: [{ queuePosition: "asc" }]` places `null` values first in PostgreSQL (nulls-first is the default for ASC). To put `null` last we must use a raw expression or a Prisma `nulls: "last"` modifier (available in Prisma 4.1+). The implementation shall use:
> ```typescript
> orderBy: [
>   { queuePosition: { sort: "asc", nulls: "last" } },
>   { createdAt: "asc" },
> ]
> ```

### SSE Emission After Auto-Assignment

Every invocation that returns `activated: true` emits:

```typescript
emitSSE(schoolId, "libraryReservation.activated", {
  reservationId: reservation.id,
  studentId:     reservation.studentId,
  catalogueId,
  copyId,
  title,         // from borrow.copy.catalogue.title or catalogue.title
});
```

`"libraryReservation.activated"` must be added to the `SSEEventType` union in `src/lib/sse.ts`.

---

## Module 5 — Reservation [id] Route: Cancellation Queue Reassignment

**File:** `src/app/api/library/reservations/[id]/route.ts`

### Current Bug

Both `PATCH` (with `status: "CANCELLED"`) and `DELETE` immediately set the allocated copy to `AVAILABLE` without checking for the next waiting patron.

### Fix — PATCH Handler

Replace the current direct copy release:

```typescript
// OLD (buggy):
if (d.status === "CANCELLED" && r.allocatedCopyId) {
  await prisma.libraryCopy.update({ where: { id: r.allocatedCopyId }, data: { status: "AVAILABLE" } });
}

// NEW:
if (d.status === "CANCELLED" && r.allocatedCopyId) {
  // Load catalogue.title for SSE payload
  const catalogue = await prisma.libraryCatalogue.findUnique({
    where: { id: r.catalogueId }, select: { title: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.libraryReservation.update({
      where: { id: params.id },
      data: { status: "CANCELLED" },
    });

    const { activated, reservation } = await tryAutoAssign(
      r.catalogueId, r.allocatedCopyId, user.schoolId!, tx
    );

    if (!activated) {
      await tx.libraryCopy.update({
        where: { id: r.allocatedCopyId },
        data: { status: "AVAILABLE" },
      });
    }

    if (activated && reservation) {
      activatedReservation = { ...reservation, catalogueTitle: catalogue?.title ?? "" };
    }
  });
}
```

After the transaction:
```typescript
if (activatedReservation) {
  emitSSE(user.schoolId!, "libraryReservation.activated", {
    reservationId: activatedReservation.id,
    studentId:     activatedReservation.studentId,
    catalogueId:   r.catalogueId,
    copyId:        r.allocatedCopyId,
    title:         activatedReservation.catalogueTitle,
  });
}
```

### Fix — DELETE Handler

Same logic as PATCH but with `r.allocatedCopyId` taken from the pre-loaded reservation:

```typescript
if (r.allocatedCopyId) {
  const catalogue = await prisma.libraryCatalogue.findUnique({
    where: { id: r.catalogueId }, select: { title: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.libraryReservation.update({
      where: { id: params.id }, data: { status: "CANCELLED" },
    });
    const { activated, reservation } = await tryAutoAssign(
      r.catalogueId, r.allocatedCopyId, user.schoolId!, tx
    );
    if (!activated) {
      await tx.libraryCopy.update({
        where: { id: r.allocatedCopyId }, data: { status: "AVAILABLE" },
      });
    }
    if (activated && reservation) {
      activatedReservation = { ...reservation, catalogueTitle: catalogue?.title ?? "" };
    }
  });

  if (activatedReservation) {
    emitSSE(user.schoolId!, "libraryReservation.activated", { ... });
  }
} else {
  // No copy to release — just cancel
  await prisma.libraryReservation.update({
    where: { id: params.id }, data: { status: "CANCELLED" },
  });
}
```

---

## Module 6 — Expiry Cron Endpoint

**File:** `src/app/api/library/reservations/expire/route.ts` (NEW)

### Authentication

Same guard as other write routes:

```typescript
async function manageGuard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"));
}
```

### Algorithm

```
POST /api/library/reservations/expire

1. Load all expired reservations for schoolId:
   SELECT * FROM LibraryReservation
   WHERE schoolId = schoolId
     AND status IN ('PENDING', 'ACTIVE')
     AND expiresAt IS NOT NULL
     AND expiresAt < NOW()

2. IF none found: return { expired: 0, reactivated: 0 }

3. Separate into:
   - withCopy   = rows WHERE allocatedCopyId IS NOT NULL  (ACTIVE reservations)
   - withoutCopy = rows WHERE allocatedCopyId IS NULL     (PENDING reservations)

4. Bulk-update all expired reservations to status=EXPIRED:
   UPDATE LibraryReservation
   SET status = 'EXPIRED'
   WHERE id IN (expired_ids)

5. For each unique (catalogueId, copyId) pair in withCopy:
   - Run tryAutoAssign(catalogueId, copyId, schoolId, tx)
   - If no next patron: set libraryCopy.status = 'AVAILABLE'
   - If next patron activated: increment reactivated counter

6. Return { expired: expired_ids.length, reactivated: reactivated_count }
```

### Implementation Details

The bulk update and copy-status changes must be atomic per copy. Use a transaction per unique released copy rather than a single mega-transaction to avoid long-held locks:

```typescript
let reactivated = 0;

// Bulk-expire all reservations first (fast, single write)
await prisma.libraryReservation.updateMany({
  where: { id: { in: expiredIds } },
  data: { status: "EXPIRED" },
});

// Then process each released copy
for (const { catalogueId, copyId } of releasedCopies) {
  await prisma.$transaction(async (tx) => {
    const result = await tryAutoAssign(catalogueId, copyId, user.schoolId!, tx);
    if (!result.activated) {
      await tx.libraryCopy.update({
        where: { id: copyId }, data: { status: "AVAILABLE" },
      });
    } else {
      reactivated++;
      // SSE emitted outside transaction
    }
  });
  if (/* activated */) {
    emitSSE(user.schoolId!, "libraryReservation.activated", { ... });
  }
}

return NextResponse.json({ expired: expiredIds.length, reactivated });
```

### Cron Invocation

External schedulers (cron job, Vercel cron, or a simple systemd timer) call:

```
POST /api/library/reservations/expire
Cookie: bidii_session=<librarian_session>
```

Alternatively, a super-admin or the application shell can call it via an authenticated fetch.

---

## Module 7 — Summary API: New Counts

**File:** `src/app/api/library/summary/route.ts`

### New Queries (added to existing `Promise.all`)

```typescript
// ADD to the Promise.all array:
prisma.libraryReservation.count({
  where: { schoolId, status: "PENDING" },
}),
prisma.libraryReservation.count({
  where: { schoolId, status: "ACTIVE" },
}),
prisma.libraryCopy.count({
  where: { schoolId, status: "RESERVED" },
}),
prisma.libraryCopy.count({
  where: { schoolId, status: "UNDER_REPAIR" },
}),
```

### New Response Fields

```typescript
const body = {
  // ... existing fields unchanged ...
  reservationsPending: reservationsPending,  // NEW
  readyForPickup:      reservationsActive,   // NEW
  reservedCopies:      reservedCopies,       // NEW
  copiesUnderRepair:   copiesUnderRepair,    // NEW
};
```

ETag computation incorporates all fields (including new ones) because `JSON.stringify(body)` already captures the entire body object. No change to ETag or `Cache-Control` logic is required.

---

## Module 8 — SSE Stream Endpoint for Library Events

**File:** `src/app/api/library/sse/library/route.ts` (NEW)

The `sseBus` is an in-process Node.js `EventEmitter`. To deliver events to the browser, a streaming HTTP route must subscribe to the bus and write to a `ReadableStream`.

### Implementation

```typescript
import { NextRequest } from "next/server";
import { sseBus } from "@/lib/sse";
import { requireSchoolPermission } from "@/lib/permissions";
import { requireSchoolRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";  // Required: Edge runtime does not support EventEmitter

export async function GET(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"));
  if (!user) return new Response("Unauthorized", { status: 401 });

  const schoolId = user.schoolId!;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const handler = (event: { type: string; payload: unknown; ts: number }) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream already closed — ignore
        }
      };

      sseBus.on(schoolId, handler);

      // Send a keep-alive comment every 30 seconds to prevent proxy timeouts
      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keep-alive\n\n")); }
        catch { clearInterval(keepAlive); }
      }, 30_000);

      // Cleanup when client disconnects
      req.signal.addEventListener("abort", () => {
        sseBus.off(schoolId, handler);
        clearInterval(keepAlive);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",  // Disable nginx buffering
    },
  });
}
```

> **Runtime note:** `sseBus` is a Node.js `EventEmitter`. This route must use `export const runtime = "nodejs"`. It must not be deployed to the Edge runtime.

---

## Module 9 — SSE Toast Listener: useReservationToast Hook

**File:** `src/hooks/useReservationToast.ts` (NEW)

### Hook Specification

```typescript
"use client";

import { useEffect } from "react";
import { toast } from "@/components/ui/use-toast";  // shadcn/ui toast

interface ReservationActivatedPayload {
  reservationId: string;
  studentId:     string;
  catalogueId:   string;
  copyId:        string;
  title:         string;
  studentName?:  string;  // enriched server-side or fetched client-side
}

export function useReservationToast() {
  useEffect(() => {
    const es = new EventSource("/api/library/sse/library");

    es.onmessage = (evt) => {
      try {
        const event = JSON.parse(evt.data) as { type: string; payload: unknown };
        if (event.type !== "libraryReservation.activated") return;

        const p = event.payload as ReservationActivatedPayload;

        toast({
          title:       "Book Ready for Pickup",
          description: `"${p.title}" is now reserved for ${p.studentName ?? "a waiting patron"}.`,
          duration:    8_000,  // 8 seconds minimum (req 5.4)
          action: {            // link to reservations page (req 5.2)
            altText: "View reservations",
            onClick: () => { window.location.href = "/staff/library/reservations"; },
          },
        });
      } catch { /* non-fatal parse error */ }
    };

    es.onerror = () => {
      // Browser will auto-reconnect for EventSource — no explicit retry needed
    };

    return () => { es.close(); };
  }, []);
}
```

### Enrichment of studentName

The `libraryReservation.activated` SSE payload includes `studentId`. The server should include `studentName` directly in the payload by querying `reservation.student.fullName` (or via `borrow.copy.catalogue` + a student lookup) when building the SSE payload. This avoids a client-side follow-up fetch.

In `tryAutoAssign`, when the reservation row is loaded, include the student:

```typescript
const next = await tx.libraryReservation.findFirst({
  where: { ... },
  include: { student: { select: { fullName: true } } },
  orderBy: [...],
});

// then emit:
emitSSE(schoolId, "libraryReservation.activated", {
  reservationId: next.id,
  studentId:     next.studentId,
  catalogueId,
  copyId,
  title,
  studentName:   next.student?.fullName ?? null,
});
```

### Integration into CirculationDesk and Scan pages

Both pages are `"use client"` components. Adding the hook requires a single line in each:

```typescript
// At the top of CirculatePage() and ScanPage():
useReservationToast();
```

The hook sets up an `EventSource` connection on mount and tears it down on unmount. Since it uses `"use client"`, it is never executed server-side.

---

## Module 10 — Return Response Fields

**File:** `src/app/api/library/circulate/return/route.ts`

After the transaction, the response body is extended:

```typescript
return NextResponse.json({
  borrow:        updatedBorrow,
  card:          updatedCard,
  overdueFine,
  specialFine,
  totalFine,
  finePaused,
  returnType,
  newCopyStatus,
  newCopyCondition,
  // NEW:
  catalogueTitle:  borrow.copy.catalogue.title,
  accessionNumber: borrow.copy.accessionNumber,
  studentName:     borrow.card.student.fullName,
});
```

The CirculationDesk page's `handleAction("return")` already processes the JSON response and sets a confirm message. The existing confirmation message `"Returned. Fine charged: KES X"` can be enriched with `json.catalogueTitle` and `json.studentName`:

```typescript
return: `"${json.catalogueTitle}" returned by ${json.studentName}. Fine: KES ${(json.totalFine ?? 0).toFixed(2)}.`,
```

No additional API call is needed — the data is already in the return response.

---

## SSEEventType Extension

`src/lib/sse.ts` must have the new event type added to the union:

```typescript
export type SSEEventType =
  | ... // existing types
  | "libraryReservation.activated";  // NEW
```

---

## Error Handling Summary

| Scenario | HTTP Status | Response body |
|----------|-------------|---------------|
| `borrowId` not found | 404 | `{ error: "Borrow record not found." }` |
| Book already returned | 409 | `{ error: "Book already returned." }` |
| `borrow.copy` is null | 422 | `{ error: "Copy data unavailable for this borrow." }` |
| `borrow.card` is null | 422 | `{ error: "Card data unavailable for this borrow." }` |
| OVERRIDE with empty reason | 400 | `{ error: "Override reason is required." }` |
| Reservation not found | 404 | `{ error: "Reservation not found." }` |
| Catalogue not found | 404 | `{ error: "Catalogue entry not found." }` |
| Unauthorized (all routes) | 401 | `{ error: "Unauthorized" }` |
| Expiry cron (no expired) | 200 | `{ expired: 0, reactivated: 0 }` |

---

## Queue Ordering Invariants

All reservation queries that need queue order must use:

```typescript
orderBy: [
  { queuePosition: { sort: "asc", nulls: "last" } },
  { createdAt: "asc" },
]
```

This ensures:
1. Reservations with an assigned `queuePosition` appear in ascending order.
2. Reservations with `queuePosition: null` are treated as lowest priority (last).
3. Ties at the same `queuePosition` are broken by creation time.

The Prisma `nulls: "last"` modifier is supported from Prisma 4.1 onward. If the project is on an older Prisma version, a raw SQL `ORDER BY COALESCE("queuePosition", 999999) ASC, "createdAt" ASC` can be substituted.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Damaged Return Sets Copy Status to UNDER_REPAIR (No Queue Activation)

*For any* valid `LibraryBorrow` where `returnType` is `"DAMAGED"`, processing that return SHALL set the copy's `status` to `UNDER_REPAIR` and SHALL NOT activate any pending reservation for that copy's catalogue.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

---

### Property 2: LOST Return Does Not Trigger Queue Assignment

*For any* valid `LibraryBorrow` where `returnType` is `"LOST"`, processing that return SHALL NOT activate any `LibraryReservation` record, regardless of how many `PENDING` reservations exist for that catalogue.

**Validates: Requirements 4.6**

---

### Property 3: Auto-Assignment Selects Correct Next Patron

*For any* `LibraryCatalogue` with one or more `PENDING INDIVIDUAL` reservations carrying distinct `queuePosition` values, when the ReturnRoute or Expiry Cron activates the next reservation, the reservation with the smallest non-null `queuePosition` (or earliest `createdAt` among null-position entries, placed last) SHALL be the one activated.

**Validates: Requirements 4.1, 4.2, 6.4, 6.6, 7.5, 8.1, 8.2**

---

### Property 4: Auto-Assignment Is Atomic — Copy Status Matches Reservation Status

*For any* auto-assignment execution, after the transaction commits: if a `LibraryReservation` has `status = "ACTIVE"` and `allocatedCopyId = X`, then `LibraryCopy X` SHALL have `status = "RESERVED"`. Conversely, if no reservation was activated and the copy was released, `LibraryCopy X` SHALL have `status = "AVAILABLE"`.

**Validates: Requirements 4.3, 4.5, 7.4, 8.2, 8.4**

---

### Property 5: Queue Position Is Monotonically Non-Decreasing

*For any* sequence of `INDIVIDUAL` reservation creations for the same `catalogueId` and `schoolId`, each new reservation's `queuePosition` SHALL be strictly greater than every existing `PENDING` or `ACTIVE` reservation's `queuePosition` at the time of creation.

**Validates: Requirements 6.1, 6.3**

---

### Property 6: Cancellation Does Not Change Non-Involved Reservation Queue Positions

*For any* reservation cancellation (via PATCH or DELETE), all other reservations for the same `catalogueId` whose status was not modified by the auto-assignment algorithm SHALL have identical `queuePosition` values before and after the cancellation.

**Validates: Requirements 6.5, 8.5**

---

### Property 7: Expiry Batch Selects Only Expired Records

*For any* invocation of `POST /api/library/reservations/expire`, only `LibraryReservation` rows where `status IN ("PENDING","ACTIVE")` AND `expiresAt IS NOT NULL` AND `expiresAt < NOW()` for the caller's `schoolId` SHALL have their status changed to `"EXPIRED"`. No reservation with `expiresAt >= NOW()` or with a terminal status shall be modified.

**Validates: Requirements 7.2, 7.3**

---

### Property 8: Toast Render Completeness

*For any* `libraryReservation.activated` SSE event payload `{ title, studentName }` received by the browser, the rendered toast SHALL contain both `title` and `studentName` as visible text, and SHALL include an anchor element whose `href` is `/staff/library/reservations`.

**Validates: Requirements 5.1, 5.2**

---

### Property 9: No-Copy Cancellation Does Not Alter Any Copy

*For any* `LibraryReservation` with `status = "PENDING"` and `allocatedCopyId = null`, cancelling that reservation (PATCH or DELETE) SHALL NOT update the `status` field of any `LibraryCopy` row.

**Validates: Requirements 8.6**

---

## Testing Strategy

### Unit / Property Tests (co-located `__tests__` files or `*.test.ts` in `src/lib/library/`)

| Test | Type | What it covers |
|------|------|---------------|
| `loadBorrowWithRelations` returns null for unknown id | Edge case | Req 1.3 |
| `loadBorrowWithRelations` returns full shape with relations | Example | Req 1.2 |
| `tryAutoAssign` picks reservation with lowest non-null queuePosition | **Property** | Property 3 |
| `tryAutoAssign` places null-position reservations last | Edge case | Property 3 |
| `tryAutoAssign` returns activated=false when queue is empty | **Property** | Property 4 |
| Return route: DAMAGED → copy status UNDER_REPAIR, no queue activation | **Property** | Property 1 |
| Return route: LOST → no queue activation even with waiting patrons | **Property** | Property 2 |
| Queue position increment on INDIVIDUAL create | **Property** | Property 5 |
| Cancel ACTIVE reservation → next PENDING becomes ACTIVE | **Property** | Property 3, 4 |
| Cancel PENDING (no copy) → no copy change | **Property** | Property 9 |
| Expiry selects only expiresAt < NOW rows | **Property** | Property 7 |
| Expiry leaves future-dated reservations untouched | **Property** | Property 7 |
| Toast renders title and studentName from payload | **Property** | Property 8 |

### Integration Tests (against a test database)

- `POST /api/library/circulate/return` full lifecycle with NORMAL, DAMAGED, LOST types
- `POST /api/library/reservations/expire` with mixed expired and non-expired rows
- `GET /api/library/summary` returns all new fields
- `PATCH /api/library/reservations/[id]` cancellation with and without allocated copy

### Smoke Tests

- `GET /api/library/sse/library` returns `Content-Type: text/event-stream`
- `POST /api/library/reservations/expire` returns 401 without valid session

---

## File Change Summary

| File | Action | Key changes |
|------|--------|-------------|
| `src/lib/library/borrowHelper.ts` | **CREATE** | `loadBorrowWithRelations` + `BorrowWithRelations` type |
| `src/lib/sse.ts` | **MODIFY** | Add `"libraryReservation.activated"` to `SSEEventType` |
| `src/app/api/library/circulate/return/route.ts` | **MODIFY** | Use helper, add UNDER_REPAIR branch, proper auto-assign within tx, extend response fields |
| `src/app/api/library/reservations/route.ts` | **MODIFY** | Compute queuePosition for INDIVIDUAL type |
| `src/app/api/library/reservations/[id]/route.ts` | **MODIFY** | PATCH and DELETE both call tryAutoAssign before releasing copy |
| `src/app/api/library/reservations/expire/route.ts` | **CREATE** | Expiry cron endpoint |
| `src/app/api/library/summary/route.ts` | **MODIFY** | Add 4 new concurrent count queries |
| `src/app/api/library/sse/library/route.ts` | **CREATE** | SSE stream endpoint subscribed to sseBus |
| `src/hooks/useReservationToast.ts` | **CREATE** | Client hook: EventSource + shadcn toast |
| `src/app/staff/library/circulate/page.tsx` | **MODIFY** | Add `useReservationToast()` call |
| `src/app/staff/library/scan/page.tsx` | **MODIFY** | Add `useReservationToast()` call |
