import StaffWorkspace from "@/components/staff/StaffWorkspace";

/**
 * /principal/staff — the staff register and role editor.
 *
 * The screen itself now lives in StaffWorkspace so the staff portal can render
 * the same one for anyone granted the STAFF module. Roles & Permissions stays
 * on here and nowhere else. The Principal layout already guards this route.
 */
export default function PrincipalStaffPage() {
  return <StaffWorkspace />;
}
