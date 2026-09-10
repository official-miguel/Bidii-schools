"use client";

import { useEffect, useState } from "react";

interface Achievement {
  id: string;
  title: string;
  category: string;
  description: string | null;
  achievementDate: string;
  awardLevel: string | null;
  aiSummary: string | null;
  recordedBy: { email: string } | null;
  students: Array<{
    student: {
      id: string;
      fullName: string;
      admissionNumber: string;
    };
  }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  SPORTS: "Sports",
  LEADERSHIP: "Leadership",
  MUSIC_FESTIVAL: "Music Festival",
  ACADEMICS: "Academics",
  INNOVATION: "Innovation",
  OTHER: "Other",
};

export default function StudentAchievements({ studentId }: { studentId: string }) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/achievements?studentId=${studentId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError("Failed to load achievements");
          setLoading(false);
          return;
        }
        const data: Achievement[] = await res.json();
        if (!cancelled) {
          setAchievements(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load achievements");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (loading) return <p className="text-sm text-slate">Loading achievements...</p>;

  if (achievements.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate">No achievements recorded for this student yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-semibold text-foreground mb-3">
        Student Achievements
      </h3>
      <div className="space-y-3">
        {achievements.map((achievement) => (
          <div key={achievement.id} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-foreground font-medium">{achievement.title}</p>
                <p className="text-xs text-slate mt-0.5">
                  {CATEGORY_LABELS[achievement.category] || achievement.category} • 
                  {new Date(achievement.achievementDate).toLocaleDateString()}
                  {achievement.awardLevel ? ` • ${achievement.awardLevel}` : ""}
                </p>
                {achievement.aiSummary && (
                  <p className="text-xs text-royal mt-1">AI: {achievement.aiSummary}</p>
                )}
                {achievement.description && (
                  <p className="text-sm text-slate mt-1">{achievement.description}</p>
                )}
                <p className="text-xs text-slate mt-2">
                  <span className="font-medium">Awarded by:</span> 
                  {achievement.recordedBy?.email || "System"}
                </p>
                <p className="text-xs text-slate mt-1">
                  <span className="font-medium">Shared with:</span> 
                  {achievement.students
                    .map((s) => s.student.fullName)
                    .join(", ")}
                </p>
              </div>
              <div className="text-right text-xs">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  achievement.category === "SPORTS"
                    ? "bg-success-bg text-success"
                    : achievement.category === "ACADEMICS"
                    ? "bg-emerald-50 text-emerald-700"
                    : achievement.category === "LEADERSHIP"
                    ? "bg-royal-50 text-royal"
                    : achievement.category === "MUSIC_FESTIVAL"
                    ? "bg-warn-bg text-warn"
                    : achievement.category === "INNOVATION"
                    ? "bg-purple-50 text-purple"
                    : "bg-slate-50 text-slate"
                }`}>
                  {CATEGORY_LABELS[achievement.category] || achievement.category}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}