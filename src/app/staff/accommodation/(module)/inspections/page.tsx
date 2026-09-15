import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function StaffAccommodationInspectionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-foreground mb-2">
        Dormitory Inspections
      </h1>
      <p className="text-sm text-slate">
        Inspection records management is coming soon.
      </p>
    </div>
  );
}
