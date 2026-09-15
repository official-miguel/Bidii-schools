"use client";

/**
 * /principal/history — Archives.
 *
 * The screen itself lives in ArchivesModule so the staff and teacher portals
 * can serve the same thing to anyone granted the Archives permission.
 */

import ArchivesModule from "@/components/history/ArchivesModule";

export default function PrincipalArchivesPage() {
  return (
    <ArchivesModule
      contextLinks={[
        { href: "/principal/students", label: "Students" },
        { href: "/principal/staff",    label: "Staff" },
        { href: "/principal/history",  label: "Archives", exact: true },
      ]}
    />
  );
}
