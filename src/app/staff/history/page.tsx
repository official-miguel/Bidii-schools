"use client";

/**
 * /staff/history — Archives for admin staff holding the Archives permission.
 */

import ArchivesModule from "@/components/history/ArchivesModule";

export default function StaffArchivesPage() {
  return (
    <ArchivesModule
      contextLinks={[
        { href: "/staff/students",  label: "Students" },
        { href: "/staff/directory", label: "Staff" },
        { href: "/staff/history",   label: "Archives", exact: true },
      ]}
    />
  );
}
