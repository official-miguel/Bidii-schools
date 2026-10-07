import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * /results — legacy root route.
 * Print routes have moved to /assessments/report-card/print.
 * Redirect users to their dashboard.
 */
export default async function ResultsRootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  switch (user.role) {
    case "PRINCIPAL":
      redirect("/principal/assessments/report-cards");
    case "TEACHER":
      redirect("/teacher/assessments/report-cards");
    default:
      redirect("/");
  }
}
