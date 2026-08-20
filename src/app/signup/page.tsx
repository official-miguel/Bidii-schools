// Signup is disabled — all school accounts are created by Super Admin. Redirect to login.
import { redirect } from "next/navigation";

export default function SignupPage() {
  redirect("/login");
}
