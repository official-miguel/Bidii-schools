"use client";

/**
 * /super-admin/settings — platform owner only (enforced by layout.tsx and by
 * every API route this page calls).
 *
 * Tabs:
 *   My Profile   — the owner's own email + phone number.
 *   OTP API      — the one SMS account that sends forgot-password codes for
 *                  every school. Schools' own messages never use it.
 *   Super Admins — create, deactivate, and delete other super-admin logins.
 *                  They get the whole console except this section.
 *   History      — every super-admin action, with the admin who did it.
 */

import { useCallback, useEffect, useState, FormEvent } from "react";
import {
  KeyRound, Users, History as HistoryIcon, Save, CheckCircle2,
  AlertTriangle, ShieldCheck, Eye, EyeOff, UserPlus, Crown, Trash2, UserCircle,
} from "lucide-react";
import {
  Spinner, ErrorBanner, inputClass, labelClass,
  primaryButtonClass, secondaryButtonClass, dangerButtonClass,
} from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OtpConfig {
  configured: boolean;
  provider:   string | null;
  keyPreview: string | null;
  metadata:   { clientId?: string; senderId?: string } | null;
  isActive:   boolean;
  updatedAt:  string | null;
}

interface AdminRow {
  id:              string;
  email:           string;
  phone:           string | null;
  isActive:        boolean;
  isPlatformOwner: boolean;
  createdAt:       string;
  updatedAt:       string;
}

interface AuditRow {
  id:         string;
  adminId:    string;
  adminEmail: string;
  action:     string;
  targetType: string | null;
  targetId:   string | null;
  metadata:   Record<string, unknown> | null;
  createdAt:  string;
}

interface OwnerProfile {
  id:    string;
  email: string;
  phone: string | null;
}

const TABS = [
  { id: "profile", label: "My Profile",   Icon: UserCircle  },
  { id: "otp",     label: "OTP API",      Icon: KeyRound    },
  { id: "admins",  label: "Super Admins", Icon: Users       },
  { id: "history", label: "History",      Icon: HistoryIcon },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** "SCHOOL_SMS_CONFIG_SET" → "School sms config set" — readable, no mapping table to keep in sync. */
function humaniseAction(action: string): string {
  const words = action.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SuperAdminSettingsPage() {
  const [tab, setTab]               = useState<TabId>("profile");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-slate mt-1">
          Owner-only controls: the OTP SMS provider, super-admin accounts, and the
          record of every action taken in this console.
        </p>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-success-bg border border-success/20 text-success text-sm px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-border">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`shrink-0 flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === id
                ? "border-teal text-teal bg-teal-50/60"
                : "border-transparent text-slate hover:text-foreground hover:bg-background"
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {tab === "profile" && <MyProfileTab onSaved={flash} />}
      {tab === "otp"     && <OtpApiTab onSaved={flash} />}
      {tab === "admins"  && <SuperAdminsTab onChanged={flash} />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}

// ── My Profile tab ───────────────────────────────────────────────────────────

function MyProfileTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/super-admin/profile");
      if (!res.ok) throw new Error("Failed to load your profile");
      const j = await res.json() as { profile: OwnerProfile };
      setProfile(j.profile);
      setEmail(j.profile.email);
      setPhone(j.profile.phone ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/super-admin/profile", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim(), phone: phone.trim() }),
      });
      const j = await res.json() as { profile?: OwnerProfile; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      setProfile(j.profile ?? null);
      if (j.profile) { setEmail(j.profile.email); setPhone(j.profile.phone ?? ""); }
      onSaved("Profile updated");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const dirty = !!profile && (email.trim() !== profile.email || phone.trim() !== (profile.phone ?? ""));

  return (
    <div className="space-y-6 max-w-xl">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <form onSubmit={handleSave} className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Your contact details</h2>
          <p className="text-xs text-slate mt-1">
            Only visible to you — nothing here is shown to schools or other super admins.
          </p>
        </div>

        <div>
          <label htmlFor="owner-email" className={labelClass}>
            Email <span className="text-danger" aria-hidden>*</span>
          </label>
          <input
            id="owner-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="owner-phone" className={labelClass}>
            Phone number
          </label>
          <input
            id="owner-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0712345678"
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={saving || !dirty || !email.trim()}
          className={primaryButtonClass}
        >
          {saving ? <><Spinner size="sm" /> Saving…</> : <><Save className="h-4 w-4" aria-hidden /> Save changes</>}
        </button>
      </form>
    </div>
  );
}

// ── OTP API tab ───────────────────────────────────────────────────────────────

function OtpApiTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const [config,  setConfig]  = useState<OtpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);

  const [apiKey,   setApiKey]   = useState("");
  const [clientId, setClientId] = useState("");
  const [senderId, setSenderId] = useState("");
  const [showKey,  setShowKey]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/super-admin/sms-config");
      if (!res.ok) throw new Error("Failed to load OTP SMS settings");
      const j = await res.json() as { config: OtpConfig };
      setConfig(j.config);
      if (j.config.metadata?.clientId) setClientId(j.config.metadata.clientId);
      if (j.config.metadata?.senderId) setSenderId(j.config.metadata.senderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() || !clientId.trim() || !senderId.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/super-admin/sms-config", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          apiKey:   apiKey.trim(),
          clientId: clientId.trim(),
          senderId: senderId.trim(),
        }),
      });
      const j = await res.json() as { config?: OtpConfig; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      setConfig(j.config ?? null);
      setApiKey(""); setShowKey(false);
      onSaved("OTP SMS credentials saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 max-w-xl">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Status */}
      <div className={`flex items-start gap-4 rounded-xl border p-5 ${
        config?.configured && config.isActive
          ? "bg-success-bg border-success/20"
          : "bg-warn-bg border-warn/20"
      }`}>
        <ShieldCheck className={`h-6 w-6 shrink-0 mt-0.5 ${
          config?.configured && config.isActive ? "text-success" : "text-warn"
        }`} aria-hidden />
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${
            config?.configured && config.isActive ? "text-success" : "text-warn"
          }`}>
            {config?.configured
              ? `OTP provider active · ···${config.keyPreview}`
              : "No OTP provider configured"}
          </p>
          <p className="text-xs text-foreground/70 mt-0.5">
            Sends forgot-password codes for every school. Schools&apos; own messages go
            out on their own keys, set per school under Schools → SMS.
          </p>
          {config?.updatedAt && (
            <p className="text-xs text-foreground/60 mt-1">
              Last updated {new Date(config.updatedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">
          {config?.configured ? "Replace credentials" : "Set credentials"}
        </h2>

        <div>
          <label htmlFor="otp-key" className={labelClass}>
            API Key <span className="text-danger" aria-hidden>*</span>
          </label>
          <div className="relative">
            <input
              id="otp-key"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              required
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config?.configured ? "Enter a new key to replace the current one" : "Paste the OTP SMS API key"}
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate hover:text-foreground p-1"
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate">
            Encrypted with AES-256-GCM before saving — never stored in plaintext.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="otp-client" className={labelClass}>
              Client ID <span className="text-danger" aria-hidden>*</span>
            </label>
            <input
              id="otp-client"
              type="text"
              autoComplete="off"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="otp-sender" className={labelClass}>
              Sender ID <span className="text-danger" aria-hidden>*</span>
            </label>
            <input
              id="otp-sender"
              type="text"
              autoComplete="off"
              required
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              placeholder="BIDII"
              className={inputClass}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || !apiKey.trim() || !clientId.trim() || !senderId.trim()}
          className={primaryButtonClass}
        >
          {saving ? <><Spinner size="sm" /> Saving…</> : <><Save className="h-4 w-4" aria-hidden /> Save credentials</>}
        </button>
      </form>

      <div className="flex items-start gap-3 rounded-xl border border-warn/20 bg-warn-bg px-4 py-3.5 text-sm">
        <AlertTriangle className="h-4 w-4 text-warn mt-0.5 shrink-0" aria-hidden />
        <div className="text-warn">
          <p className="font-semibold">Changing this breaks password resets</p>
          <p className="text-xs mt-0.5">
            If these credentials are wrong, nobody at any school can receive a
            forgot-password code. Keep a backup before replacing them.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Super Admins tab ──────────────────────────────────────────────────────────

function SuperAdminsTab({ onChanged }: { onChanged: (msg: string) => void }) {
  const [admins,  setAdmins]  = useState<AdminRow[]>([]);
  const [meId,    setMeId]    = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [email,    setEmail]    = useState("");
  const [phone,    setPhone]    = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId,   setBusyId]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/super-admin/admins");
      if (!res.ok) throw new Error("Failed to load super admins");
      const j = await res.json() as { admins: AdminRow[]; currentUserId: string };
      setAdmins(j.admins);
      setMeId(j.currentUserId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 8) return;
    setCreating(true); setError(null);
    try {
      const res = await fetch("/api/super-admin/admins", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim(), password, phone: phone.trim() }),
      });
      const j = await res.json() as { admin?: AdminRow; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Could not create the account");
      setEmail(""); setPassword(""); setPhone("");
      onChanged(`Super admin ${j.admin?.email} created`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(admin: AdminRow) {
    const next = !admin.isActive;
    if (next === false && !confirm(`Deactivate ${admin.email}?\n\nThey will be signed out immediately and unable to log in.`)) return;
    setBusyId(admin.id); setError(null);
    try {
      const res = await fetch(`/api/super-admin/admins/${admin.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ isActive: next }),
      });
      const j = await res.json() as { admin?: AdminRow; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Could not update the account");
      onChanged(`${admin.email} ${next ? "reactivated" : "deactivated"}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(admin: AdminRow) {
    if (!confirm(`Permanently delete ${admin.email}?\n\nThis cannot be undone — they will lose access immediately and the account itself is gone (their past actions stay in History).`)) return;
    setDeletingId(admin.id); setError(null);
    try {
      const res = await fetch(`/api/super-admin/admins/${admin.id}`, { method: "DELETE" });
      const j = await res.json() as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Could not delete the account");
      onChanged(`${admin.email} deleted`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Create */}
      <form onSubmit={handleCreate} className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Add a super admin</h2>
          <p className="text-xs text-slate mt-1">
            They get the whole console except this Settings section. They&apos;ll be asked
            to set their own password the first time they sign in.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="new-admin-email" className={labelClass}>
              Email <span className="text-danger" aria-hidden>*</span>
            </label>
            <input
              id="new-admin-email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@bidiischools.co.ke"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="new-admin-password" className={labelClass}>
              Temporary password <span className="text-danger" aria-hidden>*</span>
            </label>
            <input
              id="new-admin-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="new-admin-phone" className={labelClass}>
              Phone number <span className="font-normal text-slate">(optional)</span>
            </label>
            <input
              id="new-admin-phone"
              type="tel"
              autoComplete="off"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0712345678"
              className={inputClass}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={creating || !email.trim() || password.length < 8}
          className={primaryButtonClass}
        >
          {creating ? <><Spinner size="sm" /> Creating…</> : <><UserPlus className="h-4 w-4" aria-hidden /> Create super admin</>}
        </button>
      </form>

      {/* List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Super admins</h2>
          <p className="text-xs text-slate mt-0.5">{admins.length} account{admins.length === 1 ? "" : "s"}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-background border-b border-border text-xs text-slate uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Email</th>
                <th className="px-5 py-3 text-left">Phone</th>
                <th className="px-5 py-3 text-left">Role</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Created</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {admins.map((a) => (
                <tr key={a.id}>
                  <td className="px-5 py-3 text-foreground">
                    {a.email}
                    {a.id === meId && <span className="ml-2 text-xs text-slate">(you)</span>}
                  </td>
                  <td className="px-5 py-3 text-slate">
                    {a.phone ?? <span className="text-slate/50">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    {a.isPlatformOwner ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-teal/20 bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal">
                        <Crown className="h-3 w-3" aria-hidden /> Owner
                      </span>
                    ) : (
                      <span className="text-xs text-slate">Super admin</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      a.isActive
                        ? "bg-success-bg text-success border-success/20"
                        : "bg-slate-100 text-slate border-border"
                    }`}>
                      {a.isActive ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate whitespace-nowrap">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {a.isPlatformOwner ? (
                      <span className="text-xs text-slate/60">—</span>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(a)}
                          disabled={busyId === a.id || deletingId === a.id}
                          className={`${secondaryButtonClass} text-xs`}
                        >
                          {busyId === a.id ? "Saving…" : a.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(a)}
                          disabled={busyId === a.id || deletingId === a.id}
                          className={`${dangerButtonClass} text-xs`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          {deletingId === a.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const [logs,    setLogs]    = useState<AuditRow[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const pageSize = 50;

  const load = useCallback(async (p: number) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/super-admin/audit?page=${p}`);
      if (!res.ok) throw new Error("Failed to load history");
      const j = await res.json() as { logs: AuditRow[]; total: number; page: number };
      setLogs(j.logs);
      setTotal(j.total);
      setPage(j.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Admin action history</h2>
          <p className="text-xs text-slate mt-0.5">
            {total.toLocaleString()} recorded action{total === 1 ? "" : "s"} — newest first
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate">No actions recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-background border-b border-border text-xs text-slate uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">When</th>
                  <th className="px-5 py-3 text-left">Admin</th>
                  <th className="px-5 py-3 text-left">Action</th>
                  <th className="px-5 py-3 text-left">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => {
                  const meta = log.metadata ?? {};
                  const targetName =
                    (meta.schoolName as string | undefined) ??
                    (meta.email as string | undefined) ??
                    log.targetId ??
                    "—";
                  return (
                    <tr key={log.id}>
                      <td className="px-5 py-3 text-xs text-slate whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-foreground">{log.adminEmail}</td>
                      <td className="px-5 py-3 text-foreground">{humaniseAction(log.action)}</td>
                      <td className="px-5 py-3 text-slate max-w-[260px] truncate" title={targetName}>
                        {log.targetType ? `${log.targetType}: ` : ""}{targetName}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background text-xs text-slate">
            <span>Page {page} of {pageCount}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => load(page - 1)}
                className="px-3 py-1 rounded border border-border hover:bg-line disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pageCount || loading}
                onClick={() => load(page + 1)}
                className="px-3 py-1 rounded border border-border hover:bg-line disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
