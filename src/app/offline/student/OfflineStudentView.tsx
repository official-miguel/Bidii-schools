"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, WifiOff } from "lucide-react";
import StudentProfile from "@/components/students/StudentProfile";

type Portal = "teacher" | "staff" | "principal";

function asPortal(value: string | null): Portal {
  return value === "teacher" || value === "staff" ? value : "principal";
}

export default function OfflineStudentView() {
  const params = useSearchParams();
  const studentId = params.get("id");
  const portal = asPortal(params.get("portal"));

  // Back online: open the live profile page instead of the offline copy.
  useEffect(() => {
    if (!studentId) return;
    const goLive = () => window.location.replace(`/${portal}/students/${encodeURIComponent(studentId)}`);
    window.addEventListener("online", goLive);
    return () => window.removeEventListener("online", goLive);
  }, [studentId, portal]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? window.history.back() : window.location.assign(`/${portal}/students`))}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate hover:bg-teal-50"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Student profile</p>
          <p className="flex items-center gap-1 text-xs text-slate">
            <WifiOff className="h-3 w-3" aria-hidden="true" />
            Offline — showing the copy saved on this device
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {studentId ? (
          <StudentProfile studentId={studentId} role={portal} />
        ) : (
          <p className="text-sm text-danger">No student selected.</p>
        )}
      </main>
    </div>
  );
}
