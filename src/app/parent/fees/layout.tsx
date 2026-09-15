import { redirect } from "next/navigation";
import { requireParent } from "@/lib/parentAuth";
import { assertModuleEnabled } from "@/lib/moduleAccess";

/**
 * Module gate for the parent fees section.
 *
 * Finance is one of the three optional modules a super admin can switch off
 * per school. When the child's school has it off, the parent gets the 404
 * page rather than an empty or error-filled fees screen — the section simply
 * is not part of their portal.
 *
 * The school is read from the Parent record rather than the session user, so
 * the gate holds regardless of how the parent account was provisioned.
 */
export default async function ParentFeesLayout({ children }: { children: React.ReactNode }) {
  const parent = await requireParent();
  if (!parent) redirect("/login");

  await assertModuleEnabled(parent.schoolId, "FEES");

  return <>{children}</>;
}
