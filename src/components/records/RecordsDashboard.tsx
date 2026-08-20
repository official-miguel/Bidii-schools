"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui";
import StudentWorkspace from "./StudentWorkspace";
import QuickIncidentModal from "./QuickIncidentModal";
import { fetchAllStudents } from "@/lib/utils/fetchAllStudents";
import AchievementModal from "./AchievementModal";
import {
  Avatar,
  Achievement,
  DisciplineRecord,
  StudentLite,
  CATEGORY_META,
  STATUS_BADGE,
  STATUS_LABELS,
  Skeleton,
  StatCard,
  fmtDate,
  offenceIcon,
} from "./shared";

type ClassLite = { id: string; name: string; form: number; stream?: string | null };

const selectClass =
  "rounded-md border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---------------------------------------------------------------------------
// Pure tab button — defined at module level so it is never recreated during
// parent renders and can benefit from React.memo.
// ---------------------------------------------------------------------------

const TabBtn = memo(function TabBtn({
  t,
  label,
  count,
  activeTab,
  onSelect,
}: {
  t: "discipline" | "achievements";
  label: string;
  count: number;
  activeTab: "discipline" | "achievements";
  onSelect: (t: "discipline" | "achievements") => void;
}) {
  const active = activeTab === t;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`px-3.5 py-1.5 text-sm rounded-md transition-colors ${
        active ? "bg-teal text-white" : "text-slate hover:text-ink"
      }`}
      onClick={() => onSelect(t)}
    >
      {label}{" "}
      <span className={`text-xs ${active ? "text-white/70" : "text-slate/70"}`}>{count}</span>
    </button>
  );
});

export default function RecordsDashboard({
  canViewDiscipline,
  canManageDiscipline,
  canViewAchievements,
  canManageAchievements,
  caseHrefBase,
}: {
  canViewDiscipline: boolean;
  canManageDiscipline: boolean;
  canViewAchievements: boolean;
  canManageAchievements: boolean;
  caseHrefBase?: string;
}) {
  const [records, setRecords] = useState<DisciplineRecord[] | null>(canViewDiscipline ? null : []);
  const [achievements, setAchievements] = useState<Achievement[] | null>(canViewAchievements ? null : []);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [classes, setClasses] = useState<ClassLite[]>([]);

  const [tab, setTab] = useState<"discipline" | "achievements">(canViewDiscipline ? "discipline" : "achievements");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim().toLowerCase(), 250);
  const [classId, setClassId] = useState("");
  const [stream, setStream] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hasFiles, setHasFiles] = useState(false);
  const [hasAi, setHasAi] = useState(false);

  const [workspaceStudent, setWorkspaceStudent] = useState<StudentLite | null>(null);
  const [incidentModal, setIncidentModal] = useState<{ studentId?: string } | null>(null);
  const [achievementModal, setAchievementModal] = useState<{ editing: Achievement | null; studentIds?: string[] } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    const jobs: Promise<void>[] = [
      fetchAllStudents().then((data) => {
        setStudents(
          data.map((s) => {
            const st = s as StudentLite;
            return {
              id: st.id,
              fullName: st.fullName,
              admissionNumber: st.admissionNumber,
              schoolClass: st.schoolClass || null,
            };
          })
        );
      }),
      fetch("/api/classes").then(async (r) => {
        if (r.ok) setClasses(await r.json());
      }),
    ];
    if (canViewDiscipline)
      jobs.push(fetch("/api/discipline").then(async (r) => setRecords(r.ok ? await r.json() : [])));
    if (canViewAchievements)
      jobs.push(fetch("/api/achievements").then(async (r) => setAchievements(r.ok ? await r.json() : [])));
    await Promise.all(jobs);
  }, [canViewDiscipline, canViewAchievements]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const loading = records === null || achievements === null;

  const streams = useMemo(() => {
    const set = new Set<string>();
    classes.forEach((c) => c.stream && set.add(c.stream));
    return [...set].sort();
  }, [classes]);

  const stats = useMemo(() => {
    const activeCases = records?.filter((r) => r.status === "OPEN" || r.status === "UNDER_REVIEW").length ?? 0;
    const withRecords = new Set<string>();
    records?.forEach((r) => withRecords.add(r.student.id));
    achievements?.forEach((a) => a.students.forEach((s) => withRecords.add(s.student.id)));
    return {
      discipline: records?.length ?? 0,
      achievements: achievements?.length ?? 0,
      activeCases,
      studentsWithRecords: withRecords.size,
    };
  }, [records, achievements]);

  const matchesStudent = useCallback(
    (s: StudentLite) => {
      if (classId && s.schoolClass?.id !== classId) return false;
      if (stream && s.schoolClass?.stream !== stream) return false;
      return true;
    },
    [classId, stream]
  );

  const inDateRange = useCallback(
    (d: string) => {
      const day = d.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    },
    [dateFrom, dateTo]
  );

  const filteredRecords = useMemo(() => {
    if (!records) return [];
    return records.filter((r) => {
      if (!matchesStudent(r.student)) return false;
      if (status && r.status !== status) return false;
      if (!inDateRange(r.dateOfOffence)) return false;
      if (hasFiles && r._count.files === 0) return false;
      if (hasAi && !r.aiSummary) return false;
      if (q) {
        const hay = `${r.student.fullName} ${r.student.admissionNumber} ${r.student.schoolClass?.name || ""} ${r.offence} ${r.description || ""} ${r.aiSummary || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, q, status, matchesStudent, inDateRange, hasFiles, hasAi]);

  const filteredAchievements = useMemo(() => {
    if (!achievements) return [];
    return achievements.filter((a) => {
      if ((classId || stream) && !a.students.some((s) => matchesStudent(s.student))) return false;
      if (category && a.category !== category) return false;
      if (!inDateRange(a.achievementDate)) return false;
      if (hasAi && !a.aiSummary) return false;
      if (q) {
        const hay = `${a.title} ${a.description || ""} ${a.aiSummary || ""} ${a.category} ${a.students
          .map((s) => `${s.student.fullName} ${s.student.admissionNumber}`)
          .join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [achievements, q, category, classId, stream, matchesStudent, inDateRange, hasAi]);

  const recentActivity = useMemo(() => {
    const disciplineItems = (records || []).map((r) => ({
      id: `d-${r.id}`,
      date: r.createdAt || r.dateOfOffence,
      icon: offenceIcon(r.offence),
      text: `${r.student.fullName} — ${r.aiSummary || r.offence}`,
      student: r.student,
    }));
    const achievementItems = (achievements || []).map((a) => {
      const first = a.students[0];
      return {
        id: `a-${a.id}`,
        date: a.createdAt || a.achievementDate,
        icon: CATEGORY_META[a.category]?.emoji || "🏆",
        text: `${a.students.map((x) => x.student.fullName.split(" ")[0]).join(", ")} — ${a.aiSummary || a.title}`,
        student: first?.student ?? null,
      };
    });
    return [...disciplineItems, ...achievementItems]
      .sort((x, y) => +new Date(y.date) - +new Date(x.date))
      .slice(0, 6);
  }, [records, achievements]);

  const activeFilters = !!(classId || stream || status || category || dateFrom || dateTo || hasFiles || hasAi);

  function clearFilters() {
    setClassId("");
    setStream("");
    setStatus("");
    setCategory("");
    setDateFrom("");
    setDateTo("");
    setHasFiles(false);
    setHasAi(false);
  }

  function saved() {
    setIncidentModal(null);
    setAchievementModal(null);
    setRefreshKey((k) => k + 1);
  }

  const handleSetTab = useCallback((t: "discipline" | "achievements") => setTab(t), []);

  return (
    <div>
      <PageHeader
        title="Records"
        description="Every student's story — discipline and achievements in one place"
        action={
          <div className="flex flex-wrap gap-2">
            {canManageDiscipline && (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded-md bg-teal text-white hover:bg-teal-dark transition-colors"
                onClick={() => setIncidentModal({})}
              >
                ➕ Record Incident
              </button>
            )}
            {canManageAchievements && (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded-md bg-royal text-white hover:bg-royal-light"
                onClick={() => setAchievementModal({ editing: null })}
              >
                🏆 Add Achievement
              </button>
            )}
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Discipline cases" value={stats.discipline} icon="🚫" loading={loading} />
        <StatCard label="Achievements" value={stats.achievements} icon="🏆" loading={loading} />
        <StatCard label="Active cases" value={stats.activeCases} icon="⏳" loading={loading} />
        <StatCard label="Students with records" value={stats.studentsWithRecords} icon="👥" loading={loading} />
      </div>

      {/* Search + filters */}
      <div className="bg-card border border-line rounded-xl p-3 mb-5 space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate text-sm" aria-hidden>🔍</span>
            <input
              className="w-full rounded-md border border-line bg-white pl-9 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
              placeholder="Search students, admission numbers, incidents, achievements, AI summaries…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search records"
            />
          </div>
          <div className="flex gap-1 border border-line rounded-lg p-1 bg-paper w-fit" role="tablist">
            {canViewDiscipline && (
              <TabBtn t="discipline" label="Discipline" count={filteredRecords.length} activeTab={tab} onSelect={handleSetTab} />
            )}
            {canViewAchievements && (
              <TabBtn t="achievements" label="Achievements" count={filteredAchievements.length} activeTab={tab} onSelect={handleSetTab} />
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={selectClass} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filter by class">
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {streams.length > 0 && (
            <select className={selectClass} value={stream} onChange={(e) => setStream(e.target.value)} aria-label="Filter by stream">
              <option value="">All streams</option>
              {streams.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          {tab === "discipline" ? (
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value="">Any status</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          ) : (
            <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
              <option value="">Any category</option>
              {Object.entries(CATEGORY_META).map(([v, m]) => (
                <option key={v} value={v}>{m.emoji} {m.label}</option>
              ))}
            </select>
          )}
          <input type="date" className={selectClass} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
          <span className="text-xs text-slate">to</span>
          <input type="date" className={selectClass} value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
          {tab === "discipline" && (
            <label className="flex items-center gap-1.5 text-xs text-slate cursor-pointer">
              <input type="checkbox" checked={hasFiles} onChange={(e) => setHasFiles(e.target.checked)} />
              Has attachments
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs text-slate cursor-pointer">
            <input type="checkbox" checked={hasAi} onChange={(e) => setHasAi(e.target.checked)} />
            Has AI summary
          </label>
          {activeFilters && (
            <button type="button" className="text-xs text-royal hover:underline ml-auto" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-5 items-start">
        {/* Main list */}
        <div>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : tab === "discipline" ? (
            filteredRecords.length === 0 ? (
              <EmptyBlock
                emoji="🕊️"
                text={q || activeFilters ? "No discipline records match your search." : "No discipline records yet."}
                action={
                  canManageDiscipline && !q && !activeFilters
                    ? { label: "Record First Incident", onClick: () => setIncidentModal({}) }
                    : undefined
                }
              />
            ) : (
              <ul className="space-y-2.5">
                {filteredRecords.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="w-full text-left bg-card border border-line rounded-xl px-4 py-3 hover:border-royal/40 hover:shadow-sm transition-all flex items-start gap-3"
                      onClick={() => setWorkspaceStudent(r.student)}
                    >
                      <span className="text-lg mt-0.5" aria-hidden>{offenceIcon(r.offence + " " + (r.aiSummary || ""))}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-ink">{r.offence}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] || ""}`}>
                            {STATUS_LABELS[r.status] || r.status}
                          </span>
                          {r._count.files > 0 && <span className="text-xs text-slate">📎 {r._count.files}</span>}
                        </span>
                        {r.aiSummary && <span className="block text-xs text-royal mt-0.5">✨ {r.aiSummary}</span>}
                        <span className="flex items-center gap-1.5 mt-1.5">
                          <Avatar name={r.student.fullName} size="sm" />
                          <span className="text-xs text-ink">{r.student.fullName}</span>
                          <span className="text-xs text-slate font-mono">{r.student.admissionNumber}</span>
                          {r.student.schoolClass && <span className="text-xs text-slate">· {r.student.schoolClass.name}</span>}
                        </span>
                      </span>
                      <span className="text-xs text-slate shrink-0">{fmtDate(r.dateOfOffence)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : filteredAchievements.length === 0 ? (
            <EmptyBlock
              emoji="🏆"
              text={q || activeFilters ? "No achievements match your search." : "No achievements recorded yet."}
              action={
                canManageAchievements && !q && !activeFilters
                  ? { label: "Add First Achievement", onClick: () => setAchievementModal({ editing: null }) }
                  : undefined
              }
            />
          ) : (
            <ul className="grid sm:grid-cols-2 gap-3">
              {filteredAchievements.map((a) => {
                const meta = CATEGORY_META[a.category] || CATEGORY_META.OTHER;
                return (
                  <li key={a.id} className="bg-card border border-line rounded-xl p-4 hover:shadow-sm transition-shadow flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${meta.chip}`}>
                        {meta.emoji} {meta.label}
                      </span>
                      {canManageAchievements && (
                        <button
                          type="button"
                          className="text-xs text-royal hover:underline shrink-0"
                          onClick={() => setAchievementModal({ editing: a })}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    <p className="text-sm font-medium text-ink mt-2">{a.title}</p>
                    {a.aiSummary && <p className="text-xs text-royal mt-1">✨ {a.aiSummary}</p>}
                    <p className="text-xs text-slate mt-1">
                      {fmtDate(a.achievementDate)}
                      {a.awardLevel ? ` · ${a.awardLevel}` : ""}
                      {a.recordedBy ? ` · ${a.recordedBy.email}` : ""}
                    </p>
                    <div className="flex items-center gap-1 mt-auto pt-2.5 flex-wrap">
                      {a.students.slice(0, 5).map((s) => (
                        <button
                          key={s.student.id}
                          type="button"
                          title={s.student.fullName}
                          className="rounded-full hover:ring-2 hover:ring-royal/30"
                          onClick={() => setWorkspaceStudent(s.student)}
                        >
                          <Avatar name={s.student.fullName} size="sm" />
                        </button>
                      ))}
                      {a.students.length > 5 && (
                        <span className="text-xs text-slate">+{a.students.length - 5}</span>
                      )}
                      <span className="text-xs text-slate ml-1">
                        {a.students.length} student{a.students.length > 1 ? "s" : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Recent activity */}
        <aside className="bg-card border border-line rounded-xl p-4 hidden lg:block">
          <h2 className="text-sm font-medium text-ink mb-3">Recent activity</h2>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <p className="text-xs text-slate">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {recentActivity.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full text-left flex items-start gap-2 hover:bg-paper rounded-md px-1.5 py-1 transition-colors"
                    onClick={() => setWorkspaceStudent(item.student)}
                  >
                    <span className="text-sm" aria-hidden>{item.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-xs text-ink truncate">{item.text}</span>
                      <span className="block text-[11px] text-slate">{fmtDate(item.date)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* Workspace + modals */}
      {workspaceStudent && (
        <StudentWorkspace
          student={workspaceStudent}
          canManageDiscipline={canManageDiscipline}
          canManageAchievements={canManageAchievements}
          caseHrefBase={caseHrefBase}
          refreshKey={refreshKey}
          onClose={() => setWorkspaceStudent(null)}
          onRecordIncident={() => setIncidentModal({ studentId: workspaceStudent.id })}
          onAddAchievement={() => setAchievementModal({ editing: null, studentIds: [workspaceStudent.id] })}
        />
      )}
      {incidentModal && (
        <QuickIncidentModal
          students={students}
          initialStudentId={incidentModal.studentId}
          onClose={() => setIncidentModal(null)}
          onSaved={saved}
        />
      )}
      {achievementModal && (
        <AchievementModal
          students={students}
          editing={achievementModal.editing}
          initialStudentIds={achievementModal.studentIds}
          onClose={() => setAchievementModal(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}

function EmptyBlock({ emoji, text, action }: { emoji: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card px-4 py-14 text-center">
      <p className="text-4xl mb-2" aria-hidden>{emoji}</p>
      <p className="text-sm text-slate">{text}</p>
      {action && (
        <button type="button" className="mt-4 text-sm px-4 py-2 rounded-md bg-teal text-white hover:bg-teal-dark transition-colors" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
