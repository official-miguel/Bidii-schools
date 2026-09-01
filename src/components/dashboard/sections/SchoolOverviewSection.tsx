import { Users, GraduationCap, BookOpen, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import AlertBanner, { type AlertItem } from "@/components/dashboard/AlertBanner";

interface Props {
  rolePrefix:          string;
  isDeputy:            boolean;
  totalStudents:       number;
  totalTeachers:       number;
  totalClasses:        number;
  totalDepts:          number;
  unresolvedDiscipline:number;
  classesNoTeacher:    number;
  classesNoTimetable:  number;
  todayAbsences:       number;
  timetableConflicts:  number;
}

export default function SchoolOverviewSection({
  rolePrefix, isDeputy,
  totalStudents, totalTeachers, totalClasses, totalDepts,
  unresolvedDiscipline, classesNoTeacher, classesNoTimetable,
  todayAbsences, timetableConflicts,
}: Props) {
  const base = `/${rolePrefix}`;

  const alerts: AlertItem[] = [];
  if (unresolvedDiscipline > 0)
    alerts.push({ id: "disc", type: "warn", href: `${base}/records`,
      message: `${unresolvedDiscipline} unresolved discipline case${unresolvedDiscipline !== 1 ? "s" : ""} need attention.` });
  if (classesNoTeacher > 0)
    alerts.push({ id: "ct",  type: "danger", href: `${base}/classes`,
      message: `${classesNoTeacher} class${classesNoTeacher !== 1 ? "es" : ""} without a class teacher.` });
  if (classesNoTimetable > 0)
    alerts.push({ id: "tt",  type: "danger", href: `${base}/timetable`,
      message: `${classesNoTimetable} class${classesNoTimetable !== 1 ? "es have" : " has"} no timetable slots.` });
  if (todayAbsences > 10)
    alerts.push({ id: "abs", type: "warn",   href: `${base}/attendance/absent-today`,
      message: `${todayAbsences} student absences recorded today — higher than usual.` });

  return (
    <section aria-labelledby="school-overview-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-1 w-5 rounded-full bg-teal shrink-0" aria-hidden="true" />
        <h2
          id="school-overview-heading"
          className="text-sm font-semibold text-slate uppercase tracking-wide dark:text-dark-muted"
        >
          {isDeputy ? "School Overview" : "Principal Overview"}
        </h2>
      </div>

      {alerts.length > 0 && <AlertBanner alerts={alerts} />}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Students"     value={totalStudents}  href={`${base}/students`}    icon={Users}         color="teal" />
        <StatCard label="Staff"        value={totalTeachers}  href={`${base}/staff`}        icon={GraduationCap} color="teal" />
        <StatCard label="Classes"      value={totalClasses}   href={`${base}/classes`}      icon={BookOpen}      color="teal" />
        <StatCard label="Departments"  value={totalDepts}     href={`${base}/departments`}  icon={CheckCircle}   color="teal" />
        <StatCard label="Today absences" value={todayAbsences} href={`${base}/attendance/absent-today`} icon={Clock}
                  color={todayAbsences > 10 ? "warn" : "teal"} />
        <StatCard label="Discipline"   value={unresolvedDiscipline} href={`${base}/records`} icon={AlertTriangle}
                  color={unresolvedDiscipline > 0 ? "warn" : "success"}
                  badge={unresolvedDiscipline > 0 ? `${unresolvedDiscipline} open` : undefined}
                  badgeColor="warn" />
      </div>
    </section>
  );
}
