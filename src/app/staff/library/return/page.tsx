import { redirect } from "next/navigation";
export default function LibraryReturnPage() {
  redirect("/staff/library/circulate");
}
