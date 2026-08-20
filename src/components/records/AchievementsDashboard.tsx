"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trophy, Plus, Filter, X, Users, Star, BookOpen, Search } from "lucide-react";
import StudentWorkspace from "./StudentWorkspace";
import AchievementModal from "./AchievementModal";
import { fetchAllStudents } from "@/lib/utils/fetchAllStudents";
import {
  Avatar,
  Achievement,
  StudentLite,
  CATEGORY_META,
  Skeleton,
  StatCard,
  fmtDate,
} from "./shared";

type ClassLite = { id: string; name: string; form: number; stream?: string | null };

const selectClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function EmptyBlock({
  text,
  action,
}: {
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card px-4 py-16 text-center">
      <Trophy className="h-10 w-10 text-slate/30 mx-auto mb-3" aria-hidden />
      <p className="text-sm text-slate">{text}</p>
      {action && (
        <button
          type="button"
          className="mt-4 text-sm px-4 py-2 rounded-lg bg-royal text-white hover:bg-royal-light transition-colors"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ── Achievement card ────────────────────────────────────────────────────── */
function AchievementCard({
  achievement,
  canManage,
  onViewStudent,
  onEdit,
}: {
  achievement: Achievement;
  canManage: boolean;
  onViewStudent: (s: StudentLite) => void;
  onEdit: (a: Achievement) => void;
}) {
  const meta = CATEGORY_META[achievement.category] ?? CATEGORY_META.OTHER;
  return (
    <li className="bg-card border border-line rounded-xl p-4 hover:shadow-sm hover:border-teal/20 transition-all flex flex-col gap-3">
      {/* Category + edit */}
      <div className="flex items-start justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${meta.chip}`}
        >
          <span aria-hidden>{meta.emoji}</span>
          {meta.label}
        </span>
        {canManage && (
          <button
            type="button"
            className="text-xs text-royal hover:underline shrink-0 transition-colors"
            onClick={() => onEdit(achievement)}
          >
            Edit
          </button>
        )}
      </div>

      {/* Title */}
      <div>
        <p className="text-sm font-semibold text-ink leading-snug">{achievement.title}</p>
        {achievement.aiSummary && (
          <p className="text-xs text-royal mt-1">✨ {achievement.aiSummary}</p>
        )}
        {achievement.description && !achievement.aiSummary && (
          <p className="text-xs text-slate mt-1 line-clamp-2">{achievement.description}</p>
        )}
      </div>

      {/* Date + award */}
      <p className="text-xs text-slate -mt-1">
        {fmtDate(achievement.achievementDate)}
        {achievement.awardLevel ? ` · ${achievement.awardLevel}` : ""}
        {achievement.recordedBy ? ` · ${achievement.recordedBy.email}` : ""}
      </p>

      {/* Students */}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5 mt-auto border-t border-line/50">
        {achievement.students.slice(0, 6).map((s) => (
          <button
            key={s.student.id}
            type="button"
            title={s.student.fullName}
            className="rounded-full hover:ring-2 hover:ring-royal/30 transition-shadow"
            onClick={() => onViewStudent(s.student)}
          >
            <Avatar name={s.student.fullName} size="sm" />
          </button>
        ))}
        {achievement.students.length > 6 && (
          <span className="text-xs text-slate">+{achievement.students.length - 6}</span>
        )}
        <span className="text-xs text-slate ml-auto">
          {achievement.students.length} student{achievement.students.length !== 1 ? "s" : ""}
        </span>
      </div>
    </li>
  );
}

/* ── Main export ─────────────────────────────────────────────────────────── */
export default function AchievementsDashboard({ canManage }: { canManage: boolean }) {
  const [achievements, setAchievements] = useState<Achievement[] | null>(null);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [classes, setClasses] = useState<ClassLite[]>([]);

  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim().toLowerCase(), 250);
  const [classId, setClassId] = useState("");
  const [stream, setStream] = useState("");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hasAi, setHasAi] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [workspaceStudent, setWorkspaceStudent] = useState<StudentLite | null>(null);
  const [achievementModal, setAchievementModal] = useState<{
    editing: Achievement | null;
    studentIds?: string[];
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    await Promise.all([
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
      fetch("/api/achievements").then(async (r) => {
        setAchievements(r.ok ? await r.json() : []);
      }),
    ]);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const loading = achievements === null;

  const streams = useMemo(() => {
    const set = new Set<string>();
    classes.forEach((c) => c.stream && set.add(c.stream));
    return [...set].sort();
  }, [classes]);

  /* Category breakdown for sidebar */
  const categoryBreakdown = useMemo(() => {
    return Object.keys(CATEGORY_META).map((cat) => ({
      key: cat,
      count: achievements?.filter((a) => a.category === cat).length ?? 0,
    }));
  }, [achievements]);

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

  const filtered = useMemo(() => {
    if (!achievements) return [];
    return achievements.filter((a) => {
      if ((classId || stream) && !a.students.some((s) => matchesStudent(s.student)))
        return false;
      if (category && a.category !== category) return false;
      if (!inDateRange(a.achievementDate)) return false;
      if (hasAi && !a.aiSummary) return false;
      if (q) {
        const hay =
          `${a.title} ${a.description || ""} ${a.aiSummary || ""} ${a.category} ${a.students
            .map((s) => `${s.student.fullName} ${s.student.admissionNumber}`)
            .join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [achievements, q, category, classId, stream, matchesStudent, inDateRange, hasAi]);

  const activeFilters = !!(classId || stream || category || dateFrom || dateTo || hasAi);

  function clearFilters() {
    setClassId("");
    setStream("");
    setCategory("");
    setDateFrom("");
    setDateTo("");
    setHasAi(false);
  }

  function saved() {
    setAchievementModal(null);
    setRefreshKey((k) => k + 1);
  }

  const handleViewStudent = useCallback((s: StudentLite) => setWorkspaceStudent(s), []);
  const handleEdit = useCallback((a: Achievement) => setAchievementModal({ editing: a }), []);

  /* Category count totals */
  const totalStudents = useMemo(() => {
    const ids = new Set<string>();
    achievements?.forEach((a) => a.students.forEach((s) => ids.add(s.student.id)));
    return ids.size;
  }, [achievements]);

  return (
    <div>
      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total achievements"
          value={achievements?.length ?? 0}
          icon={<Trophy className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          label="Students recognised"
          value={totalStudents}
          icon={<Users className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          label="Sports"
          value={categoryBreakdown.find((c) => c.key === "SPORTS")?.count ?? 0}
          icon={<Star className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          label="Academics"
          value={categoryBreakdown.find((c) => c.key === "ACADEMICS")?.count ?? 0}
          icon={<BookOpen className="h-5 w-5" />}
          loading={loading}
        />
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="bg-card border border-line rounded-xl p-3 mb-5 space-y-3">
        <div className="flex gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" aria-hidden />
            <input
              className="w-full rounded-lg border border-line bg-white pl-9 pr-3 py-2 text-sm text-ink placeholder:text-slate focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
              placeholder="Search by student, achievement title, category, or AI summary…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search achievements"
            />
          </div>

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              showFilters || activeFilters
                ? "border-teal bg-teal/5 text-teal"
                : "border-line text-slate hover:text-ink hover:border-slate/40"
            }`}
          >
            <Filter className="h-4 w-4" aria-hidden />
            Filters
            {activeFilters && (
              <span className="ml-0.5 h-4 w-4 rounded-full bg-teal text-white text-[9px] font-bold flex items-center justify-center">
                !
              </span>
            )}
          </button>

          {/* Add achievement */}
          {canManage && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-royal text-white text-sm font-medium hover:bg-royal-light transition-colors shrink-0"
              onClick={() => setAchievementModal({ editing: null })}
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Add Achievement</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}
        </div>

        {/* Expandable filter row */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/60">
            <select
              className={selectClass}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              aria-label="Filter by class"
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {streams.length > 0 && (
              <select
                className={selectClass}
                value={stream}
                onChange={(e) => setStream(e.target.value)}
                aria-label="Filter by stream"
              >
                <option value="">All streams</option>
                {streams.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}

            <select
              className={selectClass}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="">Any category</option>
              {Object.entries(CATEGORY_META).map(([v, m]) => (
                <option key={v} value={v}>
                  {m.emoji} {m.label}
                </option>
              ))}
            </select>

            <input
              type="date"
              className={selectClass}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
            />
            <span className="text-xs text-slate">to</span>
            <input
              type="date"
              className={selectClass}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
            />

            <label className="flex items-center gap-1.5 text-xs text-slate cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasAi}
                onChange={(e) => setHasAi(e.target.checked)}
              />
              Has AI summary
            </label>

            {activeFilters && (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-xs text-royal hover:underline"
                onClick={clearFilters}
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Result count */}
      {!loading && (
        <p className="text-xs text-slate mb-3 px-0.5">
          {filtered.length === 0
            ? "No achievements"
            : `${filtered.length} achievement${filtered.length !== 1 ? "s" : ""}`}
          {activeFilters || q ? " matching current filters" : ""}
        </p>
      )}

      {/* ── Grid + sidebar ───────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-[1fr_264px] gap-5 items-start">
        <div>
          {loading ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-44 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyBlock
              text={
                q || activeFilters
                  ? "No achievements match your search or filters."
                  : "No achievements recorded yet."
              }
              action={
                canManage && !q && !activeFilters
                  ? {
                      label: "Add First Achievement",
                      onClick: () => setAchievementModal({ editing: null }),
                    }
                  : undefined
              }
            />
          ) : (
            <ul className="grid sm:grid-cols-2 gap-3">
              {filtered.map((a) => (
                <AchievementCard
                  key={a.id}
                  achievement={a}
                  canManage={canManage}
                  onViewStudent={handleViewStudent}
                  onEdit={handleEdit}
                />
              ))}
            </ul>
          )}
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="hidden lg:block space-y-4">
          {/* Category breakdown */}
          <div className="bg-card border border-line rounded-xl p-4">
            <h2 className="text-sm font-semibold text-ink mb-3">By category</h2>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {categoryBreakdown
                  .filter((c) => c.count > 0 || category === c.key)
                  .map(({ key, count }) => {
                    const meta = CATEGORY_META[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                          category === key
                            ? "bg-teal/10 text-teal font-medium"
                            : "text-slate hover:bg-paper"
                        }`}
                        onClick={() => setCategory((c) => (c === key ? "" : key))}
                        aria-pressed={category === key}
                      >
                        <span className="flex items-center gap-2">
                          <span aria-hidden>{meta.emoji}</span>
                          {meta.label}
                        </span>
                        <span className="font-semibold text-ink">{count}</span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Student workspace drawer ─────────────────────────────────────── */}
      {workspaceStudent && (
        <StudentWorkspace
          student={workspaceStudent}
          canManageDiscipline={false}
          canManageAchievements={canManage}
          refreshKey={refreshKey}
          onClose={() => setWorkspaceStudent(null)}
          onRecordIncident={() => {}}
          onAddAchievement={() =>
            setAchievementModal({ editing: null, studentIds: [workspaceStudent.id] })
          }
        />
      )}

      {/* ── Achievement modal ────────────────────────────────────────────── */}
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
