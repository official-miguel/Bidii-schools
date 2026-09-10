import type { ReactNode } from "react";

export type StudentLite = {
  id: string;
  fullName: string;
  admissionNumber: string;
  schoolClass?: { id: string; name: string; form: number; stream?: string | null } | null;
};

export type DisciplineRecord = {
  id: string;
  offence: string;
  description: string | null;
  actionTaken: string | null;
  resolution: string | null;
  status: string;
  dateOfOffence: string;
  aiSummary: string | null;
  createdAt: string;
  student: StudentLite;
  recordedBy: { email: string; role: string; teacher: { fullName: string } | null } | null;
  _count: { files: number; caseNotes: number };
};

export type Achievement = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  achievementDate: string;
  awardLevel: string | null;
  aiSummary: string | null;
  createdAt: string;
  recordedBy: { email: string } | null;
  students: { student: StudentLite }[];
};

export type StudentFileMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  disciplineRecordId?: string | null;
  disciplineRecord?: { offence: string } | null;
};

const ROLE_LABELS: Record<string, string> = {
  PRINCIPAL:   "Principal",
  TEACHER:     "Teacher",
  ADMIN_STAFF: "Admin Staff",
  PARENT:      "Parent",
};

/**
 * Returns the best display label for a user who recorded/created something.
 * Priority: teacher full name → role label → email.
 */
export function formatCreator(
  u: { email: string; role?: string; name?: string | null; teacher?: { fullName: string } | null } | null
): string {
  if (!u) return "System";
  if (u.teacher?.fullName) return u.teacher.fullName;
  if (u.name) return u.name;
  if (u.role && ROLE_LABELS[u.role]) return ROLE_LABELS[u.role];
  return u.email;
}

export const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  RESOLVED: "Resolved",
  ESCALATED: "Escalated",
};

export const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-warn-bg text-warn",
  UNDER_REVIEW: "bg-royal-50 text-royal",
  RESOLVED: "bg-success-bg text-success",
  ESCALATED: "bg-danger-bg text-danger",
};

export const CATEGORY_META: Record<string, { label: string; emoji: string; chip: string }> = {
  SPORTS: { label: "Sports", emoji: "🏆", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  MUSIC_FESTIVAL: { label: "Music Festival", emoji: "🎵", chip: "bg-purple-50 text-purple-700 border-purple-200" },
  LEADERSHIP: { label: "Leadership", emoji: "👑", chip: "bg-royal-50 text-royal border-blue-200" },
  ACADEMICS: { label: "Academic Excellence", emoji: "🎓", chip: "bg-success-bg text-success border-green-200" },
  INNOVATION: { label: "Innovation", emoji: "💻", chip: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  OTHER: { label: "Other", emoji: "🎨", chip: "bg-background text-slate border-border" },
};

export const OFFENCE_ICONS: [RegExp, string][] = [
  [/vap|smok|drug|substance|alcohol/i, "🚭"],
  [/fight|violence|assault|hit/i, "🥊"],
  [/bully/i, "⚠️"],
  [/late|punctual/i, "⏰"],
  [/damage|property|vandal|broke/i, "🔨"],
  [/cheat|exam|dishonest|steal|theft/i, "🚫"],
  [/noise|disrupt|disrespect/i, "📢"],
  [/absent|truan|sneak/i, "🚪"],
];

export function offenceIcon(text: string): string {
  for (const [re, icon] of OFFENCE_ICONS) if (re.test(text)) return icon;
  return "📋";
}

export function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase();
}

/// Deterministic pastel for student avatars, keyed off the name.
const AVATAR_COLORS = [
  "bg-royal-50 text-royal",
  "bg-amber-50 text-amber-700",
  "bg-success-bg text-success",
  "bg-purple-50 text-purple-700",
  "bg-cyan-50 text-cyan-700",
  "bg-rose-50 text-rose-700",
];
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "w-14 h-14 text-lg" : size === "sm" ? "w-6 h-6 text-[10px]" : "w-9 h-9 text-xs";
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full font-semibold shrink-0 ${cls} ${avatarColor(name)}`}
    >
      {initials(name)}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line/60 ${className}`} aria-hidden />;
}

export function StatCard({
  label,
  value,
  icon,
  loading,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-[0_1px_2px_rgba(30,58,138,0.06)] flex items-center gap-3 min-w-0">
      <span className="w-10 h-10 rounded-lg bg-royal-50 flex items-center justify-center text-lg shrink-0" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        {loading ? (
          <Skeleton className="h-7 w-12 mb-1" />
        ) : (
          <p className="font-display text-2xl font-semibold text-foreground leading-tight">{value}</p>
        )}
        <p className="text-xs text-slate truncate">{label}</p>
      </div>
    </div>
  );
}
