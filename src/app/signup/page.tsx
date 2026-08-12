/**
 * /signup — removed.
 *
 * Schools are no longer self-service. All new school accounts are created
 * by the Super Admin via /super-admin/schools/new.
 *
 * Any direct navigation here is permanently redirected to /login.
 */

import { redirect } from "next/navigation";

export default function SignupPage() {
  redirect("/login");
}
