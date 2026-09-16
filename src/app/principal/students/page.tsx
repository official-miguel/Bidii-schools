import StudentsWorkspace from "@/components/students/StudentsWorkspace";

/**
 * /principal/students — the student register.
 *
 * The screen itself now lives in StudentsWorkspace so the staff portal can
 * render the same one for anyone granted the STUDENTS module. The Principal
 * layout already guards this route.
 */
export default function PrincipalStudentsPage() {
  return <StudentsWorkspace />;
}
