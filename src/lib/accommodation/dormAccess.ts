import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SchoolUser } from "@/lib/auth";
import {
  getEffectivePermissions,
  requireSchoolPermission,
  requireSchoolRoleForModule,
} from "@/lib/permissions";

/**
 * Who may change a dormitory's layout (cubicles, beds):
 *
 *  • The Principal, and anyone whose roles carry ACCOMMODATION manage — the
 *    matron, or whatever the school calls that role — for every dorm.
 *  • A dorm master — the teacher set as boardingMaster on a dorm, who gets
 *    ACCOMMODATION edit from that assignment — for that dorm only.
 *
 * Everyone else (including every other teacher) can only view.
 */
export async function requireDormEditor(dormId: string): Promise<SchoolUser | null> {
  const manager =
    (await requireSchoolRoleForModule("ACCOMMODATION", "PRINCIPAL")) ??
    (await requireSchoolPermission("ACCOMMODATION", "manage"));
  if (manager) return manager;

  const editor = await requireSchoolPermission("ACCOMMODATION", "edit");
  if (!editor) return null;

  return (await isBoardingMasterOf(editor, dormId)) ? editor : null;
}

/**
 * Page-side twin of requireDormEditor, for deciding whether to render the
 * editable or the read-only dorm screen. The API routes stay the authority.
 */
export async function canEditDorm(user: User, dormId: string): Promise<boolean> {
  if (!user.schoolId) return false;
  if (user.role === "PRINCIPAL") return true;

  const acc = (await getEffectivePermissions(user)).ACCOMMODATION;
  if (acc?.canManage) return true;
  if (!acc?.canEdit) return false;

  return isBoardingMasterOf(user, dormId);
}

async function isBoardingMasterOf(user: User, dormId: string): Promise<boolean> {
  const dorm = await prisma.dormitory.findFirst({
    where: { id: dormId, schoolId: user.schoolId!, boardingMaster: { userId: user.id } },
    select: { id: true },
  });
  return dorm !== null;
}
