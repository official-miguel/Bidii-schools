import AccommodationAnalyticsScreen from "@/app/principal/accommodation/(module)/analytics/page";
import ReadOnlyAccommodationAnalytics from "@/components/accommodation/ReadOnlyAccommodationAnalytics";
import { requireStaffAccommodationAccess } from "../../access";

export const metadata = { title: "Analytics — Accommodation" };

/** Managers get the module's analytics dashboard; view-only staff the read-only one. */
export default async function StaffAccommodationAnalyticsPage() {
  const { canManageAll } = await requireStaffAccommodationAccess("/teacher/accommodation-details/analytics");
  return canManageAll ? <AccommodationAnalyticsScreen /> : <ReadOnlyAccommodationAnalytics />;
}
