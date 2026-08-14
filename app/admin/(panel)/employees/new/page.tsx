import { requireAdmin } from "@/lib/auth/dal";
import { PageHeader } from "@/components/admin/ui";
import { EmployeeForm } from "../employee-form";
import { createEmployee } from "../actions";

export const metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  await requireAdmin();

  return (
    <>
      <PageHeader
        title="Add employee"
        subtitle="They'll get a temporary password and be asked to change it at first sign-in."
      />
      <div className="max-w-3xl">
        <EmployeeForm action={createEmployee} submitLabel="Create employee" />
      </div>
    </>
  );
}
