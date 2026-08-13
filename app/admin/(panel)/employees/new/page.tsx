import { requireAdmin } from "@/lib/auth/dal";
import { PageHeader, Card, LinkButton } from "@/components/admin/ui";
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
        <EmployeeForm action={createEmployee} submitLabel="Create employee">
          {({ password }) => (
            <Card title="Employee created">
              <p className="text-sm text-stone-600">
                Share this temporary password with them directly. It is shown
                once and cannot be retrieved again — only reset.
              </p>
              <p className="mono mt-4 rounded-[10px] bg-stone-100 px-4 py-3 text-lg text-stone-900">
                {password}
              </p>
              <div className="mt-5 flex gap-3">
                <LinkButton href="/admin/employees" variant="primary">
                  Back to employees
                </LinkButton>
                <LinkButton href="/admin/employees/new">
                  Add another
                </LinkButton>
              </div>
            </Card>
          )}
        </EmployeeForm>
      </div>
    </>
  );
}
