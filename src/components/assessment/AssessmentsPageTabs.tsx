"use client";

import { useState } from "react";
import TeacherHome from "@/components/assessment/TeacherHome";
import HodHome from "@/components/assessment/HodHome";

interface Props {
  isHod: boolean;
  hasSubjectAssignments: boolean;
  departmentId?: string;
  departmentName?: string;
}

type TabId = "my_subjects" | "my_department";

export default function AssessmentsPageTabs({
  isHod,
  hasSubjectAssignments,
  departmentId,
  departmentName,
}: Props) {
  const defaultTab: TabId = hasSubjectAssignments ? "my_subjects" : "my_department";
  const [tab, setTab] = useState<TabId>(defaultTab);

  const showMySubjects = hasSubjectAssignments;
  const showMyDept = isHod;

  // Edge case: no assignments and not HOD — show plain TeacherHome
  if (!showMySubjects && !showMyDept) {
    return (
      <div className="space-y-5">
        <PageHeading />
        <TeacherHome />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeading />

      {/* Tab bar — only shown when both tabs are available */}
      {showMySubjects && showMyDept && (
        <div className="flex gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("my_subjects")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "my_subjects"
                ? "border-teal text-teal"
                : "border-transparent text-slate hover:text-foreground"
            }`}
          >
            My Subjects
          </button>
          <button
            type="button"
            onClick={() => setTab("my_department")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "my_department"
                ? "border-teal text-teal"
                : "border-transparent text-slate hover:text-foreground"
            }`}
          >
            My Department
            {departmentName && (
              <span className="ml-1.5 text-xs font-normal text-slate">({departmentName})</span>
            )}
          </button>
        </div>
      )}

      {/* My Subjects content */}
      {showMySubjects && (!showMyDept || tab === "my_subjects") && (
        <TeacherHome />
      )}

      {/* My Department content */}
      {showMyDept && (!showMySubjects || tab === "my_department") && (
        <HodHome departmentId={departmentId} />
      )}
    </div>
  );
}

function PageHeading() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Exams &amp; Analysis</h1>
      <p className="text-sm text-slate mt-0.5">
        Your assignments, marks progress, and class performance for the current period.
      </p>
    </div>
  );
}
