"use client";

import { useEffect, useState } from "react";

interface Template { id: string; name: string; category: string | null; body: string }

interface Props {
  onSelect: (template: Template) => void;
}

export default function TemplateSelector({ onSelect }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [open, setOpen]           = useState(false);

  useEffect(() => {
    fetch("/api/messaging/templates")
      .then((r) => r.ok ? r.json() : [])
      .then(setTemplates)
      .catch(() => {});
  }, []);

  if (templates.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-border text-sm text-slate px-3 py-1.5 hover:border-royal hover:text-royal transition-colors flex items-center gap-1.5"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/>
        </svg>
        Load template
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 8L1 3h10L6 8z"/>
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 left-0 w-64 rounded-lg border border-border bg-card shadow-lg max-h-64 overflow-y-auto">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { onSelect(t); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 hover:bg-royal-50 border-b border-border last:border-0"
            >
              <p className="text-sm font-medium text-foreground">{t.name}</p>
              {t.category && <p className="text-xs text-slate">{t.category}</p>}
              <p className="text-xs text-slate/70 truncate mt-0.5">{t.body.slice(0, 60)}…</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
