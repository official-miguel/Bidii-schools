import AccommodationOverviewScreen from "@/app/principal/accommodation/(module)/overview/page";
import { requireStaffAccommodationManager } from "../../access";

export const metadata = { title: "Overview — Accommodation" };

/** Accommodation overview for staff holding ACCOMMODATION manage (shared with the principal portal). */
export default async function StaffAccommodationOverviewPage() {
  await requireStaffAccommodationManager();
  return <AccommodationOverviewScreen />;
}
