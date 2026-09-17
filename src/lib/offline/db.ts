/**
 * src/lib/offline/db.ts
 *
 * Local on-device cache (IndexedDB via Dexie) so records that have already
 * been synced can be searched and viewed with no internet connection.
 *
 * This is purely additive: nothing here is imported by the server, and
 * every read/write is wrapped by callers in try/catch so a Dexie failure
 * (private browsing, disabled storage, etc.) never breaks the online path.
 */
"use client";

import Dexie, { type Table } from "dexie";

export type CachedStudent = {
  id: string;
  schoolId: string;
  admissionNumber: string;
  fullName: string;
  classId: string | null;
  /** Full JSON payload as last seen from the API — search/list rows. */
  data: unknown;
  updatedAt: number;
};

export type CachedStudentProfile = {
  studentId: string;
  /** Full JSON payload from /api/students/[id]/profile */
  data: unknown;
  updatedAt: number;
};

class OfflineDB extends Dexie {
  students!: Table<CachedStudent, string>;
  studentProfiles!: Table<CachedStudentProfile, string>;

  constructor() {
    super("bidii-offline");
    this.version(1).stores({
      students: "id, schoolId, admissionNumber, fullName, classId",
      studentProfiles: "studentId",
    });
  }
}

let dbInstance: OfflineDB | null = null;

/** Lazily create the Dexie DB — only in the browser, never during SSR. */
export function getOfflineDB(): OfflineDB | null {
  if (typeof window === "undefined") return null;
  if (!dbInstance) dbInstance = new OfflineDB();
  return dbInstance;
}
