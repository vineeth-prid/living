import { ShieldOff } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { LinkButton } from "@/components/admin/ui";

export default async function DeniedPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fbeceb]">
        <ShieldOff className="h-6 w-6 text-[var(--color-danger)]" strokeWidth={1.8} />
      </span>
      <h1 className="mt-5 text-lg font-semibold text-stone-900">
        You don&apos;t have access to that
      </h1>
      <p className="mt-2 text-sm text-stone-500">
        Management reporting and administration are restricted to
        administrators. If you think you need access, ask an admin to update
        your permissions.
      </p>
      <LinkButton
        href={user.role === "admin" ? "/admin/dashboard" : "/admin/workspace"}
        className="mt-6"
      >
        Back to your workspace
      </LinkButton>
    </div>
  );
}
