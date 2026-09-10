import { ShieldAlert, Trophy } from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";

export default function TeacherRecordsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-1">Student Records</h1>
      <p className="text-slate text-sm mb-5">
        Discipline records and student achievements.
      </p>
      <div className="border-b border-border mb-6">
        <ContextNavigation
          items={[
            {
              href: "/teacher/records/discipline",
              label: "Discipline",
              icon: <ShieldAlert className="h-4 w-4" aria-hidden />,
            },
            {
              href: "/teacher/records/achievements",
              label: "Achievements",
              icon: <Trophy className="h-4 w-4" aria-hidden />,
            },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
