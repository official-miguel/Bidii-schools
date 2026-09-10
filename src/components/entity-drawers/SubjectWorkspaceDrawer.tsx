"use client";

/**
 * SubjectWorkspaceDrawer
 *
 * Slide-over workspace for a subject entity. Displays:
 *  - Subject details (name, code, type, forms, dept, timetable config)
 *  - Assigned teachers
 *  - Department link
 *
 * Cross-navigation: clicking a teacher opens StaffProfileDrawer.
 * Clicking department opens DepartmentWorkspaceDrawer.
 */

import { useEffect, useState } from "react";
import SlideOver from "@/components/workspace/SlideOver";
import { Avatar, Chip, Spinner } from "@/components/ui";
import { BookOpen, Building2, Clock, ExternalLink, XCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubjectDetail {
  id: string;
  name: string;
  code: string;
  type: "CORE" | "ELECTIVE";
  applicableForms: number[];
  lessonsPerWeek: number;
  doubleLesson: boolean;
  requiresSpecialRoom: string | null;
  department: { id: string; name: string };
  teacherSubjects: {
    teacher: { id: string; fullName: string; staffId: string; email: string | null };
  }[];
  _count: { teacherSubjects: number };
}

interface Props {
  subjectId: string | null;
  open: boolean;
  onClose: () => void;
  onOpenStaff?: (staffId: string, staffName: string) => void;
  onOpenDepartment?: (deptId: string, deptName: string) => void;
  basePath?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-slate uppercase tracking-wide mb-3 flex items-center gap-1.5">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SubjectWorkspaceDrawer({
  subjectId,
  open,
  onClose,
  onOpenStaff,
  onOpenDepartment,
  basePath = "/principal",
}: Props) {
  const [subject, setSubject] = useState<SubjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!open || !subjectId) return;
    setSubject(null); setError(null); setLoading(true);
    fetch(`/api/subjects/${subjectId}/detail`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setSubject(d);
      })
      .catch((e) => setError(e.message || "Couldn't load subject details."))
      .finally(() => setLoading(false));
  }, [open, subjectId]);

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={subject ? `${subject.name}` : "Subject workspace"}
      description={subject ? `${subject.code} · ${subject.type === "CORE" ? "Core subject" : "Elective"}` : undefined}
      size="lg"
    >
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-bg border border-danger/20 px-4 py-3">
          <XCircle className="h-4 w-4 text-danger shrink-0" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {subject && !loading && (
        <div className="space-y-5">

          {/* ── Overview ── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">{subject.name}</h2>
                <p className="text-sm text-slate mt-0.5 font-mono">{subject.code}</p>
              </div>
              <Chip variant={subject.type === "CORE" ? "success" : "warn"} size="sm">
                {subject.type === "CORE" ? "Core" : "Elective"}
              </Chip>
            </div>

            {/* Detail grid */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate mb-0.5">Department</p>
                {onOpenDepartment ? (
                  <button
                    type="button"
                    onClick={() => onOpenDepartment(subject.department.id, subject.department.name)}
                    className="flex items-center gap-1 text-teal hover:underline font-medium"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {subject.department.name}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                ) : (
                  <p className="text-foreground flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-slate" />
                    {subject.department.name}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs text-slate mb-0.5">Assigned teachers</p>
                <p className="text-foreground font-medium">{subject._count.teacherSubjects}</p>
              </div>

              <div>
                <p className="text-xs text-slate mb-0.5">Applicable forms</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {subject.applicableForms.sort((a, b) => a - b).map((f) => (
                    <Chip key={f} variant="default" size="xs">F{f}</Chip>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-slate mb-0.5">Periods / week</p>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate" />
                  <span className="text-foreground">{subject.lessonsPerWeek}</span>
                  {subject.doubleLesson && (
                    <Chip variant="info" size="xs">double</Chip>
                  )}
                </div>
              </div>

              {subject.requiresSpecialRoom && (
                <div className="col-span-2">
                  <p className="text-xs text-slate mb-0.5">Special room</p>
                  <Chip variant="default" size="xs">{subject.requiresSpecialRoom}</Chip>
                </div>
              )}
            </div>
          </div>

          {/* ── Teachers ── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <SectionTitle>
              <BookOpen className="h-3.5 w-3.5" />
              Assigned teachers ({subject._count.teacherSubjects})
            </SectionTitle>
            {subject.teacherSubjects.length === 0 ? (
              <p className="text-sm text-slate italic">No teachers assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {subject.teacherSubjects.map(({ teacher }) => (
                  <div
                    key={teacher.id}
                    className="flex items-center gap-3 py-1.5 border-b border-border last:border-0"
                  >
                    <Avatar name={teacher.fullName} size="sm" />
                    <div className="flex-1 min-w-0">
                      {onOpenStaff ? (
                        <button
                          type="button"
                          onClick={() => onOpenStaff(teacher.id, teacher.fullName)}
                          className="text-sm font-medium text-teal hover:underline flex items-center gap-1"
                        >
                          {teacher.fullName}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ) : (
                        <p className="text-sm font-medium text-foreground">{teacher.fullName}</p>
                      )}
                      <p className="text-xs text-slate font-mono">{teacher.staffId}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Quick links ── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <SectionTitle>Quick links</SectionTitle>
            <div className="space-y-2">
              <a href={`${basePath}/subjects`} className="flex items-center gap-2 text-sm text-teal hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                Subject list
              </a>
              <a href={`${basePath}/timetable`} className="flex items-center gap-2 text-sm text-teal hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                Timetable
              </a>
            </div>
          </div>
        </div>
      )}
    </SlideOver>
  );
}
