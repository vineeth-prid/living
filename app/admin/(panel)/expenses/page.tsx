import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import {
  expenseCategoryOptions,
  expensesByCategory,
  formatMoney,
  listExpenses,
  type ExpenseFilters,
} from "@/lib/expenses";
import { PAYMENT_METHODS } from "@/lib/db/schema";
import {
  Card,
  EmptyState,
  FilterBar,
  FilterLabel,
  LinkButton,
  PageHeader,
  TableWrap,
  Td,
  Th,
  cx,
  filterClass,
} from "@/components/admin/ui";
import { dateOnly } from "@/components/admin/crm";
import { ExpenseRowActions } from "./row-actions";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Admin-only ledger. An employee reaching this URL never runs the query.
  await requireAdmin();
  const sp = await searchParams;

  const filters: ExpenseFilters = {
    q: sp.q,
    categoryKey: sp.categoryKey,
    paymentMethod: sp.paymentMethod,
    propertyId: sp.propertyId,
    from: sp.from,
    to: sp.to,
    page: sp.page ? Number(sp.page) : 1,
  };

  const [{ rows, total, page, pages, amountMinor, taxMinor }, categories, byCategory] =
    await Promise.all([
      listExpenses(filters),
      expenseCategoryOptions(),
      expensesByCategory(filters),
    ]);

  const pageHref = (n: number) => {
    const params = new URLSearchParams(
      Object.entries(sp).filter(([, v]) => v) as [string, string][],
    );
    params.set("page", String(n));
    return `/admin/expenses?${params}`;
  };

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle={`${total} entr${total === 1 ? "y" : "ies"} in view`}
        action={
          <LinkButton href="/admin/expenses/new" variant="primary">
            Record expense
          </LinkButton>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card>
          <span className="block text-2xl font-semibold text-stone-900">
            {formatMoney(amountMinor)}
          </span>
          <span className="mt-0.5 block text-xs text-stone-500">
            Total for the current filter
          </span>
        </Card>
        <Card>
          <span className="block text-2xl font-semibold text-stone-900">
            {formatMoney(taxMinor)}
          </span>
          <span className="mt-0.5 block text-xs text-stone-500">
            Of which tax / GST
          </span>
        </Card>
        <Card>
          <span className="block text-2xl font-semibold text-stone-900">
            {formatMoney(total > 0 ? Math.round(amountMinor / total) : 0)}
          </span>
          <span className="mt-0.5 block text-xs text-stone-500">
            Average entry
          </span>
        </Card>
      </div>

      <FilterBar clearHref="/admin/expenses">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Description, vendor, invoice…"
          className={cx(filterClass, "w-56")}
        />
        <select
          name="categoryKey"
          defaultValue={sp.categoryKey ?? ""}
          className={filterClass}
        >
          <option value="">Any category</option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          name="paymentMethod"
          defaultValue={sp.paymentMethod ?? ""}
          className={filterClass}
        >
          <option value="">Any method</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m} className="capitalize">
              {m.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <FilterLabel label="From">
          <input
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className={filterClass}
          />
        </FilterLabel>
        <FilterLabel label="To">
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className={filterClass}
          />
        </FilterLabel>
        {/* Carried through so the "See the entries" link from a property keeps
            its filter when anything else on the bar is changed. */}
        {sp.propertyId && (
          <input type="hidden" name="propertyId" value={sp.propertyId} />
        )}
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          title="No expenses match"
          hint="Adjust the filters, or record the first expense."
          action={
            <LinkButton href="/admin/expenses/new" variant="primary">
              Record expense
            </LinkButton>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Reference</Th>
                  <Th>Description</Th>
                  <Th>Category</Th>
                  <Th>Attributed to</Th>
                  <Th>Method</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-stone-50">
                    <Td className="whitespace-nowrap text-xs">
                      {dateOnly(row.spentAt)}
                    </Td>
                    <Td className="mono text-xs text-stone-500">
                      {row.reference ?? "—"}
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/expenses/${row.id}`}
                        className="font-medium text-stone-900 hover:text-pine-700"
                      >
                        {row.description}
                      </Link>
                      {row.vendor && (
                        <span className="block text-xs text-stone-400">
                          {row.vendor}
                        </span>
                      )}
                    </Td>
                    <Td className="text-xs">{row.categoryLabel ?? "—"}</Td>
                    <Td className="text-xs">
                      {row.propertyName && (
                        <Link
                          href={`/admin/properties/${row.propertyId}`}
                          className="block text-stone-600 hover:text-pine-700"
                        >
                          {row.propertyName}
                        </Link>
                      )}
                      {row.leadName && (
                        <Link
                          href={`/admin/leads/${row.leadId}`}
                          className="block text-stone-400 hover:text-pine-700"
                        >
                          {row.leadName}
                        </Link>
                      )}
                      {!row.propertyName && !row.leadName && (
                        <span className="text-stone-400">General</span>
                      )}
                    </Td>
                    <Td className="text-xs capitalize">
                      {row.paymentMethod?.replace(/_/g, " ") ?? "—"}
                    </Td>
                    <Td className="mono whitespace-nowrap text-right font-medium text-stone-900">
                      {formatMoney(row.amountMinor)}
                    </Td>
                    <Td className="text-right">
                      <ExpenseRowActions
                        id={row.id}
                        receiptKey={row.receiptKey}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {pages > 1 && (
              <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
                {page > 1 && (
                  <Link
                    href={pageHref(page - 1)}
                    className="rounded px-3 py-1.5 hover:bg-stone-200"
                  >
                    Previous
                  </Link>
                )}
                <span className="text-stone-500">
                  Page {page} of {pages}
                </span>
                {page < pages && (
                  <Link
                    href={pageHref(page + 1)}
                    className="rounded px-3 py-1.5 hover:bg-stone-200"
                  >
                    Next
                  </Link>
                )}
              </nav>
            )}
          </div>

          <Card title="By category">
            {byCategory.length === 0 ? (
              <p className="text-sm text-stone-500">Nothing to summarise.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {byCategory.map((c) => {
                  const share =
                    amountMinor > 0
                      ? Math.round((Number(c.amount) / amountMinor) * 100)
                      : 0;
                  return (
                    <li key={c.key ?? "uncategorised"}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-stone-700">
                          {c.label ?? "Uncategorised"}
                        </span>
                        <span className="mono text-stone-500">
                          {formatMoney(Number(c.amount))}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-pine-500"
                          style={{ width: `${Math.max(share, 2)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
