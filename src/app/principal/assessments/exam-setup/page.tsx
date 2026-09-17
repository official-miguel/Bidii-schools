import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ExamSetupTabs from "./ExamSetupTabs";

export default async function ExamSetupPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PRINCIPAL") redirect("/login");

  return (
    <div>
      <PageHeader
        title="Period Setup"
        description="Configure assessment frameworks, periods, and grading weights — everything the system needs before marks can be entered."
      />
      <ExamSetupTabs />
    </div>
  );
}
