import { ShieldAlert, Trophy } from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";

export default function RecordsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {/* Sub-module tab strip */}
      <div className="border-b border-border mb-6">
        <ContextNavigation
          items={[
            {
              href: "/principal/records/discipline",
              label: "Discipline",
              icon: <ShieldAlert className="h-4 w-4" aria-hidden />,
            },
            {
              href: "/principal/records/achievements",
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
