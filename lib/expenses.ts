import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "./db";
import {
  expenseCategories,
  expenses,
  leads,
  properties,
  users,
} from "./db/schema";
import { mediaUrl } from "./images";

// Admin-only expense ledger. Nothing here is imported by a public page or by
// the employee workspace — /admin/expenses gates on requireAdmin().

const EXPENSE_PAGE_SIZE = 25;

/**
 * Money is stored in paise and only becomes rupees for display.
 * `Math.round` on the way in stops 1234.565 becoming 123456.49999.
 */
export const toMinor = (rupees: number) => Math.round(rupees * 100);
export const toMajor = (minor: number) => minor / 100;

export const formatMoney = (minor: number | null | undefined) =>
  minor === null || minor === undefined
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(toMajor(minor));

export type ExpenseFilters = {
  q?: string;
  categoryKey?: string;
  paymentMethod?: string;
  propertyId?: string;
  leadId?: string;
  from?: string;
  to?: string;
  page?: number;
};

function whereClause(f: ExpenseFilters) {
  return and(
    isNull(expenses.deletedAt),
    f.categoryKey ? eq(expenses.categoryKey, f.categoryKey) : undefined,
    f.paymentMethod
      ? eq(expenses.paymentMethod, f.paymentMethod as "cash")
      : undefined,
    f.propertyId ? eq(expenses.propertyId, f.propertyId) : undefined,
    f.leadId ? eq(expenses.leadId, f.leadId) : undefined,
    f.from ? gte(expenses.spentAt, new Date(f.from)) : undefined,
    f.to ? lte(expenses.spentAt, new Date(`${f.to}T23:59:59`)) : undefined,
    f.q
      ? or(
          ilike(expenses.description, `%${f.q}%`),
          ilike(expenses.vendor, `%${f.q}%`),
          ilike(expenses.reference, `%${f.q}%`),
          ilike(expenses.invoiceNumber, `%${f.q}%`),
        )
      : undefined,
  );
}

export async function listExpenses(f: ExpenseFilters) {
  const page = Math.max(1, f.page ?? 1);
  const where = whereClause(f);

  const rows = await db()
    .select({
      id: expenses.id,
      reference: expenses.reference,
      spentAt: expenses.spentAt,
      amountMinor: expenses.amountMinor,
      description: expenses.description,
      vendor: expenses.vendor,
      paymentMethod: expenses.paymentMethod,
      invoiceNumber: expenses.invoiceNumber,
      receiptKey: expenses.receiptKey,
      categoryLabel: expenseCategories.label,
      propertyId: expenses.propertyId,
      propertyName: properties.name,
      leadId: expenses.leadId,
      leadName: leads.name,
      createdByName: users.fullName,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenseCategories.key, expenses.categoryKey))
    .leftJoin(properties, eq(properties.id, expenses.propertyId))
    .leftJoin(leads, eq(leads.id, expenses.leadId))
    .leftJoin(users, eq(users.id, expenses.createdById))
    .where(where)
    .orderBy(desc(expenses.spentAt), desc(expenses.createdAt))
    .limit(EXPENSE_PAGE_SIZE)
    .offset((page - 1) * EXPENSE_PAGE_SIZE);

  // The total covers the whole filtered set, not just this page — a footer
  // that only added up 25 rows would quietly understate the spend.
  const [totals] = await db()
    .select({
      total: count(),
      amount: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)::bigint`,
      tax: sql<number>`coalesce(sum(${expenses.taxMinor}), 0)::bigint`,
    })
    .from(expenses)
    .where(where);

  return {
    rows,
    page,
    total: totals?.total ?? 0,
    pages: Math.max(1, Math.ceil((totals?.total ?? 0) / EXPENSE_PAGE_SIZE)),
    amountMinor: Number(totals?.amount ?? 0),
    taxMinor: Number(totals?.tax ?? 0),
  };
}

export async function getExpense(id: string) {
  const [row] = await db()
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)))
    .limit(1);

  if (!row) return null;
  return { ...row, receiptUrl: row.receiptKey ? mediaUrl(row.receiptKey) : null };
}

export async function expenseCategoryOptions(includeInactive = false) {
  return db()
    .select()
    .from(expenseCategories)
    .where(includeInactive ? undefined : eq(expenseCategories.isActive, true))
    .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.label));
}

/** Spend by category for the reporting cards. */
export async function expensesByCategory(f: ExpenseFilters) {
  return db()
    .select({
      key: expenses.categoryKey,
      label: expenseCategories.label,
      amount: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)::bigint`,
      entries: count(),
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenseCategories.key, expenses.categoryKey))
    .where(whereClause(f))
    .groupBy(expenses.categoryKey, expenseCategories.label)
    .orderBy(sql`sum(${expenses.amountMinor}) desc`)
    .limit(12);
}

/** Month-by-month totals for the trend list. */
export async function expensesByMonth(months = 6) {
  return db()
    .select({
      month: sql<string>`to_char(date_trunc('month', ${expenses.spentAt}), 'Mon YYYY')`,
      bucket: sql<string>`date_trunc('month', ${expenses.spentAt})`,
      amount: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)::bigint`,
      entries: count(),
    })
    .from(expenses)
    .where(
      and(
        isNull(expenses.deletedAt),
        gte(expenses.spentAt, sql`now() - (${months} || ' months')::interval`),
      ),
    )
    .groupBy(sql`date_trunc('month', ${expenses.spentAt})`)
    .orderBy(desc(sql`date_trunc('month', ${expenses.spentAt})`));
}

/**
 * Total spent against one listing — the payoff of tagging expenses to a
 * property. Rendered on the property page beside the interest it generated.
 */
export async function propertySpend(propertyId: string) {
  const [row] = await db()
    .select({
      amount: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)::bigint`,
      entries: count(),
    })
    .from(expenses)
    .where(
      and(eq(expenses.propertyId, propertyId), isNull(expenses.deletedAt)),
    );

  return {
    amountMinor: Number(row?.amount ?? 0),
    entries: row?.entries ?? 0,
  };
}

export async function latestExpenseReference(): Promise<string | null> {
  const [row] = await db()
    .select({ reference: expenses.reference })
    .from(expenses)
    .where(sql`${expenses.reference} is not null`)
    .orderBy(desc(expenses.reference))
    .limit(1);
  return row?.reference ?? null;
}
