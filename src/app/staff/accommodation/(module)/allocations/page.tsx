import AllocationsScreen from "@/app/principal/accommodation/(module)/allocations/page";
import { requireStaffAccommodationManager } from "../../access";

export const metadata = { title: "Allocations — Accommodation" };

/** Accommodation allocations for staff holding ACCOMMODATION manage (shared with the principal portal). */
export default async function StaffAccommodationAllocationsPage() {
  await requireStaffAccommodationManager();
  return <AllocationsScreen />;
}
