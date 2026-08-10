"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CATEGORY_META,
  STATUS_BADGE,
  STATUS_LABELS,
  fmtDate,
  offenceIcon,
  initials,
} from "@/components/records/shared";
import AccommodationProfileCard from "@/components/students/AccommodationProfileCard";
import { Camera, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SubjectEntry = { id: string; name: string; code: string; type: string; isElective: boolean };

type StudentBio = {
  id: string;
  fullName: string;
  admissionNumber: string;
  dateOfBirth: string | null;
  parentName: string | null;
  parentContact: string | null;
  photoUrl: string | null;
  enrolledAt: string;
  schoolClass: { id: string; name: string; form: number; stream: string | null };
  subjects: SubjectEntry[];
};

type ExamPoint = {
  periodId: string;
  periodName: string;
  academicYear: string;
  term: number | null;
  meanPoints: number | null;
  meanGrade: string | null;
  delta: number | null;
};

type AttendanceSummary = { total: number; present: number; absent: number; rate: number | null };

type DisciplineRow = {
  id: string;
  offence: string;
  status: string;
  dateOfOffence: string;
  aiSummary: string | null;
};

type AchievementRow = {
  id: string;
  title: string;
  category: string;
  achievementDate: string;
  awardLevel: string | null;
  aiSummary: string | null;
};

type ProfileData = {
  student: StudentBio;
  todayAttendance: "PRESENT" | "ABSENT" | "NOT_RECORDED";
  examHistory: ExamPoint[];
  attendance: AttendanceSummary;
  discipline: DisciplineRow[];
  achievements: AchievementRow[];
  meanFlagThreshold: number | null;
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Avatar with photo support — shows image if available, falls back to coloured initials. */
function StudentAvatar({
  name,
  photoUrl,
  studentId,
  onPhotoChange,
}: {
  name: string;
  photoUrl: string | null;
  studentId: string;
  onPhotoChange: (url: string | null) => void;
}) {
  const COLORS = [
    "bg-royal-50 text-royal", "bg-amber-50 text-amber-700",
    "bg-success-bg text-success", "bg-purple-50 text-purple-700",
    "bg-cyan-50 text-cyan-700", "bg-rose-50 text-rose-600",
  ];
  const color = COLORS[name.charCodeAt(0) % COLORS.length];
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError]   = useState(false);

  // Reset error state when photoUrl changes (new photo uploaded)
  useEffect(() => { setImgError(false); }, [photoUrl]);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/students/${studentId}/photo`, { method: "POST", body: fd });
      const json = await res.json();
      if (res.ok) onPhotoChange(json.url);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      await fetch(`/api/students/${studentId}/photo`, { method: "DELETE" });
      onPhotoChange(null);
    } finally {
      setUploading(false);
    }
  };

  const showPhoto = photoUrl && !imgError;

  return (
    <div className="relative group shrink-0">
      {/* Photo or initials circle */}
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name}
          onError={() => setImgError(true)}
          className="w-16 h-16 rounded-full object-cover border-2 border-line"
        />
      ) : (
        <div className={`w-16 h-16 ${color} rounded-full flex items-center justify-center font-display font-semibold text-2xl`}>
          {initials(name)}
        </div>
      )}

      {/* Hover overlay — camera icon to upload */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        title="Change photo"
        aria-label="Change student photo"
        className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center
                   opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer
                   disabled:cursor-wait"
      >
        {uploading ? (
          <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
        ) : (
          <Camera className="w-5 h-5 text-white" />
        )}
      </button>

      {/* Remove button — only shown when a photo exists */}
      {showPhoto && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          title="Remove photo"
          aria-label="Remove student photo"
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border border-line
                     flex items-center justify-center shadow-sm
                     opacity-0 group-hover:opacity-100 transition-opacity
                     hover:bg-danger hover:border-danger hover:text-white text-slate"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function TodayBadge({ status }: { status: "PRESENT" | "ABSENT" | "NOT_RECORDED" }) {
  if (status === "PRESENT")
    return <span className="inline-flex items-center gap-1 text-xs font-medium bg-success-bg text-success px-2 py-0.5 rounded-full">● Today: Present</span>;
  if (status === "ABSENT")
    return <span className="inline-flex items-center gap-1 text-xs font-medium bg-danger-bg text-danger px-2 py-0.5 rounded-full">● Today: Absent</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium bg-paper text-slate px-2 py-0.5 rounded-full border border-line">● Today: Not recorded</span>;
}

/** SVG spark-line between two exam points */
function TrendLine({ points }: { points: ExamPoint[] }) {
  if (points.length < 2) return null;
  const p1 = points[0].meanPoints ?? 0;
  const p2 = points[1].meanPoints ?? 0;
  const min = Math.min(p1, p2) - 0.5;
  const max = Math.max(p1, p2) + 0.5;
  const range = max - min || 1;
  const toY = (v: number) => 22 - ((v - min) / range) * 18;
  const colour = p2 >= p1 ? "#16a34a" : "#dc2626";
  return (
    <svg width={54} height={28} viewBox="0 0 54 28" fill="none" className="shrink-0">
      <line x1={4} y1={toY(p1)} x2={50} y2={toY(p2)} stroke={colour} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={4}  cy={toY(p1)} r={3} fill={colour} />
      <circle cx={50} cy={toY(p2)} r={3} fill={colour} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StudentProfile({
  studentId,
  role = "principal",
}: {
  studentId: string;
  role?: "principal" | "teacher" | "staff";
}) {
  const [data, setData]         = useState<ProfileData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/students/${studentId}/profile`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) { setError(json.error ?? "Couldn't load profile."); return; }
        setData(json);
        setPhotoUrl(json.student?.photoUrl ?? null);
      })
      .catch(() => setError("Couldn't load profile."))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-2xl">
        <div className="h-36 bg-paper rounded-xl border border-line" />
        <div className="h-24 bg-paper rounded-xl border border-line" />
        <div className="h-32 bg-paper rounded-xl border border-line" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-danger">{error ?? "Profile not found."}</p>;
  }

  const { student, todayAttendance, examHistory, attendance, discipline, achievements, meanFlagThreshold } = data;
  const base = role === "teacher" ? "/teacher" : role === "staff" ? "/staff" : "/principal";

  const attColour =
    (attendance.rate ?? 0) >= 90 ? "text-success" :
    (attendance.rate ?? 0) >= 75 ? "text-warn" : "text-danger";

  const openCases = discipline.filter(d => ["OPEN","ESCALATED"].includes(d.status)).length;

  // Academic flag: most recent exam result below the school's threshold
  const latestMeanPoints = examHistory.length > 0 ? examHistory[examHistory.length - 1].meanPoints : null;
  const isAcademicFlagged = meanFlagThreshold !== null && latestMeanPoints !== null && latestMeanPoints < meanFlagThreshold;

  return (
    <div className="space-y-5 max-w-2xl">

      {/* ── Profile header card ────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-xl p-5">

        {/* Today badge */}
        <div className="flex justify-end mb-4">
          <TodayBadge status={todayAttendance} />
        </div>

        {/* Avatar + name block */}
        <div className="flex items-start gap-4">
          <StudentAvatar
            name={student.fullName}
            photoUrl={photoUrl}
            studentId={student.id}
            onPhotoChange={setPhotoUrl}
          />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-semibold text-ink leading-tight">{student.fullName}</h1>
            <p className="text-sm text-slate mt-0.5">
              <span className="font-mono">{student.admissionNumber}</span>
              <span className="mx-1.5">·</span>
              {student.schoolClass.name}
              {student.schoolClass.stream && <span className="ml-1">({student.schoolClass.stream})</span>}
              <span className="mx-1.5">·</span>
              Form {student.schoolClass.form}
            </p>
            {/* Summary pills */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {isAcademicFlagged && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                  Academic concern
                </span>
              )}
              {attendance.rate !== null && (
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                  (attendance.rate) >= 90 ? "bg-success-bg text-success border-success/20" :
                  (attendance.rate) >= 75 ? "bg-warn-bg text-warn border-warn/20" :
                  "bg-danger-bg text-danger border-danger/20"
                }`}>
                  {attendance.rate}% attendance
                </span>
              )}
              {openCases > 0 && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-warn-bg text-warn border border-warn/20">
                  {openCases} open case{openCases !== 1 ? "s" : ""}
                </span>
              )}
              {achievements.length > 0 && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-success-bg text-success border border-success/20">
                  🏆 {achievements.length} achievement{achievements.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bio grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-line text-sm">
          <div>
            <p className="text-xs text-slate mb-0.5">Date of birth</p>
            <p className="text-ink">{student.dateOfBirth ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate mb-0.5">Enrolled</p>
            <p className="text-ink">{fmtDate(student.enrolledAt)}</p>
          </div>
          <div>
            <p className="text-xs text-slate mb-0.5">Parent / Guardian</p>
            <p className="text-ink font-medium">{student.parentName || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate mb-0.5">Mobile number</p>
            {student.parentContact ? (
              <a href={`tel:${student.parentContact}`} className="text-royal font-medium hover:underline">
                {student.parentContact}
              </a>
            ) : (
              <p className="text-ink">—</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-slate mb-1">Subjects</p>
            <div className="flex flex-wrap gap-1">
              {student.subjects.length === 0 ? (
                <span className="text-slate text-sm">—</span>
              ) : (
                student.subjects.map((s) => (
                  <span
                    key={s.id}
                    className={`inline-block text-[11px] rounded px-1.5 py-0.5 font-medium border ${
                      s.isElective
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-paper text-ink border-line"
                    }`}
                    title={s.isElective ? `${s.name} (elective)` : s.name}
                  >
                    {s.code}
                  </span>
                ))
              )}
            </div>
            {student.subjects.some(s => s.isElective) && (
              <p className="text-[10px] text-slate mt-1">Amber = elective</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Recent exam results ────────────────────────────────────────── */}
      <div className={`bg-white border rounded-xl p-5 ${isAcademicFlagged ? "border-red-300" : "border-line"}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">Recent exam results</h2>
          <Link href={`${base}/assessments/report-cards?studentId=${student.id}`} className="text-xs text-royal hover:underline">
            View all →
          </Link>
        </div>
        {isAcademicFlagged && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            <span className="text-base leading-none">⚑</span>
            <span>
              Mean points <span className="font-semibold">{latestMeanPoints?.toFixed(2)}</span> is below the school&apos;s flagging threshold of <span className="font-semibold">{meanFlagThreshold?.toFixed(2)}</span>. Academic intervention may be needed.
            </span>
          </div>
        )}
        {examHistory.length === 0 ? (
          <p className="text-sm text-slate">No assessment data recorded yet.</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex gap-3 flex-1 flex-wrap">
              {examHistory.map((e, i) => (
                <Link
                  key={e.periodId}
                  href={`${base}/assessments/report-cards/${student.id}?periodId=${e.periodId}`}
                  className="flex-1 min-w-[120px] rounded-lg border border-line bg-paper px-3 py-2.5 hover:border-royal/40 transition-colors group"
                >
                  <p className="text-[11px] text-slate truncate">
                    {e.periodName} · {e.academicYear}{e.term ? ` T${e.term}` : ""}
                  </p>
                  <div className="flex items-end gap-2 mt-1">
                    <span className="text-2xl font-display font-bold text-ink group-hover:text-royal transition-colors">
                      {e.meanGrade ?? "—"}
                    </span>
                    <div className="flex flex-col mb-0.5">
                      <span className="text-xs text-slate tabular-nums">{e.meanPoints?.toFixed(2) ?? "—"} pts</span>
                      {i === 1 && e.delta !== null && (
                        <span className={`text-[11px] font-semibold tabular-nums ${e.delta >= 0 ? "text-success" : "text-danger"}`}>
                          {e.delta >= 0 ? "+" : ""}{e.delta.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            {examHistory.length === 2 && (
              <div className="flex flex-col items-center gap-1 shrink-0">
                <TrendLine points={examHistory} />
                <span className={`text-[10px] font-semibold ${(examHistory[1].delta ?? 0) >= 0 ? "text-success" : "text-danger"}`}>
                  {(examHistory[1].delta ?? 0) >= 0 ? "▲ Improving" : "▼ Declining"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Achievements ──────────────────────────────────────────────── */}
      {achievements.length > 0 && (
        <div className="bg-white border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">Achievements</h2>
            <Link href={`${base}/records?studentId=${student.id}`} className="text-xs text-royal hover:underline">
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {achievements.slice(0, 4).map((a) => {
              const meta = CATEGORY_META[a.category] ?? CATEGORY_META.OTHER;
              return (
                <Link
                  key={a.id}
                  href={`${base}/records?studentId=${student.id}`}
                  className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5 hover:border-royal/40 transition-colors"
                >
                  <span className="text-lg leading-none mt-0.5 shrink-0">{meta.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{a.title}</p>
                    <p className="text-xs text-slate">
                      <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${meta.chip} mr-1.5`}>{meta.label}</span>
                      {fmtDate(a.achievementDate)}
                      {a.awardLevel && <span className="ml-1 text-ink/70">· {a.awardLevel}</span>}
                    </p>
                    {a.aiSummary && <p className="text-[11px] text-royal mt-0.5">✨ {a.aiSummary}</p>}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Discipline ────────────────────────────────────────────────── */}
      {discipline.length > 0 && (
        <div className="bg-white border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">Discipline</h2>
            <Link href={`${base}/records?studentId=${student.id}`} className="text-xs text-royal hover:underline">
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {discipline.slice(0, 4).map((d) => {
              const icon  = offenceIcon(d.offence);
              const badge = STATUS_BADGE[d.status] ?? "bg-paper text-slate";
              const label = STATUS_LABELS[d.status] ?? d.status;
              return (
                <Link
                  key={d.id}
                  href={`${base}/records?studentId=${student.id}&caseId=${d.id}`}
                  className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5 hover:border-royal/40 transition-colors"
                >
                  <span className="text-lg leading-none mt-0.5 shrink-0">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink truncate">{d.offence}</p>
                      <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium shrink-0 ${badge}`}>{label}</span>
                    </div>
                    <p className="text-xs text-slate mt-0.5">
                      <span className="font-medium text-ink/70">Form {student.schoolClass.form}</span>
                      <span className="mx-1">·</span>
                      {fmtDate(d.dateOfOffence)}
                    </p>
                    {d.aiSummary && <p className="text-[11px] text-royal mt-0.5">✨ {d.aiSummary}</p>}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Accommodation ─────────────────────────────────────────────── */}
      <AccommodationProfileCard studentId={student.id} role={role} />

      {/* ── Attendance summary ────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">Attendance summary</h2>
          <Link href={`${base}/attendance?studentId=${student.id}`} className="text-xs text-royal hover:underline">
            View records →
          </Link>
        </div>
        {attendance.total === 0 ? (
          <p className="text-sm text-slate">No attendance recorded yet.</p>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Days recorded", value: String(attendance.total), cls: "text-ink" },
              { label: "Present",       value: String(attendance.present), cls: "text-success" },
              { label: "Absent",        value: String(attendance.absent),  cls: "text-danger" },
              { label: "Rate",          value: attendance.rate !== null ? `${attendance.rate}%` : "—", cls: attColour },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-line bg-paper px-3 py-2.5 text-center">
                <p className={`text-xl font-display font-semibold ${c.cls}`}>{c.value}</p>
                <p className="text-slate text-[11px] mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
