"use client";

import { useState } from "react";
import AttendanceView from "@/components/AttendanceView";
import AttendanceViewTab from "@/components/AttendanceViewTab";

export default function AttendancePageTabs({
  isClassTeacher,
  classTeacherOf,
  taughtClasses,
}: {
  isClassTeacher: boolean;
  classTeacherOf: { id: string; name: string } | null;
  taughtClasses: { id: string; name: string }[];
}) {
  // Default to "submit" for class teachers, "view" for subject-only teachers
  const [tab, setTab] = useState<"submit" | "view">(isClassTeacher ? "submit" : "view");

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {isClassTeacher && (
          <button
            type="button"
            onClick={() => setTab("submit")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
              ${
                tab === "submit"
                  ? "border-teal text-teal"
                  : "border-transparent text-slate hover:text-foreground"
              }`}
          >
            Submit
          </button>
        )}
        <button
          type="button"
          onClick={() => setTab("view")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
            ${
              tab === "view"
                ? "border-teal text-teal"
                : "border-transparent text-slate hover:text-foreground"
            }`}
        >
          View
        </button>
      </div>

      {/* Tab content */}
      {tab === "submit" && isClassTeacher && classTeacherOf && (
        <div>
          <p className="text-sm text-slate mb-4">
            Taking attendance for{" "}
            <span className="font-semibold text-foreground">
              {classTeacherOf.name}
            </span>
            .
          </p>
          <AttendanceView
            classes={[{ id: classTeacherOf.id, name: classTeacherOf.name }]}
            lockClass
          />
        </div>
      )}

      {tab === "view" && (
        <AttendanceViewTab
          taughtClasses={taughtClasses}
          classTeacherOfId={classTeacherOf?.id}
        />
      )}
    </div>
  );
}
