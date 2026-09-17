"use client";

/**
 * MustChangePasswordGate
 *
 * Thin client wrapper inserted into server layouts.
 * When mustChangePassword is true it renders ForcePasswordChangeModal
 * on top of all children — the children are still mounted (SSR'd) but
 * pointer-events and interaction are blocked by the modal overlay.
 */

import { ReactNode } from "react";
import ForcePasswordChangeModal from "./ForcePasswordChangeModal";

interface Props {
  mustChangePassword: boolean;
  /** Which initial password the user signed in with — changes the modal copy. */
  initialPassword?: "school-username" | "admission-number";
  children: ReactNode;
}

export default function MustChangePasswordGate({
  mustChangePassword,
  initialPassword = "school-username",
  children,
}: Props) {
  return (
    <>
      {children}
      <ForcePasswordChangeModal mustChange={mustChangePassword} initialPassword={initialPassword} />
    </>
  );
}
