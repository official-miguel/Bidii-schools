import DormitoriesScreen from "@/app/principal/accommodation/(module)/dormitories/page";
import { requireStaffAccommodationManager } from "../../access";

export const metadata = { title: "Dormitories — Accommodation" };

/** Accommodation dormitories for staff holding ACCOMMODATION manage (shared with the principal portal). */
export default async function StaffAccommodationDormitoriesPage() {
  await requireStaffAccommodationManager();
  return <DormitoriesScreen />;
}
