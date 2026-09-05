import { Users, BookOpen, Clock } from "lucide-react";
import Link from "next/link";
import StatCard from "@/components/dashboard/StatCard";
import CountdownTimer from "@/components/dashboard/CountdownTimer";
import type { HeadOfDeptRole } from "@/lib/derivedRoles";

interface AssessmentPeriod {
  id: string; name: string; closingDate?: Date | string | null;
}

interface Props {
  rolePrefix:          string;
  derived:             HeadOfDeptRole | null;
  deptTeachers:        number;
  deptSubjects:        number;
  marksEntered:        number;
  totalMarksExpected:  number;
  activePeriods:       AssessmentPeriod[];
  deptClasses?:        unknown[];
}

export default function HODSection({
  rolePrefix, derived, deptTeachers, deptSubjects, marksEntered, totalMarksExpected, activePeriods,
}: Props) {
  if (!derived) return null;

  const assessmentsHref = `/${rolePrefix}/assessments`;

  return (
    <section aria-labelledby="hod-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-1 w-5 rounded-full bg-teal shrink-0" aria-hidden="true" />
        <h2
          id="hod-heading"
          className="text-sm font-semibold text-slate uppercase tracking-wide dark:text-dark-muted"
        >
          Head of Department — {derived.departmentName}
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Dept teachers" value={deptTeachers} href={`/${rolePrefix === "teacher" ? "teacher" : "staff"}/directory`} icon={Users}    color="teal" />
        <StatCard label="Dept subjects" value={deptSubjects} href={assessmentsHref}                                                  icon={BookOpen} color="teal" />
        <StatCard label="Marks entered" value={marksEntered} href={assessmentsHref}                                                  icon={Clock}
                  color={marksEntered > 0 ? "success" : "warn"}
                  sub={totalMarksExpected > 0 ? `/ ${totalMarksExpected} expected` : "this period"} />
      </div>

      {activePeriods.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-4 sm:p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Marks submission deadlines</p>
            <Link href={assessmentsHref} className="text-xs text-teal hover:underline">Enter marks</Link>
          </div>
          <ul className="space-y-3">
            {activePeriods.map((ap) => (
              <li key={ap.id} className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1">
                <span className="text-sm text-ink dark:text-dark-text min-w-0 xs:truncate xs:pr-2">{ap.name}</span>
                <span className="shrink-0">
                  {ap.closingDate
                    ? <CountdownTimer deadline={new Date(ap.closingDate).toISOString()} label="Closes" />
                    : <span className="text-xs text-slate dark:text-dark-muted">No deadline set</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
