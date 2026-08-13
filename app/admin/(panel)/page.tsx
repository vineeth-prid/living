import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";

// /admin is a router, not a page: admins get management reporting, employees
// get their operational workspace (§35).
export default async function AdminIndex() {
  const user = await requireUser();
  redirect(user.role === "admin" ? "/admin/dashboard" : "/admin/workspace");
}
