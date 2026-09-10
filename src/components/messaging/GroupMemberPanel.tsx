"use client";

import { useEffect, useState } from "react";
import { Users, GraduationCap, UserRound, Link2, Phone, X } from "lucide-react";

interface Member {
  id: string;
  extName: string | null;
  extPhone: string | null;
  teacher: { id: string; fullName: string; staffId: string } | null;
  student: { id: string; fullName: string; admissionNumber: string } | null;
}

interface Props {
  groupId:   string;
  groupName: string;
  onClose:   () => void;
  onChanged: () => void;
}

type AddMode = "external" | "staff" | "student";

const MODE_LABELS: Record<AddMode, string> = {
  external: "External contact",
  staff:    "Staff member",
  student:  "Student (parent contacted)",
};

function MemberIcon({ m }: { m: Member }) {
  if (m.extName)  return <Link2     className="h-4 w-4 text-slate"   aria-hidden />;
  if (m.teacher)  return <UserRound className="h-4 w-4 text-royal"   aria-hidden />;
  if (m.student)  return <GraduationCap className="h-4 w-4 text-teal" aria-hidden />;
  return                 <UserRound className="h-4 w-4 text-slate"   aria-hidden />;
}

function memberLabel(m: Member) {
  if (m.teacher) return { name: m.teacher.fullName,  sub: `Staff · ${m.teacher.staffId}` };
  if (m.student) return { name: m.student.fullName,  sub: `Adm ${m.student.admissionNumber} · parent contacted` };
  return          { name: m.extName ?? "—",          sub: m.extPhone ?? "" };
}

export default function GroupMemberPanel({ groupId, groupName, onClose, onChanged }: Props) {
  const [members, setMembers]   = useState<Member[]>([]);
  const [loading, setLoading]   = useState(true);
  const [mode, setMode]         = useState<AddMode>("external");
  const [search, setSearch]     = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; sub: string }[]>([]);
  const [extName, setExtName]   = useState("");
  const [extPhone, setExtPhone] = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  async function loadMembers() {
    setLoading(true);
    const r = await fetch(`/api/messaging/groups/${groupId}`);
    if (r.ok) { const d = await r.json(); setMembers(d.members ?? []); }
    setLoading(false);
  }

  useEffect(() => { loadMembers(); }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live search for staff / students
  useEffect(() => {
    if (mode === "external" || !search.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/messaging/recipients/search?q=${encodeURIComponent(search)}&limit=10`);
      if (!r.ok) return;
      const d = await r.json() as {
        students: { id: string; fullName: string; admissionNumber: string }[];
        teachers: { id: string; fullName: string; staffId: string }[];
      };
      if (mode === "staff") {
        setSearchResults(d.teachers.map((t) => ({ id: t.id, name: t.fullName, sub: t.staffId })));
      } else {
        setSearchResults(d.students.map((s) => ({ id: s.id, name: s.fullName, sub: s.admissionNumber })));
      }
    }, 200);
    return () => clearTimeout(t);
  }, [search, mode]);

  async function addSystemMember(id: string) {
    setSaving(true); setError("");
    const body = mode === "staff" ? { teacherId: id } : { studentId: id };
    const r = await fetch(`/api/messaging/groups/${groupId}/members`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (r.ok) {
      setSearch(""); setSearchResults([]);
      await loadMembers(); onChanged();
    } else {
      const d = await r.json() as { error?: string };
      setError(d.error ?? "Failed to add member.");
    }
    setSaving(false);
  }

  async function addExternal() {
    if (!extName.trim() || !extPhone.trim()) {
      setError("Both name and phone number are required.");
      return;
    }
    setSaving(true); setError("");
    const r = await fetch(`/api/messaging/groups/${groupId}/members`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ extName: extName.trim(), extPhone: extPhone.trim() }),
    });
    if (r.ok) {
      setExtName(""); setExtPhone("");
      await loadMembers(); onChanged();
    } else {
      const d = await r.json() as { error?: string };
      setError(d.error ?? "Failed to add contact.");
    }
    setSaving(false);
  }

  async function removeMember(memberId: string) {
    const r = await fetch(`/api/messaging/groups/${groupId}/members/${memberId}`, { method: "DELETE" });
    if (r.ok) { await loadMembers(); onChanged(); }
  }

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 bg-ink/30 flex justify-end" onClick={onClose}>
      {/* Panel */}
      <div
        className="relative w-full max-w-[480px] bg-card h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border bg-royal-50/40 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-royal/70 shrink-0" aria-hidden />
              <h2 className="font-display text-base font-semibold text-foreground">{groupName}</h2>
            </div>
            <p className="text-xs text-slate mt-0.5 ml-7">
              {loading ? "Loading…" : `${members.length} member${members.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate hover:text-foreground p-1 shrink-0 mt-0.5" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Add member section */}
          <div className="p-5 border-b border-border space-y-4">
            <p className="text-sm font-semibold text-foreground">Add a member</p>

            {/* Mode tabs */}
            <div className="grid grid-cols-3 gap-1 bg-background rounded-lg p-1">
              {(["external", "staff", "student"] as AddMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setSearch(""); setSearchResults([]); setError(""); }}
                  className={`rounded-md py-1.5 text-xs font-semibold transition-all ${
                    mode === m
                      ? "bg-card text-royal shadow-sm"
                      : "text-slate hover:text-foreground"
                  }`}
                >
                  {m === "external"
                    ? <><Phone        className="h-3.5 w-3.5 inline mr-1" aria-hidden />External</>
                    : m === "staff"
                    ? <><UserRound    className="h-3.5 w-3.5 inline mr-1" aria-hidden />Staff</>
                    : <><GraduationCap className="h-3.5 w-3.5 inline mr-1" aria-hidden />Student</>
                  }
                </button>
              ))}
            </div>

            <p className="text-xs text-slate -mt-1">{MODE_LABELS[mode]}</p>

            {/* External contact form */}
            {mode === "external" && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-slate mb-1">Full name *</label>
                  <input
                    type="text"
                    value={extName}
                    onChange={(e) => setExtName(e.target.value)}
                    placeholder="e.g. John Kamau"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:border-royal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate mb-1">Phone number *</label>
                  <input
                    type="tel"
                    value={extPhone}
                    onChange={(e) => setExtPhone(e.target.value)}
                    placeholder="e.g. 0712 345 678"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:border-royal focus:outline-none"
                  />
                </div>
                {error && <p className="text-xs text-danger">{error}</p>}
                <button
                  type="button"
                  onClick={addExternal}
                  disabled={saving || !extName.trim() || !extPhone.trim()}
                  className="w-full rounded-lg bg-royal text-white text-sm font-semibold py-2.5 hover:bg-royal-light transition-colors disabled:opacity-60"
                >
                  {saving ? "Adding…" : "Add contact"}
                </button>
              </div>
            )}

            {/* Staff / Student search */}
            {mode !== "external" && (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${mode === "staff" ? "staff by name or staff ID" : "students by name"}…`}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:border-royal focus:outline-none"
                  />
                  {searchResults.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-card shadow-xl max-h-44 overflow-y-auto">
                      {searchResults.map((r) => (
                        <li key={r.id} className="border-b border-border last:border-0">
                          <button
                            type="button"
                            onClick={() => addSystemMember(r.id)}
                            disabled={saving}
                            className="w-full text-left px-4 py-2.5 hover:bg-royal-50 flex items-center justify-between gap-2"
                          >
                            <div>
                              <span className="text-sm font-medium text-foreground">{r.name}</span>
                              <span className="ml-2 text-xs text-slate">{r.sub}</span>
                            </div>
                            <span className="text-xs text-royal shrink-0">+ Add</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {error && <p className="text-xs text-danger">{error}</p>}
              </div>
            )}
          </div>

          {/* Current members list */}
          <div className="p-5">
            <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-3">
              Current members
            </p>

            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-line/40 animate-pulse" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <p className="text-sm text-slate">No members yet — add some above.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => {
                  const { name, sub } = memberLabel(m);
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="shrink-0"><MemberIcon m={m} /></span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{name}</p>
                          {sub && <p className="text-xs text-slate truncate">{sub}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => removeMember(m.id)}
                        className="shrink-0 text-xs text-slate hover:text-danger transition-colors"
                        aria-label={`Remove ${name}`}
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border bg-background shrink-0">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-border text-sm font-semibold py-2.5 text-foreground hover:bg-card transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
