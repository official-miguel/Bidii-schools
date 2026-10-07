import DormManagementScreen from "@/app/principal/accommodation/(module)/management/page";
import { requireStaffAccommodationManager } from "../../access";

export const metadata = { title: "Dorm Operations — Accommodation" };

/** Accommodation management for staff holding ACCOMMODATION manage (shared with the principal portal). */
export default async function StaffAccommodationDormManagementPage() {
  await requireStaffAccommodationManager();
  return <DormManagementScreen />;
}
