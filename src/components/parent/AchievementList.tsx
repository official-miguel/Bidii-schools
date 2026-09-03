/**
 * AchievementList — renders parent-visible achievement cards.
 * Each card shows title, category badge, date, award level, and description.
 * Gold/yellow accent styling per design spec.
 *
 * Requirements: 8.3
 */

export interface AchievementItem {
  id: string;
  title: string;
  category: string;
  description: string | null;
  achievementDate: string | Date;
  awardLevel: string | null;
}

interface AchievementListProps {
  achievements: AchievementItem[];
}

const CATEGORY_LABEL: Record<string, string> = {
  SPORTS:          "Sports",
  LEADERSHIP:      "Leadership",
  MUSIC_FESTIVAL:  "Music Festival",
  ACADEMICS:       "Academics",
  INNOVATION:      "Innovation",
  OTHER:           "Other",
};

function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function AchievementList({ achievements }: AchievementListProps) {
  if (achievements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">🏆</div>
        <p className="text-base font-semibold text-ink dark:text-dark-text">No achievements yet.</p>
        <p className="text-sm text-slate dark:text-dark-muted mt-1 max-w-xs">
          Achievements and recognition will appear here once recorded by the school.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {achievements.map((item) => (
        <div
          key={item.id}
          className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 shadow-xs
                     dark:bg-yellow-900/20 dark:border-yellow-700/30"
        >
          <div className="flex items-start justify-between gap-3">
            {/* Icon + title */}
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 shrink-0 text-xl leading-none">🏆</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink dark:text-dark-text truncate">
                  {item.title}
                </p>
                {item.awardLevel && (
                  <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5 font-medium">
                    {item.awardLevel}
                  </p>
                )}
                {item.description && (
                  <p className="text-sm text-slate dark:text-dark-muted mt-1 line-clamp-2">
                    {item.description}
                  </p>
                )}
              </div>
            </div>

            {/* Category badge */}
            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                             bg-yellow-100 text-yellow-800 dark:bg-yellow-800/40 dark:text-yellow-300">
              {CATEGORY_LABEL[item.category] ?? item.category}
            </span>
          </div>

          {/* Date footer */}
          <p className="mt-3 text-xs text-slate dark:text-dark-muted">
            {formatDate(item.achievementDate)}
          </p>
        </div>
      ))}
    </div>
  );
}
