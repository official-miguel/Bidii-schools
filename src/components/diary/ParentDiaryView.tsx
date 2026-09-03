"use client";

import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import StudentDiaryView from "./StudentDiaryView";

type StudentInfo = {
  id:          string;
  fullName:    string;
  classId:     string;
  schoolClass: { name: string };
};

interface ParentDiaryViewProps {
  students:      StudentInfo[];
  parentUserId:  string;
  schoolId:      string;
}

type ParentApiResponse = {
  students:        StudentInfo[];
  entries:         Parameters<typeof StudentDiaryView>[0]["entries"];
  activeStudentId: string;
};

export default function ParentDiaryView({ students, parentUserId, schoolId }: ParentDiaryViewProps) {
  const [activeStudentId, setActiveStudentId] = useState(students[0]?.id ?? "");
  const [entries, setEntries] = useState<Parameters<typeof StudentDiaryView>[0]["entries"]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeStudentId) return;
    setLoading(true);
    fetch(`/api/diary/parent?studentId=${activeStudentId}`)
      .then((r) => r.json())
      .then((data: ParentApiResponse) => setEntries(data.entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [activeStudentId]);

  const activeStudent = students.find((s) => s.id === activeStudentId);

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-teal/10 flex items-center justify-center mb-3">
          <BookOpen className="h-7 w-7 text-teal" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-ink dark:text-dark-text">No diary updates yet</p>
        <p className="text-xs text-slate dark:text-dark-muted mt-1">
          New assignments and subject updates will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Child switcher (when multiple children) */}
      {students.length > 1 && (
        <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Select child">
          {students.map((student) => {
            const isActive = student.id === activeStudentId;
            return (
              <button
                key={student.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveStudentId(student.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-left transition-all min-h-[52px]
                  ${isActive
                    ? "border-teal/50 bg-teal/5 dark:bg-teal/10"
                    : "border-line text-slate hover:border-teal/40 hover:bg-teal/5 dark:border-dark-border dark:text-dark-muted dark:hover:border-teal/30"
                  }`}
              >
                <div
                  className="w-8 h-8 rounded-full bg-teal/10 text-teal text-xs font-semibold flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  {student.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className={`text-sm font-medium leading-none ${isActive ? "text-teal" : ""}`}>
                    {student.fullName.split(" ")[0]}
                  </p>
                  <p className="text-xs text-slate dark:text-dark-muted mt-0.5 leading-none">
                    {student.schoolClass.name}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Active child header (single child) */}
      {students.length === 1 && activeStudent && (
        <div className="flex items-center gap-3 p-4 bg-teal/5 dark:bg-teal/10 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-teal/20 text-teal text-sm font-semibold flex items-center justify-center shrink-0" aria-hidden="true">
            {activeStudent.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink dark:text-dark-text">{activeStudent.fullName}</p>
            <p className="text-xs text-slate dark:text-dark-muted">{activeStudent.schoolClass.name}</p>
          </div>
        </div>
      )}

      {/* Entries */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-line dark:bg-dark-border rounded-xl animate-shimmer" />
          ))}
        </div>
      ) : (
        <StudentDiaryView entries={entries} />
      )}
    </div>
  );
}
