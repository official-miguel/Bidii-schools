import { redirect } from "next/navigation";
import { requireStaffAccommodationAccess } from "../../access";

/**
 * Old "Allocate bed" entry point. Managers go to the allocations screen;
 * view-only staff to the dorm overview (teachers to theirs).
 */
export default async function StaffAccommodationAllocatePage() {
  const { canManageAll } = await requireStaffAccommodationAccess("/teacher/accommodation-details");
  redirect(canManageAll ? "/staff/accommodation/allocations" : "/staff/accommodation");
}
