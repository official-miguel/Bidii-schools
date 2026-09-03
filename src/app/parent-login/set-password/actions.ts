"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type SetPasswordResult = { error: string };

export async function setPassword(
  formData: FormData
): Promise<SetPasswordResult | never> {
  const newPassword     = String(formData.get("newPassword")     ?? "").trim();
  const confirmPassword = String(formData.get("confirmPassword") ?? "").trim();

  // ── Validation ──────────────────────────────────────────────────────────
  if (!newPassword || !confirmPassword) {
    return { error: "Both password fields are required." };
  }

  if (newPassword !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  if (newPassword.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (!/\d/.test(newPassword)) {
    return { error: "Password must contain at least one number." };
  }

  if (!/[a-zA-Z]/.test(newPassword)) {
    return { error: "Password must contain at least one letter." };
  }

  // ── Auth guard ───────────────────────────────────────────────────────────
  const user = await getCurrentUser();

  if (!user || user.role !== "PARENT") {
    return { error: "Unauthorized. Please sign in again." };
  }

  // Already changed — nothing to do, send them to the portal
  if (!user.mustChangePassword) {
    redirect("/parent");
  }

  // ── Persist ──────────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data:  {
      passwordHash,
      mustChangePassword: false,
    },
  });

  redirect("/parent");
}
