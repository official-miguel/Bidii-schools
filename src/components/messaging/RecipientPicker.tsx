"use client";

import { useEffect, useRef, useState } from "react";
import { searchRecipientsLocal, seedRecipientsCache } from "@/lib/messaging/offlineSync";
import type { RecipientDescriptor } from "@/lib/messaging/resolve";

interface Group { id: string; name: string }
interface SchoolClass { id: string; name: string; form: number; stream: string | null }

interface Props {
  schoolId:  string;
  value:     RecipientDescriptor[];
  onChange:  (v: RecipientDescriptor[]) => void;
  groups?:   Group[];
  classes?:  SchoolClass[];
}

interface SearchResult {
  id: string; displayName: string; type: "student" | "teacher"; subtitle: string;
}

export default function RecipientPicker({ schoolId, value, onChange, groups = [], classes = [] }: Props) {
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const debounceT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { seedRecipientsCache(schoolId).catch(() => {}); }, [schoolId]);

  // ── Key helpers ──────────────────────────────────────────────────────────
  function descriptorKey(d: RecipientDescriptor): string {
    if (d.type === "student")    return `student:${d.studentId}`;
    if (d.type === "teacher")    return `teacher:${d.teacherId}`;
    if (d.type === "class")      return `class:${d.classId}`;
    if (d.type === "form")       return `form:${d.form}`;
    if (d.type === "group")      return `group:${d.groupId}`;
    if (d.type === "external")   return `ext:${d.phone}`;
    return d.type;
  }

  const valueKeys = new Set(value.map(descriptorKey));

  function toggle(key: string, descriptor: RecipientDescriptor) {
    if (descriptor.type === "school") {
      onChange(valueKeys.has("school") ? [] : [{ type: "school" }]);
      return;
    }
    if (valueKeys.has(key)) {
      onChange(value.filter((d) => descriptorKey(d) !== key));
    } else {
      onChange([...value.filter((d) => d.type !== "school"), descriptor]);
    }
  }

  function addSearchResult(r: SearchResult) {
    const descriptor: RecipientDescriptor =
      r.type === "student" ? { type: "student", studentId: r.id } : { type: "teacher", teacherId: r.id };
    const key = `${r.type}:${r.id}`;
    if (valueKeys.has(key)) return;
    onChange([...value.filter((d) => d.type !== "school"), descriptor]);
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  }

  // ── Live search ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (debounceT.current) clearTimeout(debounceT.current);
    debounceT.current = setTimeout(async () => {
      setSearching(true);
      try {
        const local = await searchRecipientsLocal(query, schoolId, 15);
        if (local.length > 0) {
          setResults(local.map((r) => ({
            id: r.id.split(":")[1], displayName: r.displayName, type: r.type,
            subtitle: r.type === "student" ? "Student" : "Teacher / Staff",
          })));
          setSearching(false);
          return;
        }
        const res = await fetch(`/api/messaging/recipients/search?q=${encodeURIComponent(query)}&limit=15`);
        if (!res.ok) return;
        const data = await res.json() as {
          students: { id: string; fullName: string; schoolClass?: { name: string } }[];
          teachers: { id: string; fullName: string; staffId: string }[];
        };
        setResults([
          ...data.students.map((s) => ({ id: s.id, displayName: s.fullName, type: "student" as const, subtitle: s.schoolClass?.name ?? "Student" })),
          ...data.teachers.map((t) => ({ id: t.id, displayName: t.fullName, type: "teacher" as const, subtitle: `Staff · ${t.staffId}` })),
        ]);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 200);
  }, [query, schoolId]);

  // ── Chip data ────────────────────────────────────────────────────────────
  // Broad audience chips
  const broadChips: { key: string; label: string; descriptor: RecipientDescriptor }[] = [
    { key: "school",      label: "Entire School",  descriptor: { type: "school" } },
    { key: "allParents",  label: "All Parents",    descriptor: { type: "allParents" } },
    { key: "allTeachers", label: "All Teachers",   descriptor: { type: "allTeachers" } },
    { key: "allStaff",    label: "All Staff",      descriptor: { type: "allStaff" } },
  ];

  // Per-form chips — derived entirely from the school's registered classes.
  // If no classes are loaded yet, no form chips are shown (avoids fake fallbacks).
  const forms = Array.from(new Set(classes.map((c) => c.form))).sort((a, b) => a - b);
  const formChips = forms.map((f) => ({
    key: `form:${f}`,
    label: `Form ${f} (all)`,
    descriptor: { type: "form" as const, form: f },
  }));

  // Per-class/stream chips — only shown when a school actually has streams
  const streamClasses = classes.filter((c) => c.stream);
  const classChips = streamClasses.map((c) => ({
    key:        `class:${c.id}`,
    label:      c.name,
    descriptor: { type: "class" as const, classId: c.id },
  }));

  // Custom group chips
  const groupChips = groups.map((g) => ({
    key:        `group:${g.id}`,
    label:      g.name,
    descriptor: { type: "group" as const, groupId: g.id },
  }));

  // ── Display chips for selected ────────────────────────────────────────────
  const selectedDisplay = value.map((d) => {
    const key = descriptorKey(d);
    let label = key;
    if (d.type === "school")      label = "Entire School";
    else if (d.type === "allParents")  label = "All Parents";
    else if (d.type === "allTeachers") label = "All Teachers";
    else if (d.type === "allStaff")    label = "All Staff";
    else if (d.type === "form")        label = `Form ${d.form} (all)`;
    else if (d.type === "class") {
      const cls = classes.find((c) => c.id === d.classId);
      label = cls?.name ?? "Class";
    }
    else if (d.type === "group")  label = groups.find((g) => g.id === d.groupId)?.name ?? "Group";
    else if (d.type === "student") label = `Student`;
    else if (d.type === "teacher") label = `Staff`;
    else if (d.type === "external") label = d.label;
    return { key, label };
  });

  function ChipButton({ k, label, active }: { k: string; label: string; active: boolean }) {
    return (
      <button type="button" onClick={() => toggle(k, value.find((d) => descriptorKey(d) === k) ?? broadChips.find((c) => c.key === k)?.descriptor ?? formChips.find((c) => c.key === k)?.descriptor ?? classChips.find((c) => c.key === k)?.descriptor ?? groupChips.find((c) => c.key === k)?.descriptor ?? { type: "school" })}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
          active
            ? "bg-royal border-royal text-white shadow-sm"
            : "border-line bg-white text-slate hover:border-royal hover:text-royal hover:bg-royal-50"
        }`}
      >
        {label}
      </button>
    );
  }

  // Simpler toggle that takes key + descriptor directly
  function Chip({ k, label, descriptor }: { k: string; label: string; descriptor: RecipientDescriptor }) {
    const active = valueKeys.has(k);
    return (
      <button
        type="button"
        onClick={() => toggle(k, descriptor)}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
          active
            ? "bg-royal border-royal text-white shadow-sm"
            : "border-line bg-white text-slate hover:border-royal hover:text-royal hover:bg-royal-50"
        }`}
      >
        {label}
      </button>
    );
  }

  void ChipButton; // unused — replaced by Chip

  return (
    <div className="space-y-4">
      {/* Selected pills */}
      {selectedDisplay.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-royal-50/60 border border-royal/10">
          {selectedDisplay.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 rounded-full bg-royal text-white text-xs font-medium px-3 py-1">
              {s.label}
              <button type="button" onClick={() => onChange(value.filter((d) => descriptorKey(d) !== s.key))}
                className="hover:opacity-70 ml-0.5" aria-label={`Remove ${s.label}`}>
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 4.586L9.293 1.293a1 1 0 111.414 1.414L7.414 6l3.293 3.293a1 1 0 01-1.414 1.414L6 7.414l-3.293 3.293a1 1 0 01-1.414-1.414L4.586 6 1.293 2.707A1 1 0 012.707 1.293L6 4.586z"/>
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Broad audience */}
      <div>
        <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-2">Broad audience</p>
        <div className="flex flex-wrap gap-1.5">
          {broadChips.map((c) => <Chip key={c.key} k={c.key} label={c.label} descriptor={c.descriptor} />)}
        </div>
      </div>

      {/* By form */}
      <div>
        <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-2">By form (all students)</p>
        <div className="flex flex-wrap gap-1.5">
          {formChips.map((c) => <Chip key={c.key} k={c.key} label={c.label} descriptor={c.descriptor} />)}
        </div>
      </div>

      {/* By stream — only if school has streams */}
      {classChips.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-2">By stream / class</p>
          <div className="flex flex-wrap gap-1.5">
            {classChips.map((c) => <Chip key={c.key} k={c.key} label={c.label} descriptor={c.descriptor} />)}
          </div>
        </div>
      )}

      {/* Custom groups */}
      {groupChips.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-2">Custom groups</p>
          <div className="flex flex-wrap gap-1.5">
            {groupChips.map((c) => <Chip key={c.key} k={c.key} label={c.label} descriptor={c.descriptor} />)}
          </div>
        </div>
      )}

      {/* Individual search */}
      <div>
        <p className="text-xs font-semibold text-slate uppercase tracking-wide mb-2">Add individual person</p>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search student or staff name…"
            className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink focus:border-royal focus:outline-none"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-royal border-t-transparent animate-spin" />
          )}
          {!searching && query && (
            <button type="button" onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </button>
          )}
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-xl border border-line bg-white shadow-xl max-h-52 overflow-y-auto">
              {results.map((r) => {
                const key = `${r.type}:${r.id}`;
                const already = valueKeys.has(key);
                return (
                  <li key={r.id} className="border-b border-line last:border-0">
                    <button
                      type="button"
                      onClick={() => addSearchResult(r)}
                      className={`w-full text-left px-4 py-3 hover:bg-royal-50 flex items-center justify-between gap-2 ${already ? "opacity-50" : ""}`}
                    >
                      <div>
                        <span className="text-sm font-medium text-ink">{r.displayName}</span>
                        <span className="ml-2 text-xs text-slate">{r.subtitle}</span>
                      </div>
                      {already
                        ? <span className="text-xs text-royal shrink-0">✓ Added</span>
                        : <span className="text-xs text-slate shrink-0">+ Add</span>
                      }
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
