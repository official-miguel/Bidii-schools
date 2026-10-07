import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canEditDorm } from "@/lib/accommodation/dormAccess";
import EditableDormDetail from "@/app/principal/accommodation/(module)/dormitories/[dormId]/page";
import ReadOnlyDormDetail from "@/components/accommodation/ReadOnlyDormDetail";

export const metadata = { title: "Dormitory — Teacher Portal" };

/**
 * The dorm master of this dorm (and any teacher holding ACCOMMODATION manage)
 * gets the editable dorm screen; every other teacher can only view it. The
 * write APIs apply the same rule through requireDormEditor.
 */
export default async function TeacherDormDetailPage({ params }: { params: { dormId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (await canEditDorm(user, params.dormId)) ? <EditableDormDetail /> : <ReadOnlyDormDetail />;
}
