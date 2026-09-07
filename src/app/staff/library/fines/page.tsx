import { redirect } from "next/navigation";
export default function LibraryFinesPage() {
  redirect("/staff/library/cards?hasFine=true");
}
