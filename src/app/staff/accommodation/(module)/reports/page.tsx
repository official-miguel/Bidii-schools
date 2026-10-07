import AccommodationReportsScreen from "@/app/principal/accommodation/(module)/reports/page";
import { requireStaffAccommodationManager } from "../../access";

export const metadata = { title: "Reports — Accommodation" };

/** Accommodation reports for staff holding ACCOMMODATION manage (shared with the principal portal). */
export default async function StaffAccommodationReportsPage() {
  await requireStaffAccommodationManager();
  return <AccommodationReportsScreen />;
}
