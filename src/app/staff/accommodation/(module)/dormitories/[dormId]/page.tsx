import EditableDormDetail from "@/app/principal/accommodation/(module)/dormitories/[dormId]/page";
import ReadOnlyDormDetail from "@/components/accommodation/ReadOnlyDormDetail";
import { canEditDorm } from "@/lib/accommodation/dormAccess";
import { requireStaffAccommodationAccess } from "../../../access";

export const metadata = { title: "Dormitory — Accommodation" };

/**
 * Managers, and the dorm master of this dorm, get the editable dorm screen;
 * everyone else with access can only view it. The write APIs apply the same
 * rule through requireDormEditor.
 */
export default async function StaffDormDetailPage({ params }: { params: { dormId: string } }) {
  const { user } = await requireStaffAccommodationAccess(
    `/teacher/accommodation-details/dormitories/${encodeURIComponent(params.dormId)}`
  );
  return (await canEditDorm(user, params.dormId)) ? <EditableDormDetail /> : <ReadOnlyDormDetail />;
}
