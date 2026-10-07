import InspectionsScreen from "@/app/principal/accommodation/(module)/inspections/page";
import { requireStaffAccommodationManager } from "../../access";

export const metadata = { title: "Inspections — Accommodation" };

/** Accommodation inspections for staff holding ACCOMMODATION manage (shared with the principal portal). */
export default async function StaffAccommodationInspectionsPage() {
  await requireStaffAccommodationManager();
  return <InspectionsScreen />;
}
