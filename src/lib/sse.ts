/**
 * src/lib/sse.ts
 *
 * Server-side SSE event bus — singleton EventEmitter shared across all
 * Next.js route handlers. Import emitSSE() from here to push live events
 * to connected clients after a successful database write.
 *
 * Server-only. Never import this from client-side code.
 */

import { EventEmitter } from "events";

// Persist across Next.js dev hot-reloads.
const g = globalThis as typeof globalThis & {
  __bidiiSSEBus__?: EventEmitter;
};

if (!g.__bidiiSSEBus__) {
  g.__bidiiSSEBus__ = new EventEmitter();
  // 500 concurrent users × up to 4 browser tabs each = 2 000 listeners max.
  // The default Node.js cap of 10 would spam the console with warnings;
  // 500 was the old limit and caused silent drops above that threshold.
  g.__bidiiSSEBus__.setMaxListeners(2_000);
}

export const sseBus = g.__bidiiSSEBus__!;

export type SSEEventType =
  | "student.created"
  | "student.updated"
  | "student.deleted"
  | "student.archived"
  | "teacher.archived"
  | "attendance.upserted"
  | "assessmentItem.upserted"
  | "libraryBorrow.issued"
  | "libraryBorrow.returned"
  | "libraryCard.updated"
  | "libraryCards.provisioned"
  | "libraryCatalogue.created"
  | "libraryCatalogue.updated"
  | "libraryCatalogue.archived"
  | "libraryCatalogue.bulkImported"
  | "libraryCopy.created"
  | "libraryCopy.updated"
  | "libraryCopy.archived"
  | "calendarEvent.created"
  | "calendarEvent.updated"
  | "calendarEvent.deleted"
  | "disciplineRecord.created"
  | "disciplineRecord.updated"
  | "timetableSlot.updated"
  | "class.updated"
  | "teacher.updated"
  | "subject.updated"
  // ── Bulk import events — emitted after super-admin CSV imports ─────────────
  | "import.students.completed"
  | "import.staff.completed"
  | "import.departments.completed"
  | "import.classes.completed"
  | "import.subjects.completed"
  | "import.dormitories.completed"
  | "import.beds.completed"
  | "import.allocations.completed"
  | "import.parents.completed";

/**
 * Push a typed event to all SSE clients connected to the given school.
 * Call this from any API route handler after a successful DB write.
 *
 * Example:
 *   import { emitSSE } from "@/lib/sse";
 *   emitSSE(user.schoolId!, "attendance.upserted", attendance);
 */
export function emitSSE(
  schoolId: string,
  type: SSEEventType,
  payload: unknown
): void {
  sseBus.emit(schoolId, { type, payload, ts: Date.now() });
}
