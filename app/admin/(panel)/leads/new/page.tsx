import { requireUser } from "@/lib/auth/dal";
import {
  employeeOptions,
  leadSourceOptions,
  leadTypeOptions,
  propertyPickerOptions,
} from "@/lib/leads.admin";
import { PageHeader } from "@/components/admin/ui";
import { LeadForm } from "../lead-form";
import { createLeadAndOpen } from "../actions";

export const metadata = { title: "Add lead" };

export default async function NewLeadPage() {
  const user = await requireUser();

  const [types, sources, employees, properties] = await Promise.all([
    leadTypeOptions(),
    leadSourceOptions(),
    user.role === "admin" ? employeeOptions() : Promise.resolve([]),
    propertyPickerOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Add lead"
        subtitle={
          user.role === "admin"
            ? "Assign it now or leave it unassigned and allocate later."
            : "New leads you create are assigned to you."
        }
      />
      <div className="max-w-4xl">
        <LeadForm
          action={createLeadAndOpen}
          submitLabel="Create lead"
          types={types}
          sources={sources}
          employees={employees}
          propertyOptions={properties}
          isAdmin={user.role === "admin"}
        />
      </div>
    </>
  );
}
