"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { royalCardClass } from "@/components/ui";
import GroupMemberPanel from "./GroupMemberPanel";
import { useFormDraft } from "@/lib/hooks/useFormDraft";

interface Group { id: string; name: string; description: string | null; createdAt: string; _count: { members: number } }
interface Props  { canManage: boolean }

export default function GroupManager({ canManage }: Props) {
  const [groups, setGroups]         = useState<Group[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [draft, setDraft, clearDraft] = useFormDraft("bidii_draft_group_create", {
    name: "", description: "",
  });
  const [name, setName]               = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [creating, setCreating]       = useState(false);
  const [error, setError]             = useState("");
  const [panelGroup, setPanelGroup]   = useState<Group | null>(null);

  // Persist on change
  useEffect(() => { setDraft({ name, description }); }, [name, description, setDraft]);

  async function loadGroups() {
    const r = await fetch("/api/messaging/groups");
    if (r.ok) setGroups(await r.json());
    setLoading(false);
  }

  useEffect(() => { loadGroups(); }, []);

  async function handleCreate() {
    if (!name.trim()) { setError("Name is required."); return; }
    setCreating(true); setError("");
    const r = await fetch("/api/messaging/groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() }),
    });
    if (r.ok) {
      const created: Group & { _count?: { members: number } } = await r.json();
      const newGroup: Group = { ...created, _count: { members: 0 } };
      clearDraft();
      setName(""); setDescription(""); setShowCreate(false);
      await loadGroups();
      // Immediately open the member panel so the user can add contacts right away
      setPanelGroup(newGroup);
    } else {
      const d = await r.json() as { error?: string };
      setError(d.error ?? "Could not create group.");
    }
    setCreating(false);
  }

  async function handleDelete(id: string, groupName: string) {
    if (!confirm(`Delete group "${groupName}"? This cannot be undone.`)) return;
    const r = await fetch(`/api/messaging/groups/${id}`, { method: "DELETE" });
    if (r.ok) { await loadGroups(); }
    else { const d = await r.json() as { error?: string }; alert(d.error ?? "Could not delete group."); }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm font-medium text-foreground">
            {groups.length} group{groups.length !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-slate mt-0.5">Groups let you message custom sets of people with one click</p>
        </div>
        {canManage && !showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-royal text-white text-sm font-semibold px-4 py-2.5 hover:bg-royal-light transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
            </svg>
            New Group
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && canManage && (
        <div className={`${royalCardClass} p-5 mb-5`}>
          <h3 className="text-sm font-semibold text-foreground mb-1">Create a new group</h3>
          <p className="text-xs text-slate mb-4">
            Give it a name like <strong>Board of Management</strong> or <strong>PTA Committee</strong>. After creating, you can add members immediately.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate mb-1">Group name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Board of Management"
                autoFocus
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:border-royal focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate mb-1">Description (optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this group for?"
                className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:border-royal focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="rounded-lg bg-royal text-white text-sm font-semibold px-5 py-2 hover:bg-royal-light transition-colors disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create & add members →"}
              </button>
              <button
                onClick={() => { setShowCreate(false); setError(""); clearDraft(); setName(""); setDescription(""); }}
                className="rounded-lg border border-border text-sm font-medium px-4 py-2 text-foreground hover:bg-background transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Groups list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-line/40 animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 && !showCreate ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <div className="w-14 h-14 rounded-2xl bg-royal-50 flex items-center justify-center mx-auto mb-4">
            <Users className="h-7 w-7 text-royal/60" aria-hidden />
          </div>
          <p className="text-base font-medium text-foreground mb-1">No groups yet</p>
          <p className="text-sm text-slate mb-4">
            Create a group like &quot;Board of Management&quot; or &quot;PTA Committee&quot; to message multiple specific people at once.
          </p>
          {canManage && (
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-royal text-white text-sm font-semibold px-5 py-2.5 hover:bg-royal-light transition-colors shadow-sm"
            >
              Create your first group
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className={`${royalCardClass} p-4 flex items-center justify-between gap-4`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-royal-50 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-royal/70" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{g.name}</p>
                  <p className="text-xs text-slate mt-0.5">
                    {g._count.members} member{g._count.members !== 1 ? "s" : ""}
                    {g.description && <> · {g.description}</>}
                  </p>
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setPanelGroup(g)}
                    className="rounded-lg border border-royal/30 text-royal text-xs font-semibold px-3 py-1.5 hover:bg-royal-50 transition-colors"
                  >
                    {g._count.members === 0 ? "Add members" : "Manage"}
                  </button>
                  <button
                    onClick={() => handleDelete(g.id, g.name)}
                    className="rounded-lg border border-border text-slate text-xs font-medium px-3 py-1.5 hover:border-danger hover:text-danger transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {panelGroup && (
        <GroupMemberPanel
          groupId={panelGroup.id}
          groupName={panelGroup.name}
          onClose={() => setPanelGroup(null)}
          onChanged={loadGroups}
        />
      )}
    </div>
  );
}
