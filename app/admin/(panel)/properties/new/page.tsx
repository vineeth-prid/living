import { requireUser, can } from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/constants";
import { PageHeader } from "@/components/admin/ui";
import { PropertyForm } from "../property-form";
import { createAndEdit } from "../actions";

export const metadata = { title: "Add property" };

export default async function NewPropertyPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="Add property"
        subtitle="Saved as a draft. Nothing reaches the website until it's published."
      />
      <div className="max-w-4xl">
        <PropertyForm
          action={createAndEdit}
          submitLabel="Save draft"
          canSetFinalPrice={can(user, PERMISSIONS.propertyFinalPrice)}
          showPhotos
        />
      </div>
    </>
  );
}
