"use client";

/**
 * MyProfilePage — used by /principal/profile, /teacher/profile, /staff/profile.
 *
 * Shows the current user's own info (read-only).
 * The only editable thing is the profile photo.
 */

import { useEffect, useRef, useState } from "react";
import { Camera, X, Mail, Shield, BadgeCheck, Calendar, Phone, BookOpen, Users } from "lucide-react";
import { PageHeader } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TeacherInfo = {
  fullName: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  staffId: string;
  employmentStartDate: string | null;
  primaryDepartment: { name: string } | null;
  classTeacherOf: { name: string } | null;
};

type MeData = {
  id: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  teacher: TeacherInfo | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  PRINCIPAL:   "Principal",
  TEACHER:     "Teacher",
  ADMIN_STAFF: "Admin Staff",
};

const AVATAR_COLORS = [
  "bg-royal-50 text-royal",
  "bg-amber-50 text-amber-700",
  "bg-teal/10 text-teal",
  "bg-purple-50 text-purple-700",
  "bg-cyan-50 text-cyan-700",
  "bg-rose-50 text-rose-600",
];

function getColor(str: string) {
  return AVATAR_COLORS[str.charCodeAt(0) % AVATAR_COLORS.length];
}

function getInitials(email: string, name?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Avatar with photo upload
// ---------------------------------------------------------------------------

function ProfileAvatar({
  avatarUrl,
  displayName,
  onPhotoChange,
}: {
  avatarUrl: string | null;
  displayName: string;
  onPhotoChange: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError]   = useState(false);

  useEffect(() => { setImgError(false); }, [avatarUrl]);

  const showPhoto = avatarUrl && !imgError;
  const color     = getColor(displayName);
  const inits     = getInitials(displayName);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/me/photo", { method: "POST", body: fd });
      const json = await res.json();
      if (res.ok) onPhotoChange(json.url);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      await fetch("/api/me/photo", { method: "DELETE" });
      onPhotoChange(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative group shrink-0">
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={displayName}
          onError={() => setImgError(true)}
          className="w-24 h-24 rounded-full object-cover border-2 border-line shadow-sm"
        />
      ) : (
        <div
          className={`w-24 h-24 rounded-full ${color} flex items-center justify-center
                      font-display font-bold text-3xl border-2 border-line shadow-sm`}
        >
          {inits}
        </div>
      )}

      {/* Hover overlay — upload */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        title="Change photo"
        aria-label="Change profile photo"
        className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center
                   opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer
                   disabled:cursor-wait"
      >
        {uploading
          ? <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
          : <Camera className="w-6 h-6 text-white" />
        }
      </button>

      {/* Remove button */}
      {showPhoto && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          title="Remove photo"
          aria-label="Remove profile photo"
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white border border-line
                     flex items-center justify-center shadow-sm
                     opacity-0 group-hover:opacity-100 transition-opacity
                     hover:bg-danger hover:border-danger hover:text-white text-slate"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

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

// ---------------------------------------------------------------------------
// Info row
// ---------------------------------------------------------------------------

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-line last:border-0">
      <div className="w-8 h-8 rounded-lg bg-paper border border-line flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-slate" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate mb-0.5">{label}</p>
        <p className="text-sm font-medium text-ink break-words">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function MyProfilePage() {
  const [data, setData]         = useState<MeData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) { setError(json.error ?? "Couldn't load profile."); return; }
        setData(json);
        setAvatarUrl(json.avatarUrl ?? null);
      })
      .catch(() => setError("Couldn't load profile."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-xl">
        <div className="h-8 w-40 bg-paper rounded-lg" />
        <div className="h-48 bg-paper rounded-xl border border-line" />
        <div className="h-32 bg-paper rounded-xl border border-line" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-danger">{error ?? "Profile not found."}</p>;
  }

  const displayName = data.teacher?.fullName ?? data.email;
  const roleLabel   = ROLE_LABELS[data.role] ?? data.role;

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        title="My Profile"
        description="Your account information. Only your profile photo can be changed here."
      />

      {/* ── Identity card ─────────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-xl p-6">
        <div className="flex items-center gap-5">
          <ProfileAvatar
            avatarUrl={avatarUrl}
            displayName={displayName}
            onPhotoChange={setAvatarUrl}
          />
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold text-ink leading-tight truncate">
              {displayName}
            </h2>
            <span className="inline-flex items-center gap-1.5 mt-1 text-xs font-medium
                             bg-teal/10 text-teal px-2.5 py-1 rounded-full">
              <BadgeCheck className="w-3.5 h-3.5" />
              {roleLabel}
            </span>
            <p className="text-xs text-slate mt-2">
              Hover the photo to change it · PNG, JPG, or WebP · Max 2 MB
            </p>
          </div>
        </div>
      </div>

      {/* ── Account info ──────────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-xl px-5 py-2">
        <h3 className="text-xs font-semibold text-slate uppercase tracking-wide pt-3 pb-1">
          Account
        </h3>
        <InfoRow icon={Mail}    label="Email address" value={data.email} />
        <InfoRow icon={Shield}  label="Role"          value={roleLabel} />
      </div>

      {/* ── Teacher-specific info ─────────────────────────────────────── */}
      {data.teacher && (
        <div className="bg-white border border-line rounded-xl px-5 py-2">
          <h3 className="text-xs font-semibold text-slate uppercase tracking-wide pt-3 pb-1">
            Staff details
          </h3>
          <InfoRow
            icon={BadgeCheck}
            label="Staff ID"
            value={data.teacher.staffId}
          />
          {data.teacher.designation && (
            <InfoRow
              icon={Shield}
              label="Designation"
              value={data.teacher.designation}
            />
          )}
          {data.teacher.phone && (
            <InfoRow
              icon={Phone}
              label="Phone"
              value={
                <a href={`tel:${data.teacher.phone}`} className="text-royal hover:underline">
                  {data.teacher.phone}
                </a>
              }
            />
          )}
          {data.teacher.primaryDepartment && (
            <InfoRow
              icon={BookOpen}
              label="Department"
              value={data.teacher.primaryDepartment.name}
            />
          )}
          {data.teacher.classTeacherOf && (
            <InfoRow
              icon={Users}
              label="Class teacher of"
              value={data.teacher.classTeacherOf.name}
            />
          )}
          {data.teacher.employmentStartDate && (
            <InfoRow
              icon={Calendar}
              label="Joined"
              value={fmtDate(data.teacher.employmentStartDate)}
            />
          )}
        </div>
      )}

      <p className="text-xs text-slate text-center pb-2">
        To update other details, contact the principal or school administrator.
      </p>
    </div>
  );
}
