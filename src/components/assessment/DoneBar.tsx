"use client";

import { useRouter } from "next/navigation";

interface DoneBarProps {
  /** The role prefix used in the route, e.g. "teacher" or "principal". */
  role: "teacher" | "principal";
  classId: string;
  periodId: string;
}

/**
 * Fixed bottom bar with "Done — View Class Summary" button.
 * Navigates to the assessment dashboard filtered to the current class/period.
 */
export default function DoneBar({ role, classId, periodId }: DoneBarProps) {
  const router = useRouter();

  function handleDone() {
    const params = new URLSearchParams({ classId, periodId });
    router.push(`/${role}/assessments/dashboard?${params.toString()}`);
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.06)] px-6 py-3 flex items-center justify-end gap-3">
      <span className="text-sm text-slate hidden sm:block">
        Finished entering marks?
      </span>
      <button
        onClick={handleDone}
        className="rounded-md bg-royal text-white text-sm font-medium px-5 py-2 hover:bg-royal/90 transition-colors shadow-sm"
      >
        Done — View Class Summary
      </button>
    </div>
  );
}

/**
 * DoneBarWrapper reads classId and periodId from the URL searchParams
 * and renders DoneBar — use this inside server pages that pass searchParams.
 */
export function DoneBarWrapper({
  role,
  classId,
  periodId,
}: DoneBarProps) {
  if (!classId || !periodId) return null;
  return <DoneBar role={role} classId={classId} periodId={periodId} />;
}
