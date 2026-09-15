"use client";

/**
 * /teacher/history — Archives for teachers holding the Archives permission.
 *
 * No staff-directory link here: teachers have no staff list page.
 */

import ArchivesModule from "@/components/history/ArchivesModule";

export default function TeacherArchivesPage() {
  return (
    <ArchivesModule
      contextLinks={[
        { href: "/teacher/students", label: "Students" },
        { href: "/teacher/history",  label: "Archives", exact: true },
      ]}
    />
  );
}
