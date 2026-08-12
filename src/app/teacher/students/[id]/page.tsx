import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import StudentProfile from "@/components/students/StudentProfile";

export default async function TeacherStudentProfilePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "TEACHER") redirect("/login");

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!student) notFound();

  return (
    <StudentProfile
      studentId={student.id}
      role="teacher"
    />
  );
}
