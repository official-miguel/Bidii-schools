/**
 * src/lib/offline/studentsCache.ts
 *
 * Read/write helpers for the offline student cache. Every function is
 * best-effort: failures are swallowed so callers can use this purely as a
 * fallback/side-channel without changing their normal online behavior.
 */
"use client";

import { getOfflineDB } from "@/lib/offline/db";

type RawStudent = {
  id?: string;
  schoolId?: string;
  admissionNumber?: string;
  fullName?: string;
  classId?: string | null;
};

/** Store the full student roster locally so it can be searched offline. */
export async function cacheStudents(students: unknown[]): Promise<void> {
  try {
    const db = getOfflineDB();
    if (!db) return;
    const now = Date.now();
    const rows = students
      .map((s) => s as RawStudent)
      .filter((s) => typeof s.id === "string")
      .map((s) => ({
        id: s.id as string,
        schoolId: s.schoolId ?? "",
        admissionNumber: s.admissionNumber ?? "",
        fullName: s.fullName ?? "",
        classId: s.classId ?? null,
        data: s,
        updatedAt: now,
      }));
    if (rows.length) await db.students.bulkPut(rows);
  } catch {
    // Offline caching is best-effort; never let it break the caller.
  }
}

/** Read whatever roster is cached on this device (used when a fetch fails). */
export async function getCachedStudents(): Promise<unknown[]> {
  try {
    const db = getOfflineDB();
    if (!db) return [];
    const rows = await db.students.toArray();
    return rows.map((r) => r.data);
  } catch {
    return [];
  }
}

export async function cacheStudentProfile(studentId: string, data: unknown): Promise<void> {
  try {
    const db = getOfflineDB();
    if (!db) return;
    await db.studentProfiles.put({ studentId, data, updatedAt: Date.now() });
  } catch {
    // best-effort
  }
}

export async function getCachedStudentProfile(studentId: string): Promise<unknown | null> {
  try {
    const db = getOfflineDB();
    if (!db) return null;
    const row = await db.studentProfiles.get(studentId);
    return row?.data ?? null;
  } catch {
    return null;
  }
}
