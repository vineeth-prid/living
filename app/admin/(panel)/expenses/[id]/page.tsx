import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/dal";
import { expenseCategoryOptions, getExpense, toMajor } from "@/lib/expenses";
import { listLeads, propertyPickerOptions } from "@/lib/leads.admin";
import { PageHeader } from "@/components/admin/ui";
import { ExpenseForm } from "../expense-form";
import { updateExpense } from "../actions";

export const metadata = { title: "Edit expense" };

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const expense = await getExpense(id);
  if (!expense) notFound();

  const [categories, properties, leadPage] = await Promise.all([
    expenseCategoryOptions(),
    propertyPickerOptions(),
    listLeads(admin, { page: 1 }),
  ]);

  // Bound server-side; a hidden id field could be retargeted.
  const action = updateExpense.bind(null, id);

  return (
    <>
      <PageHeader
        title={expense.description}
        subtitle={`${expense.reference ?? "No reference"} · recorded ${new Intl.DateTimeFormat(
          "en-IN",
          { dateStyle: "medium" },
        ).format(expense.createdAt)}`}
      />
      <div className="max-w-3xl">
        <ExpenseForm
          action={action}
          submitLabel="Save changes"
          categories={categories}
          properties={properties.map((p) => ({
            id: p.id,
            label: `${p.reference ? `${p.reference} — ` : ""}${p.name}, ${p.locality}`,
          }))}
          leads={leadPage.rows.map((l) => ({
            id: l.id,
            label: `${l.reference} — ${l.name}`,
          }))}
          existingReceiptUrl={expense.receiptUrl}
          initial={{
            description: expense.description,
            // Stored in paise, edited in rupees.
            amount: toMajor(expense.amountMinor),
            tax: expense.taxMinor === null ? "" : toMajor(expense.taxMinor),
            spentAt: expense.spentAt.toISOString().slice(0, 10),
            categoryKey: expense.categoryKey,
            vendor: expense.vendor,
            paymentMethod: expense.paymentMethod,
            invoiceNumber: expense.invoiceNumber,
            notes: expense.notes,
            propertyId: expense.propertyId,
            leadId: expense.leadId,
          }}
        />
      </div>
    </>
  );
}
