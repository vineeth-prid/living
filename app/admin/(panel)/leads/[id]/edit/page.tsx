import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import {
  employeeOptions,
  getLead,
  leadSourceOptions,
  leadTypeOptions,
  propertyPickerOptions,
} from "@/lib/leads.admin";
import { PageHeader } from "@/components/admin/ui";
import { LeadForm } from "../../lead-form";
import { updateLeadAction } from "../../actions";

export const metadata = { title: "Edit lead" };

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // Same visibility scope as the detail page — an employee can't reach a
  // colleague's lead by appending /edit.
  const lead = await getLead(user, id);
  if (!lead) notFound();

  const [types, sources, employees, properties] = await Promise.all([
    leadTypeOptions(),
    leadSourceOptions(),
    user.role === "admin" ? employeeOptions() : Promise.resolve([]),
    propertyPickerOptions(),
  ]);

  // Bound server-side. A hidden id field would let the form be retargeted.
  const action = updateLeadAction.bind(null, id);

  return (
    <>
      <PageHeader
        title={`Edit ${lead.name}`}
        subtitle={`${lead.reference} · status, assignment and follow-ups are managed on the lead page`}
      />
      <div className="max-w-4xl">
        <LeadForm
          action={action}
          submitLabel="Save changes"
          types={types}
          sources={sources}
          employees={employees}
          propertyOptions={properties}
          isAdmin={user.role === "admin"}
          initial={lead as unknown as Record<string, unknown>}
        />
      </div>
    </>
  );
}
