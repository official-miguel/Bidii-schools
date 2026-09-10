"use client";

/**
 * ArchivedStaffDrawer
 *
 * Right-side slide-in drawer displaying a complete archived staff profile.
 * Follows the same card-based layout as ArchivedStudentDrawer.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Avatar, Chip } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

type SubjectEntry = { id: string; name: string; code: string };

type ArchivedTeacher = {
  id: string;
  staffId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  archivedAt: string;
  archiveType: string | null;
  archiveReason: string | null;
  departmentSnapshot: string | null;
  employmentStartDate: string | null;
  primaryDepartment: { id: string; name: string } | null;
  teacherSubjects: { subject: SubjectEntry }[];
  archivedBy: { email: string } | null;
  user: { email: string; role: string; isActive: boolean } | null;
  timetableSlots: {
    subject: { name: string; code: string };
    schoolClass: { name: string; form: number };
  }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  staffId: string;
  onClose: () => void;
}

export default function ArchivedStaffDrawer({ staffId, onClose }: Props) {
  const [teacher, setTeacher] = useState<ArchivedTeacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/history/staff/${staffId}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) { setError(json.error ?? "Couldn't load profile."); return; }
        setTeacher(json);
      })
      .catch(() => setError("Network error — couldn't load profile."))
      .finally(() => setLoading(false));
  }, [staffId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px]"
           onClick={onClose} aria-hidden="true" />

      <aside
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl
                   bg-card border-l border-border shadow-2xl
                   flex flex-col overflow-hidden animate-slide-in-right"
        aria-label="Archived staff profile"
      >
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">Archived Staff Profile</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex items-center justify-center h-9 w-9 rounded-lg
                       text-slate hover:text-foreground hover:bg-background transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-36 bg-background rounded-xl border border-border" />
              <div className="h-24 bg-background rounded-xl border border-border" />
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          {!loading && !error && teacher && <StaffProfileBody teacher={teacher} />}
        </div>
      </aside>
    </>
  );
}

// ── Profile body ──────────────────────────────────────────────────────────────

function StaffProfileBody({ teacher }: { teacher: ArchivedTeacher }) {
  const dept = teacher.primaryDepartment?.name ?? teacher.departmentSnapshot ?? "—";

  // Deduplicate class assignments from timetable slots
  const classesSet = new Map<string, string>();
  teacher.timetableSlots.forEach((s) => {
    classesSet.set(s.schoolClass.name, `Form ${s.schoolClass.form}`);
  });

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Identity card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-4">
          <Avatar name={teacher.fullName} size="lg" />
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-xl font-semibold text-foreground leading-tight">
              {teacher.fullName}
            </h3>
            <p className="text-sm text-slate mt-0.5">
              <span className="font-mono text-xs">Staff ID {teacher.staffId}</span>
              {dept !== "—" && <><span className="mx-1.5">·</span>{dept}</>}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="inline-flex items-center text-xs font-medium
                               bg-info-bg text-info border border-info/20
                               px-2.5 py-0.5 rounded-full">
                Transferred
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3
                        mt-4 pt-4 border-t border-border text-sm">
          {teacher.email && (
            <div>
              <p className="text-xs text-slate mb-0.5">Email</p>
              <a href={`mailto:${teacher.email}`}
                 className="text-teal hover:underline text-sm">
                {teacher.email}
              </a>
            </div>
          )}
          {teacher.phone && (
            <div>
              <p className="text-xs text-slate mb-0.5">Phone</p>
              <a href={`tel:${teacher.phone}`}
                 className="text-teal hover:underline text-sm">
                {teacher.phone}
              </a>
            </div>
          )}
          <div>
            <p className="text-xs text-slate mb-0.5">Joined</p>
            <p className="text-foreground">{fmtDate(teacher.employmentStartDate ?? teacher.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-slate mb-0.5">Left</p>
            <p className="text-foreground">{fmtDate(teacher.archivedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-slate mb-0.5">Department</p>
            <p className="text-foreground">{dept}</p>
          </div>
          {teacher.archivedBy && (
            <div>
              <p className="text-xs text-slate mb-0.5">Archived by</p>
              <p className="text-foreground text-xs">{teacher.archivedBy.email}</p>
            </div>
          )}
        </div>

        {teacher.archiveReason && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-slate mb-1">Departure reason</p>
            <p className="text-sm text-foreground leading-relaxed">{teacher.archiveReason}</p>
          </div>
        )}
      </div>

      {/* Subjects taught */}
      {teacher.teacherSubjects.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">Subjects Taught</h4>
          <div className="flex flex-wrap gap-1.5">
            {teacher.teacherSubjects.map((ts) => (
              <Chip key={ts.subject.id} variant="teal" size="xs">
                {ts.subject.code} — {ts.subject.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Class assignments from timetable */}
      {classesSet.size > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">Class Assignments (historical)</h4>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(classesSet.entries()).map(([name, form]) => (
              <Chip key={name} variant="info" size="xs">{name} · {form}</Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
