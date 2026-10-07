import AccommodationSettingsScreen from "@/app/principal/accommodation/(module)/settings/page";
import { requireStaffAccommodationManager } from "../../access";

export const metadata = { title: "Settings — Accommodation" };

/** Accommodation settings for staff holding ACCOMMODATION manage (shared with the principal portal). */
export default async function StaffAccommodationSettingsPage() {
  await requireStaffAccommodationManager();
  return <AccommodationSettingsScreen />;
}
