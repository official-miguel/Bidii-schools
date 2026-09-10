"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Achievement,
  DisciplineRecord,
  StudentFileMeta,
  StudentLite,
  CATEGORY_META,
  STATUS_BADGE,
  STATUS_LABELS,
  Skeleton,
  fmtDate,
  fmtSize,
  offenceIcon,
} from "./shared";

type Tab = "overview" | "discipline" | "achievements" | "files" | "timeline" | "insights";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "discipline", label: "Discipline" },
  { id: "achievements", label: "Achievements" },
  { id: "files", label: "Files" },
  { id: "timeline", label: "Timeline" },
  { id: "insights", label: "AI Insights" },
];

// ---------------------------------------------------------------------------
// Module-level sub-components (defined outside the parent so they are never
// recreated during render, and can benefit from React.memo).
// ---------------------------------------------------------------------------

const DisciplineItem = memo(function DisciplineItem({
  r,
  expanded,
  regenerating,
  caseHrefBase,
  canManageDiscipline,
  onToggleExpand,
  onRegenerate,
}: {
  r: DisciplineRecord;
  expanded: string | null;
  regenerating: string | null;
  caseHrefBase?: string;
  canManageDiscipline: boolean;
  onToggleExpand: (id: string | null) => void;
  onRegenerate: (id: string) => void;
}) {
  const open = expanded === r.id;
  return (
    <li className="relative pl-8">
      <span className="absolute left-0 top-1 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-sm" aria-hidden>
        {offenceIcon(r.offence + " " + (r.aiSummary || ""))}
      </span>
      <button
        type="button"
        className="w-full text-left rounded-lg border border-border bg-card px-3 py-2.5 hover:border-royal/40 transition-colors"
        aria-expanded={open}
        onClick={() => onToggleExpand(open ? null : r.id)}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground truncate">{r.offence}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[r.status] || ""}`}>
            {STATUS_LABELS[r.status] || r.status}
          </span>
        </div>
        <p className="text-xs text-slate mt-0.5">
          {fmtDate(r.dateOfOffence)}
          {r.recordedBy ? ` · ${r.recordedBy.email}` : ""}
          {r._count.files > 0 ? ` · 📎 ${r._count.files}` : ""}
        </p>
        {r.aiSummary && <p className="text-xs text-royal mt-1">✨ {r.aiSummary}</p>}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border bg-background px-3 py-2.5 space-y-2 text-sm">
          {r.description && <p className="text-foreground whitespace-pre-line">{r.description}</p>}
          {r.actionTaken && (
            <p className="text-slate">
              Action: <span className="text-foreground">{r.actionTaken}</span>
            </p>
          )}
          {r.resolution && (
            <p className="text-slate">
              Resolution: <span className="text-foreground">{r.resolution}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {caseHrefBase && (
              <a href={`${caseHrefBase}/${r.id}`} className="text-xs text-royal hover:underline">
                Open full case →
              </a>
            )}
            {canManageDiscipline && (
              <button
                type="button"
                className="text-xs text-royal hover:underline disabled:opacity-50"
                disabled={regenerating === r.id}
                onClick={() => onRegenerate(r.id)}
              >
                {regenerating === r.id ? "Regenerating…" : "↻ Regenerate AI summary"}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
});

const FileRow = memo(function FileRow({
  f,
  canManageDiscipline,
  canManageAchievements,
  onRename,
  onDelete,
}: {
  f: StudentFileMeta;
  canManageDiscipline: boolean;
  canManageAchievements: boolean;
  onRename: (f: StudentFileMeta) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="flex items-center gap-2.5 bg-card border border-border rounded-lg px-3 py-2">
      {f.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/student-files/${f.id}`} alt="" loading="lazy" className="w-9 h-9 object-cover rounded border border-border shrink-0" />
      ) : (
        <span className="w-9 h-9 flex items-center justify-center rounded bg-background border border-border text-sm shrink-0" aria-hidden>
          📄
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground truncate">{f.fileName}</p>
        <p className="text-xs text-slate">
          {fmtSize(f.size)} · {fmtDate(f.createdAt)}
          {f.disciplineRecord ? ` · ${f.disciplineRecord.offence}` : ""}
        </p>
      </div>
      <a href={`/api/student-files/${f.id}`} target="_blank" className="text-xs text-royal hover:underline shrink-0">
        View
      </a>
      <a href={`/api/student-files/${f.id}`} download={f.fileName} className="text-xs text-royal hover:underline shrink-0">
        Download
      </a>
      {(canManageDiscipline || canManageAchievements) && (
        <>
          <button type="button" className="text-xs text-slate hover:text-foreground shrink-0" onClick={() => onRename(f)}>
            Rename
          </button>
          <button type="button" className="text-xs text-danger hover:underline shrink-0" onClick={() => onDelete(f.id)}>
            Delete
          </button>
        </>
      )}
    </li>
  );
});

export default function StudentWorkspace({
  student,
  canManageDiscipline,
  canManageAchievements,
  caseHrefBase,
  onClose,
  onRecordIncident,
  onAddAchievement,
  refreshKey,
}: {
  student: StudentLite;
  canManageDiscipline: boolean;
  canManageAchievements: boolean;
  caseHrefBase?: string;
  onClose: () => void;
  onRecordIncident: () => void;
  onAddAchievement: () => void;
  refreshKey: number;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [discipline, setDiscipline] = useState<DisciplineRecord[] | null>(null);
  const [achievements, setAchievements] = useState<Achievement[] | null>(null);
  const [files, setFiles] = useState<StudentFileMeta[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [dRes, aRes, fRes] = await Promise.all([
      fetch(`/api/discipline?studentId=${student.id}`),
      fetch(`/api/achievements?studentId=${student.id}`),
      fetch(`/api/student-files?studentId=${student.id}`),
    ]);
    setDiscipline(dRes.ok ? await dRes.json() : []);
    setAchievements(aRes.ok ? await aRes.json() : []);
    setFiles(fRes.ok ? await fRes.json() : []);
  }, [student.id]);

  useEffect(() => {
    setDiscipline(null);
    setAchievements(null);
    setFiles(null);
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function regenerate(recordId: string) {
    setRegenerating(recordId);
    const res = await fetch(`/api/discipline/${recordId}/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.ok) {
      const { aiSummary } = await res.json();
      setDiscipline((prev) => prev?.map((r) => (r.id === recordId ? { ...r, aiSummary } : r)) ?? null);
    }
    setRegenerating(null);
  }

  async function uploadGeneral(list: FileList) {
    setUploading(true);
    setUploadError(null);
    for (const file of Array.from(list)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("studentId", student.id);
      const res = await fetch("/api/student-files", { method: "POST", body: fd });
      if (!res.ok && res.status !== 409) {
        setUploadError((await res.json()).error || `Couldn't upload ${file.name}.`);
      }
    }
    setUploading(false);
    const fRes = await fetch(`/api/student-files?studentId=${student.id}`);
    if (fRes.ok) setFiles(await fRes.json());
  }

  async function deleteFile(id: string) {
    if (!confirm("Delete this file?")) return;
    const prev = files;
    setFiles((f) => f?.filter((x) => x.id !== id) ?? null); // optimistic
    const res = await fetch(`/api/student-files/${id}`, { method: "DELETE" });
    if (!res.ok) setFiles(prev ?? null);
  }

  async function renameFile(f: StudentFileMeta) {
    const name = prompt("Rename file", f.fileName);
    if (!name || name === f.fileName) return;
    const res = await fetch(`/api/student-files/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: name }),
    });
    if (res.ok) setFiles((prev) => prev?.map((x) => (x.id === f.id ? { ...x, fileName: name } : x)) ?? null);
  }

  const loading = discipline === null || achievements === null || files === null;
  const activeCases = discipline?.filter((r) => r.status === "OPEN" || r.status === "UNDER_REVIEW").length ?? 0;

  const insights = useMemo(() => {
    if (!discipline || !achievements) return null;
    const offenceCounts = new Map<string, number>();
    discipline.forEach((r) => offenceCounts.set(r.offence, (offenceCounts.get(r.offence) || 0) + 1));
    const topOffence = [...offenceCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const catCounts = new Map<string, number>();
    achievements.forEach((a) => catCounts.set(a.category, (catCounts.get(a.category) || 0) + 1));
    const topCat = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const now = Date.now();
    const days90 = 90 * 86400000;
    const recentD = discipline.filter((r) => now - +new Date(r.dateOfOffence) < days90).length;
    const prevD = discipline.filter((r) => {
      const t = now - +new Date(r.dateOfOffence);
      return t >= days90 && t < 2 * days90;
    }).length;
    const recentA = achievements.filter((a) => now - +new Date(a.achievementDate) < days90).length;
    const prevA = achievements.filter((a) => {
      const t = now - +new Date(a.achievementDate);
      return t >= days90 && t < 2 * days90;
    }).length;
    return {
      topOffence: topOffence ? `${topOffence[0]} (×${topOffence[1]})` : "None",
      totalD: discipline.length,
      totalA: achievements.length,
      topCat: topCat ? `${CATEGORY_META[topCat[0]]?.emoji || ""} ${CATEGORY_META[topCat[0]]?.label || topCat[0]}` : "None",
      trend: recentD > prevD ? "⚠️ More incidents recently" : recentD < prevD ? "✅ Improving behaviour" : "➖ Steady",
      growth: recentA > prevA ? "📈 Growing" : recentA < prevA ? "📉 Slowing" : "➖ Steady",
    };
  }, [discipline, achievements]);

  const filteredFiles = useMemo(() => {
    if (!files) return [];
    const q = fileQuery.trim().toLowerCase();
    return q ? files.filter((f) => f.fileName.toLowerCase().includes(q)) : files;
  }, [files, fileQuery]);

  const disciplineFiles = useMemo(() => filteredFiles.filter((f) => f.disciplineRecordId), [filteredFiles]);
  const generalFiles = useMemo(() => filteredFiles.filter((f) => !f.disciplineRecordId), [filteredFiles]);

  const timeline = useMemo(() => {
    if (!discipline || !achievements) return [];
    const items = [
      ...discipline.map((r) => ({
        id: `d-${r.id}`,
        date: r.dateOfOffence,
        kind: "discipline" as const,
        record: r,
        achievement: null as Achievement | null,
      })),
      ...achievements.map((a) => ({
        id: `a-${a.id}`,
        date: a.achievementDate,
        kind: "achievement" as const,
        record: null as DisciplineRecord | null,
        achievement: a,
      })),
    ];
    return items.sort((x, y) => +new Date(y.date) - +new Date(x.date));
  }, [discipline, achievements]);

  // Stable handlers to pass down to memo'd sub-components
  const handleSetExpanded = useCallback((id: string | null) => setExpanded(id), []);
  const handleRegenerate = useCallback(regenerate, []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleRenameFile = useCallback(renameFile, []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleDeleteFile = useCallback(deleteFile, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`${student.fullName} record workspace`}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full sm:w-[560px] bg-background shadow-2xl flex flex-col animate-[slideIn_.2s_ease-out]">
        <style>{`@keyframes slideIn{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}`}</style>

        {/* Header */}
        <div className="bg-card border-b border-border px-4 sm:px-5 pt-4 pb-0">
          <div className="flex items-start gap-3">
            <Avatar name={student.fullName} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold text-foreground truncate">{student.fullName}</h2>
              <p className="text-xs text-slate">
                <span className="font-mono">{student.admissionNumber}</span>
                {student.schoolClass ? ` · ${student.schoolClass.name}` : ""}
                {student.schoolClass?.stream ? ` · ${student.schoolClass.stream}` : ""}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {!loading && (
                  <>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-danger-bg text-danger">{discipline!.length} discipline</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-success-bg text-success">{achievements!.length} achievements</span>
                    {activeCases > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-warn-bg text-warn">{activeCases} active</span>}
                  </>
                )}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close workspace" className="text-slate hover:text-foreground text-2xl leading-none p-1">
              ×
            </button>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 mt-3">
            {canManageDiscipline && (
              <button type="button" className="text-xs px-2.5 py-1.5 rounded-md bg-teal text-white hover:bg-teal-dark transition-colors" onClick={onRecordIncident}>
                ➕ Record Incident
              </button>
            )}
            {canManageAchievements && (
              <button type="button" className="text-xs px-2.5 py-1.5 rounded-md bg-royal text-white hover:bg-royal-light" onClick={onAddAchievement}>
                🏆 Add Achievement
              </button>
            )}
            {(canManageDiscipline || canManageAchievements) && (
              <label className="text-xs px-2.5 py-1.5 rounded-md border border-border text-foreground hover:bg-background cursor-pointer">
                {uploading ? "Uploading…" : "📎 Upload File"}
                <input type="file" multiple className="sr-only" onChange={(e) => e.target.files && uploadGeneral(e.target.files)} />
              </label>
            )}
            <button type="button" className="text-xs px-2.5 py-1.5 rounded-md border border-border text-foreground hover:bg-background" onClick={() => window.print()}>
              🖨️ Print / PDF
            </button>
          </div>

          {/* Tabs */}
          <nav className="flex gap-1 mt-3 -mb-px overflow-x-auto" role="tablist" aria-label="Student record sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id ? "border-royal text-royal font-medium" : "border-transparent text-slate hover:text-foreground"
                }`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
          {uploadError && <p className="text-xs text-danger mb-2">{uploadError}</p>}
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : tab === "overview" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card border border-border rounded-xl p-3">
                  <p className="text-xs text-slate">Discipline cases</p>
                  <p className="font-display text-xl font-semibold text-foreground">{discipline!.length}</p>
                  <p className="text-xs text-slate mt-0.5">{activeCases} active</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-3">
                  <p className="text-xs text-slate">Achievements</p>
                  <p className="font-display text-xl font-semibold text-foreground">{achievements!.length}</p>
                  <p className="text-xs text-slate mt-0.5">{files!.length} files</p>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground mb-2">Recent activity</h3>
                {timeline.length === 0 ? (
                  <EmptyPanel emoji="🌱" text="No records yet — this student has a clean slate." />
                ) : (
                  <ul className="space-y-2">
                    {timeline.slice(0, 5).map((item) => (
                      <li key={item.id} className="flex items-center gap-2.5 bg-card border border-border rounded-lg px-3 py-2 text-sm">
                        <span aria-hidden>{item.kind === "discipline" ? offenceIcon(item.record!.offence) : CATEGORY_META[item.achievement!.category]?.emoji || "🏆"}</span>
                        <span className="text-foreground truncate flex-1">
                          {item.kind === "discipline" ? item.record!.aiSummary || item.record!.offence : item.achievement!.aiSummary || item.achievement!.title}
                        </span>
                        <span className="text-xs text-slate shrink-0">{fmtDate(item.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : tab === "discipline" ? (
            discipline!.length === 0 ? (
              <EmptyPanel
                emoji="🕊️"
                text="No discipline records yet."
                action={canManageDiscipline ? { label: "Record First Incident", onClick: onRecordIncident } : undefined}
              />
            ) : (
              <ul className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-line">
                {discipline!.map((r) => (
                  <DisciplineItem
                    key={r.id}
                    r={r}
                    expanded={expanded}
                    regenerating={regenerating}
                    caseHrefBase={caseHrefBase}
                    canManageDiscipline={canManageDiscipline}
                    onToggleExpand={handleSetExpanded}
                    onRegenerate={handleRegenerate}
                  />
                ))}
              </ul>
            )
          ) : tab === "achievements" ? (
            achievements!.length === 0 ? (
              <EmptyPanel
                emoji="🏆"
                text="No achievements recorded yet."
                action={canManageAchievements ? { label: "Add First Achievement", onClick: onAddAchievement } : undefined}
              />
            ) : (
              <ul className="space-y-3">
                {achievements!.map((a) => {
                  const meta = CATEGORY_META[a.category] || CATEGORY_META.OTHER;
                  return (
                    <li key={a.id} className="bg-card border border-border rounded-xl p-3.5">
                      <div className="flex items-start gap-2.5">
                        <span className="text-xl" aria-hidden>{meta.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{a.title}</p>
                          <p className="text-xs text-slate mt-0.5">
                            {meta.label} · {fmtDate(a.achievementDate)}
                            {a.awardLevel ? ` · ${a.awardLevel}` : ""}
                          </p>
                          {a.aiSummary && <p className="text-xs text-royal mt-1">✨ {a.aiSummary}</p>}
                          {a.students.length > 1 && (
                            <p className="text-xs text-slate mt-1">Shared with {a.students.length - 1} other student{a.students.length > 2 ? "s" : ""}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : tab === "files" ? (
            <div className="space-y-4">
              <input
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                placeholder="Search files…"
                value={fileQuery}
                onChange={(e) => setFileQuery(e.target.value)}
              />
              {filteredFiles.length === 0 ? (
                <EmptyPanel emoji="📂" text={fileQuery ? "No files match your search." : "No files uploaded yet."} />
              ) : (
                <>
                  {disciplineFiles.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium text-slate uppercase tracking-wide mb-2">Discipline evidence</h3>
                      <ul className="space-y-2">{disciplineFiles.map((f) => <FileRow key={f.id} f={f} canManageDiscipline={canManageDiscipline} canManageAchievements={canManageAchievements} onRename={handleRenameFile} onDelete={handleDeleteFile} />)}</ul>
                    </div>
                  )}
                  {generalFiles.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium text-slate uppercase tracking-wide mb-2">General</h3>
                      <ul className="space-y-2">{generalFiles.map((f) => <FileRow key={f.id} f={f} canManageDiscipline={canManageDiscipline} canManageAchievements={canManageAchievements} onRename={handleRenameFile} onDelete={handleDeleteFile} />)}</ul>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : tab === "timeline" ? (
            timeline.length === 0 ? (
              <EmptyPanel emoji="🗓️" text="Nothing on the timeline yet." />
            ) : (
              <ul className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-line">
                {timeline.map((item) =>
                  item.kind === "discipline" ? (
                    <DisciplineItem
                      key={item.id}
                      r={item.record!}
                      expanded={expanded}
                      regenerating={regenerating}
                      caseHrefBase={caseHrefBase}
                      canManageDiscipline={canManageDiscipline}
                      onToggleExpand={handleSetExpanded}
                      onRegenerate={handleRegenerate}
                    />
                  ) : (
                    <li key={item.id} className="relative pl-8">
                      <span className="absolute left-0 top-1 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-sm" aria-hidden>
                        {CATEGORY_META[item.achievement!.category]?.emoji || "🏆"}
                      </span>
                      <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{item.achievement!.title}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-success-bg text-success shrink-0">Achievement</span>
                        </div>
                        <p className="text-xs text-slate mt-0.5">{fmtDate(item.date)}</p>
                        {item.achievement!.aiSummary && <p className="text-xs text-royal mt-1">✨ {item.achievement!.aiSummary}</p>}
                      </div>
                    </li>
                  )
                )}
              </ul>
            )
          ) : insights ? (
            <div className="grid grid-cols-2 gap-3">
              <InsightCard label="Most common offence" value={insights.topOffence} />
              <InsightCard label="Discipline cases" value={String(insights.totalD)} />
              <InsightCard label="Achievements" value={String(insights.totalA)} />
              <InsightCard label="Top achievement category" value={insights.topCat} />
              <InsightCard label="Behaviour trend (90 days)" value={insights.trend} />
              <InsightCard label="Achievement growth" value={insights.growth} />
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

const InsightCard = memo(function InsightCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <p className="text-xs text-slate">{label}</p>
      <p className="text-sm font-medium text-foreground mt-1">{value}</p>
    </div>
  );
});

const EmptyPanel = memo(function EmptyPanel({ emoji, text, action }: { emoji: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
      <p className="text-3xl mb-2" aria-hidden>{emoji}</p>
      <p className="text-sm text-slate">{text}</p>
      {action && (
        <button type="button" className="mt-3 text-sm px-3 py-1.5 rounded-md bg-teal text-white hover:bg-teal-dark transition-colors" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
});
