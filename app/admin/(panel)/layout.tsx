import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { Sidebar } from "@/components/admin/sidebar";
import { logout } from "../login/actions";

// Chrome for the signed-in panel. The login page sits outside this route group
// so it renders without a sidebar.
//
// The check here is for the shell's own data (name, role) — it is not what
// protects the pages. Each page calls requireUser()/requireAdmin() itself,
// because a layout doesn't re-run on client-side navigation and doesn't stop
// its child segments from rendering.
export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");

  return (
    <div className="min-h-screen bg-stone-100">
      <Sidebar role={user.role} name={user.fullName} logout={logout} />
      <div className="lg:pl-64">
        <main className="mx-auto max-w-[86rem] px-5 pb-16 pt-16 lg:px-8 lg:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
