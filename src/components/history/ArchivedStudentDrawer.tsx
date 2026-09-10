"use client";

/**
 * ArchivedStudentDrawer
 *
 * Right-side slide-in drawer that displays a full read-only archived student
 * profile. Matches the existing StudentProfile layout/card style exactly.
 */

import { useEffect, useState } from "react";
import { X, ArrowLeftRight, UserX, GraduationCap } from "lucide-react";
import { Avatar, Chip } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

type SubjectEntry = { id: string; name: string; code: string; type: string };

type ArchivedStudent = {
  id: string;
  admissionNumber: string;
  fullName: string;
  dateOfBirth: string | null;
  parentName: string | null;
  parentContact: string | null;
  createdAt: string;
  archivedAt: string;
  archiveType: string | null;
  archiveReason: string | null;
  schoolClass: { id: string; name: string; form: number; stream: string | null };
  electives: { subject: SubjectEntry }[];
  archivedBy: { email: string } | null;
  disciplineRecords: {
    id: string; offence: string; description: string | null; status: string;
    dateOfOffence: string; recordedBy: { email: string } | null;
  }[];
  achievements: {
    achievement: {
      id: string; title: string; category: string;
      achievementDate: string; awardLevel: string | null;
    };
  }[];
};

type ProfileData = {
  student: ArchivedStudent;
  attendanceSummary: { total: number; present: number; absent: number; rate: number | null };
  recentAttendance: { id: string; date: string; status: string }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function ArchiveBadge({ type }: { type: string | null }) {
  if (type === "EXPULSION")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium
                       bg-danger-bg text-danger border border-danger/20
                       px-2.5 py-0.5 rounded-full">
        <UserX className="h-3 w-3" aria-hidden="true" />
        Expelled
      </span>
    );
  if (type === "GRADUATION")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium
                       bg-success-bg text-success border border-success/20
                       px-2.5 py-0.5 rounded-full">
        <GraduationCap className="h-3 w-3" aria-hidden="true" />
        Graduated
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium
                     bg-info-bg text-info border border-info/20
                     px-2.5 py-0.5 rounded-full">
      <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
      Transferred
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  studentId: string;
  onClose: () => void;
}

export default function ArchivedStudentDrawer({ studentId, onClose }: Props) {
  const [data, setData]       = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/history/students/${studentId}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) { setError(json.error ?? "Couldn't load profile."); return; }
        setData(json);
      })
      .catch(() => setError("Network error — couldn't load profile."))
      .finally(() => setLoading(false));
  }, [studentId]);

  // ── Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl
                   bg-card border-l border-border shadow-2xl
                   flex flex-col overflow-hidden
                   animate-slide-in-right"
        aria-label="Archived student profile"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">Archived Profile</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center h-9 w-9 rounded-lg
                       text-slate hover:text-foreground hover:bg-background transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-36 bg-background rounded-xl border border-border" />
              <div className="h-24 bg-background rounded-xl border border-border" />
              <div className="h-32 bg-background rounded-xl border border-border" />
            </div>
          )}
          {error && (
            <p className="text-sm text-danger">{error}</p>
          )}
          {!loading && !error && data && (
            <ProfileBody data={data} />
          )}
        </div>
      </aside>
    </>
  );
}

// ── Profile body ──────────────────────────────────────────────────────────────

function ProfileBody({ data }: { data: ProfileData }) {
  const { student, attendanceSummary, recentAttendance } = data;

  const attColor =
    (attendanceSummary.rate ?? 0) >= 90 ? "text-success" :
    (attendanceSummary.rate ?? 0) >= 75 ? "text-warn" : "text-danger";

  const expulsionRecord = student.disciplineRecords.find(
    (d) => d.offence === "Expulsion"
  );

  return (
    <div className="space-y-5 max-w-2xl">

      {/* ── Identity card ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-4">
          <Avatar name={student.fullName} size="lg" />
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-xl font-semibold text-foreground leading-tight">
              {student.fullName}
            </h3>
            <p className="text-sm text-slate mt-0.5">
              <span className="font-mono">{student.admissionNumber}</span>
              <span className="mx-1.5">·</span>
              {student.schoolClass.name}
              <span className="mx-1.5">·</span>
              Form {student.schoolClass.form}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <ArchiveBadge type={student.archiveType} />
              {attendanceSummary.rate !== null && (
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full
                                  border ${attColor === "text-success"
                  ? "bg-success-bg border-success/20 text-success"
                  : attColor === "text-warn"
                  ? "bg-warn-bg border-warn/20 text-warn"
                  : "bg-danger-bg border-danger/20 text-danger"}`}>
                  {attendanceSummary.rate}% attendance
                </span>
              )}
              {student.achievements.length > 0 && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full
                                 bg-success-bg text-success border border-success/20">
                  🏆 {student.achievements.length} achievement{student.achievements.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bio grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3
                        mt-4 pt-4 border-t border-border text-sm">
          <div>
            <p className="text-xs text-slate mb-0.5">Date of birth</p>
            <p className="text-foreground">{student.dateOfBirth
              ? new Date(student.dateOfBirth).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
              : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate mb-0.5">Enrolled</p>
            <p className="text-foreground">{fmtDate(student.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-slate mb-0.5">Archived</p>
            <p className="text-foreground">{fmtDate(student.archivedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-slate mb-0.5">Parent / Guardian</p>
            <p className="text-foreground font-medium">{student.parentName || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate mb-0.5">Contact</p>
            {student.parentContact ? (
              <a href={`tel:${student.parentContact}`}
                 className="text-teal font-medium hover:underline text-sm">
                {student.parentContact}
              </a>
            ) : <p className="text-foreground">—</p>}
          </div>
          {student.archivedBy && (
            <div>
              <p className="text-xs text-slate mb-0.5">Archived by</p>
              <p className="text-foreground text-xs">{student.archivedBy.email}</p>
            </div>
          )}
        </div>

        {/* Subjects */}
        {student.electives.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-slate mb-1.5">Elective subjects</p>
            <div className="flex flex-wrap gap-1">
              {student.electives.map((e) => (
                <Chip key={e.subject.id} variant="teal" size="xs">{e.subject.code}</Chip>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Expulsion record ── */}
      {student.archiveType === "EXPULSION" && expulsionRecord && (
        <div className="bg-danger-bg/30 border border-danger/20 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-danger mb-2">Expulsion Record</h4>
          <p className="text-sm text-foreground leading-relaxed">
            {expulsionRecord.description || student.archiveReason || "No reason recorded."}
          </p>
          <p className="text-xs text-slate mt-2">
            Recorded on {fmtDate(expulsionRecord.dateOfOffence)}
            {expulsionRecord.recordedBy && ` · ${expulsionRecord.recordedBy.email}`}
          </p>
        </div>
      )}

      {/* ── Attendance summary ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3">Attendance Summary</h4>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: "Total days", value: attendanceSummary.total },
            { label: "Present",    value: attendanceSummary.present },
            { label: "Absent",     value: attendanceSummary.absent },
          ].map((stat) => (
            <div key={stat.label}
                 className="rounded-lg border border-border bg-background px-3 py-2.5">
              <p className="text-xl font-semibold text-foreground">{stat.value}</p>
              <p className="text-xs text-slate mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
        {recentAttendance.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {recentAttendance.map((a) => (
              <span
                key={a.id}
                title={fmtDate(a.date)}
                className={`w-5 h-5 rounded-sm text-[9px] flex items-center justify-center
                            font-semibold ${a.status === "PRESENT"
                  ? "bg-success/20 text-success"
                  : "bg-danger/20 text-danger"}`}
              >
                {a.status === "PRESENT" ? "P" : "A"}
              </span>
            ))}
            <span className="text-[10px] text-slate self-center ml-1">
              last {recentAttendance.length} days
            </span>
          </div>
        )}
      </div>

      {/* ── Discipline history ── */}
      {student.disciplineRecords.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">
            Discipline Records ({student.disciplineRecords.length})
          </h4>
          <div className="space-y-2">
            {student.disciplineRecords.map((d) => (
              <div key={d.id}
                   className="flex items-start justify-between gap-3
                              rounded-lg border border-border bg-background px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{d.offence}</p>
                  {d.description && (
                    <p className="text-xs text-slate mt-0.5 line-clamp-2">{d.description}</p>
                  )}
                  <p className="text-xs text-slate/70 mt-0.5">{fmtDate(d.dateOfOffence)}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full
                                  ${d.status === "RESOLVED"
                  ? "bg-success-bg text-success"
                  : d.status === "ESCALATED"
                  ? "bg-danger-bg text-danger"
                  : "bg-warn-bg text-warn"}`}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Achievements ── */}
      {student.achievements.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">
            Achievements ({student.achievements.length})
          </h4>
          <div className="space-y-2">
            {student.achievements.map((a) => (
              <div key={a.achievement.id}
                   className="rounded-lg border border-border bg-background px-3 py-2.5">
                <p className="text-sm font-medium text-foreground">{a.achievement.title}</p>
                <p className="text-xs text-slate mt-0.5">
                  {a.achievement.category.replace(/_/g, " ")}
                  {a.achievement.awardLevel && ` · ${a.achievement.awardLevel}`}
                  {" · "}{fmtDate(a.achievement.achievementDate)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
