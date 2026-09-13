import { redirect } from "next/navigation";

/**
 * The principal library stats are already shown on the main dashboard overview.
 * This route is no longer needed — redirect back to the dashboard.
 */
export default function PrincipalLibraryPage() {
  redirect("/principal");
}
