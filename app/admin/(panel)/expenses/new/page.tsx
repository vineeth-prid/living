import { requireAdmin } from "@/lib/auth/dal";
import { expenseCategoryOptions } from "@/lib/expenses";
import { propertyPickerOptions } from "@/lib/leads.admin";
import { listLeads } from "@/lib/leads.admin";
import { PageHeader } from "@/components/admin/ui";
import { ExpenseForm } from "../expense-form";
import { createExpenseAndReturn } from "../actions";

export const metadata = { title: "Record expense" };

export default async function NewExpensePage() {
  const admin = await requireAdmin();

  const [categories, properties, leadPage] = await Promise.all([
    expenseCategoryOptions(),
    propertyPickerOptions(),
    // Admin scope, so this is every lead. Capped by the page size — the
    // picker is for attribution, not for browsing the CRM.
    listLeads(admin, { page: 1 }),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Record expense"
        subtitle="Attribute it to a property or lead if it belongs to one."
      />
      <div className="max-w-3xl">
        <ExpenseForm
          action={createExpenseAndReturn}
          submitLabel="Save expense"
          categories={categories}
          properties={properties.map((p) => ({
            id: p.id,
            label: `${p.reference ? `${p.reference} — ` : ""}${p.name}, ${p.locality}`,
          }))}
          leads={leadPage.rows.map((l) => ({
            id: l.id,
            label: `${l.reference} — ${l.name}`,
          }))}
          initial={{ spentAt: today }}
        />
      </div>
    </>
  );
}
