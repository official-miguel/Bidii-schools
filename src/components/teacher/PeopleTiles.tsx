"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, UserPlus, X, CheckSquare, Square } from "lucide-react";
import Link from "next/link";

type Tile = {
  id: string;
  title: string;
  subTitle: string;
  classId: string;
  subjectId?: string;
  isClassTeacher: boolean;
  isElective: boolean;
};

type Student = {
  id: string;
  fullName: string;
  admissionNumber: string;
};

export default function PeopleTiles({ tiles }: { tiles: Tile[] }) {
  const [addModal, setAddModal] = useState<Tile | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <div
            key={tile.id}
            className={`relative bg-card border rounded-xl p-5 flex flex-col gap-3 transition-all duration-150
              ${tile.isClassTeacher
                ? "border-teal/30 bg-teal/5"
                : "border-border hover:border-teal/40 hover:shadow-sm"}`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                ${tile.isClassTeacher ? "bg-teal/20 text-teal" : "bg-background text-slate"}`}>
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{tile.title}</p>
                <p className="text-xs text-slate mt-0.5">{tile.subTitle}</p>
                {tile.isClassTeacher && (
                  <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-teal/20 text-teal">
                    Class Teacher
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-auto pt-1">
              <Link
                href={`/teacher/people/${tile.id}?classId=${tile.classId}${tile.subjectId ? `&subjectId=${tile.subjectId}` : ""}${tile.isClassTeacher ? "&isClassTeacher=1" : ""}&title=${encodeURIComponent(tile.title)}&sub=${encodeURIComponent(tile.subTitle)}`}
                className="flex-1 text-center text-xs font-medium px-3 py-2 rounded-lg border border-border
                           text-slate hover:border-teal hover:text-teal transition-colors dark:hover:border-teal dark:hover:text-teal"
              >
                View students
              </Link>
              {tile.isElective && tile.subjectId && (
                <button
                  type="button"
                  onClick={() => setAddModal(tile)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg
                             bg-teal text-white hover:bg-teal/90 transition-colors"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add Students
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {addModal && addModal.subjectId && (
        <AddStudentsModal
          tile={addModal}
          onClose={() => setAddModal(null)}
        />
      )}
    </>
  );
}

function AddStudentsModal({ tile, onClose }: { tile: Tile; onClose: () => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/students/electives?classId=${tile.classId}&subjectId=${tile.subjectId}&unenrolled=1`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Student[]) => setStudents(data))
      .catch(() => setError("Couldn't load students."))
      .finally(() => setLoading(false));
  }, [tile.classId, tile.subjectId]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === students.length ? new Set() : new Set(students.map((s) => s.id))
    );
  }, [students]);

  async function handleSave() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/students/electives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: tile.subjectId,
          studentIds: Array.from(selected),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to enroll students."); return; }
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch {
      setError("Failed to enroll students.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Add Students to Elective</h2>
            <p className="text-xs text-slate mt-0.5 truncate">{tile.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {success ? (
            <p className="text-sm text-success text-center py-4">Students enrolled successfully.</p>
          ) : loading ? (
            <p className="text-sm text-slate text-center py-4">Loading…</p>
          ) : error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-slate text-center py-4">
              All students in this class are already enrolled in this elective.
            </p>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-teal hover:text-teal/80 transition-colors mb-2"
              >
                {selected.size === students.length ? "Deselect all" : "Select all"}
              </button>
              {students.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer
                             hover:border-teal/40 transition-colors"
                >
                  <span className="text-teal shrink-0">
                    {selected.has(s.id)
                      ? <CheckSquare className="h-4 w-4" />
                      : <Square className="h-4 w-4 text-slate" />}
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{s.fullName}</p>
                    <p className="text-xs text-slate font-mono">{s.admissionNumber}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && students.length > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-border">
            <span className="text-xs text-slate">{selected.size} selected</span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-border text-sm text-slate hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={selected.size === 0 || saving}
                className="px-4 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal/90 disabled:opacity-50 transition-colors"
              >
                {saving ? "Enrolling…" : `Enroll${selected.size > 0 ? ` ${selected.size}` : ""}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
