import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import StudentProfile from "@/components/students/StudentProfile";

export default async function StaffStudentProfilePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const perms = await getEffectivePermissions(user);
  if (!perms.STUDENTS?.canView) redirect("/staff");

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!student) notFound();

  return (
    <StudentProfile
      studentId={student.id}
      role="staff"
    />
  );
}
