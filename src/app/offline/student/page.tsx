import type { Metadata } from "next";
import { Suspense } from "react";
import OfflineStudentView from "./OfflineStudentView";

export const metadata: Metadata = {
  title: "Student profile (offline)",
  robots: { index: false },
};

/**
 * /offline/student?id=<studentId>&portal=<teacher|staff|principal>
 *
 * A static shell the service worker precaches and redirects to when a student
 * profile page is opened offline and that exact page was never cached. The
 * profile itself comes from the on-device copy that useOfflineStudentSync
 * keeps for every student, so any synced student opens with no internet.
 */
export default function OfflineStudentPage() {
  return (
    <Suspense fallback={null}>
      <OfflineStudentView />
    </Suspense>
  );
}
