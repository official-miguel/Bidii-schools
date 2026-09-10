"use client";

import { useEffect, useState } from "react";
import { royalCardClass } from "@/components/ui";
import TemplateEditor from "./TemplateEditor";

interface Template { id: string; name: string; category: string | null; body: string; updatedAt: string }
interface Group    { id: string; name: string }
interface Props    { canManage: boolean; onUse: (t: Template) => void }

export default function TemplateList({ canManage, onUse }: Props) {
  const [templates, setTemplates]   = useState<Template[]>([]);
  const [groups,    setGroups]      = useState<Group[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing]       = useState<Template | null>(null);

  async function load() {
    const r = await fetch("/api/messaging/templates");
    if (r.ok) setTemplates(await r.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/messaging/groups")
      .then((r) => r.ok ? r.json() : [])
      .then((d: Group[]) => setGroups(d))
      .catch(() => {});
  }, []);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete template "${name}"?`)) return;
    const r = await fetch(`/api/messaging/templates/${id}`, { method: "DELETE" });
    if (r.ok) await load();
    else { const d = await r.json() as { error?: string }; alert(d.error ?? "Could not delete."); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
        {canManage && !showCreate && !editing && (
          <button onClick={() => setShowCreate(true)}
            className="rounded-md bg-royal text-white text-sm font-medium px-4 py-2 hover:bg-royal-light transition-colors shadow-sm">
            + New Template
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && canManage && (
        <div className={`${royalCardClass} p-5 mb-4`}>
          <h3 className="text-sm font-semibold text-foreground mb-4">New template</h3>
          <TemplateEditor
            onSaved={() => { setShowCreate(false); load(); }}
            onCancel={() => setShowCreate(false)}
            groups={groups}
          />
        </div>
      )}

      {/* Edit form */}
      {editing && canManage && (
        <div className={`${royalCardClass} p-5 mb-4`}>
          <h3 className="text-sm font-semibold text-foreground mb-4">Edit template</h3>
          <TemplateEditor
            initial={editing}
            onSaved={() => { setEditing(null); load(); }}
            onCancel={() => setEditing(null)}
            groups={groups}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_,i) => <div key={i} className="h-16 rounded-lg bg-line/40 animate-pulse"/>)}</div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
          <p className="text-sm font-medium text-foreground mb-1">No templates yet</p>
          <p className="text-xs text-slate">Save a fee reminder, meeting notice, or any reusable message here.</p>
        </div>
      ) : (
        <div className={`${royalCardClass} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium text-slate">Name</th>
                <th className="px-4 py-3 font-medium text-slate hidden md:table-cell">Preview</th>
                <th className="px-4 py-3"/>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-royal-50/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{t.name}</p>
                    {t.category && (
                      <span className="inline-block mt-0.5 rounded-full bg-royal/10 text-royal text-xs px-2 py-0.5">{t.category}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate text-xs hidden md:table-cell max-w-xs">
                    <span className="line-clamp-2">{t.body.slice(0, 100)}{t.body.length > 100 ? "…" : ""}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 justify-end">
                      <button onClick={() => onUse(t)} className="text-royal text-xs hover:underline">Use</button>
                      {canManage && (
                        <>
                          <button onClick={() => setEditing(t)} className="text-slate text-xs hover:underline">Edit</button>
                          <button onClick={() => handleDelete(t.id, t.name)} className="text-danger text-xs hover:underline">Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
