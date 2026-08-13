import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { Card, PageHeader } from "@/components/admin/ui";
import { ChangePasswordForm } from "./form";

export const metadata = { title: "Change password" };

// Uses getCurrentUser rather than requireUser: requireUser redirects accounts
// with mustChangePassword here, so calling it would loop.
export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Change your password"
        subtitle={
          user.mustChangePassword
            ? "Your account uses a temporary password. Set your own to continue."
            : undefined
        }
      />
      <Card>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
