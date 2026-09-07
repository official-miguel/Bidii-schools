import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function TeacherOnDutyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-ink dark:text-dark-text mb-2">
        Teacher on Duty
      </h1>
      <p className="text-sm text-slate dark:text-dark-muted">
        Teacher-on-duty roster management is coming soon.
      </p>
    </div>
  );
}
