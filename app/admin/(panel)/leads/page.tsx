import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import {
  employeeOptions,
  leadSourceOptions,
  leadTypeOptions,
  listLeads,
  type LeadFilters,
} from "@/lib/leads.admin";
import { LEAD_PRIORITIES, LEAD_STATUSES } from "@/lib/db/schema";
import {
  EmptyState,
  LinkButton,
  PageHeader,
  TableWrap,
  Td,
  Th,
  cx,
  inputClass,
} from "@/components/admin/ui";
import {
  LEAD_STATUS_LABELS,
  PriorityTag,
  StatusBadge,
  budgetRange,
  dateOnly,
  relativeDue,
} from "@/components/admin/crm";

export const metadata = { title: "Leads" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const filters: LeadFilters = {
    q: sp.q,
    status: sp.status ?? "all",
    priority: sp.priority,
    assignedToId: sp.assignedToId,
    typeKey: sp.typeKey,
    sourceKey: sp.sourceKey,
    propertyKind: sp.propertyKind,
    city: sp.city,
    budgetMin: sp.budgetMin ? Number(sp.budgetMin) : undefined,
    budgetMax: sp.budgetMax ? Number(sp.budgetMax) : undefined,
    createdFrom: sp.createdFrom,
    createdTo: sp.createdTo,
    followUpBefore: sp.followUpBefore,
    mine: sp.mine === "1",
    page: sp.page ? Number(sp.page) : 1,
  };

  // listLeads applies the visibility scope itself — an employee sees only
  // their own leads no matter what they put in the query string.
  const [{ rows, total, page, pages }, employees, types, sources] =
    await Promise.all([
      listLeads(user, filters),
      user.role === "admin" ? employeeOptions() : Promise.resolve([]),
      leadTypeOptions(),
      leadSourceOptions(),
    ]);

  const pageHref = (n: number) => {
    const params = new URLSearchParams(
      Object.entries(sp).filter(([, v]) => v) as [string, string][],
    );
    params.set("page", String(n));
    return `/admin/leads?${params}`;
  };

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${total} lead${total === 1 ? "" : "s"}${user.role === "admin" ? "" : " assigned to or created by you"}`}
        action={
          <div className="flex gap-2">
            <LinkButton href="/admin/leads/pipeline">Pipeline</LinkButton>
            <LinkButton href="/admin/leads/new" variant="primary">Add lead</LinkButton>
          </div>
        }
      />

      <form
        method="get"
        className="mb-5 flex flex-wrap items-end gap-3 rounded-[14px] border border-stone-200 bg-white p-4"
      >
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Name, mobile, email, reference…"
          className={cx(inputClass, "w-full sm:w-64")}
        />
        <select name="status" defaultValue={filters.status} className={cx(inputClass, "w-auto")}>
          <option value="all">Any status</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select name="priority" defaultValue={sp.priority ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Any priority</option>
          {LEAD_PRIORITIES.map((p) => (
            <option key={p} value={p} className="capitalize">{p}</option>
          ))}
        </select>
        {user.role === "admin" && (
          <select name="assignedToId" defaultValue={sp.assignedToId ?? ""} className={cx(inputClass, "w-auto")}>
            <option value="">Anyone</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.fullName}</option>
            ))}
          </select>
        )}
        <select name="typeKey" defaultValue={sp.typeKey ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Any type</option>
          {types.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <select name="sourceKey" defaultValue={sp.sourceKey ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Any source</option>
          {sources.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-stone-600">
          <span>Follow-up before</span>
          <input type="date" name="followUpBefore" defaultValue={sp.followUpBefore ?? ""} className={cx(inputClass, "w-auto")} />
        </label>
        <button type="submit" className="rounded-[10px] bg-pine-600 px-4 py-2 text-sm font-medium text-white hover:bg-pine-700">
          Apply
        </button>
        <Link href="/admin/leads" className="text-sm text-stone-500 hover:text-stone-800">
          Clear
        </Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No leads match"
          hint="Adjust the filters, or add a lead manually."
          action={<LinkButton href="/admin/leads/new" variant="primary">Add lead</LinkButton>}
        />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Lead</Th>
                <Th>Contact</Th>
                <Th>Budget</Th>
                <Th>Status</Th>
                <Th>Priority</Th>
                <Th>Assigned to</Th>
                <Th>Next follow-up</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const due = relativeDue(row.nextFollowUpAt);
                return (
                  <tr key={row.id} className="hover:bg-stone-50">
                    <Td className="mono text-xs text-stone-500">{row.reference}</Td>
                    <Td>
                      <Link href={`/admin/leads/${row.id}`} className="font-medium text-stone-900 hover:text-pine-700">
                        {row.name}
                      </Link>
                      {row.city && <span className="block text-xs text-stone-400">{row.city}</span>}
                    </Td>
                    <Td className="text-xs">
                      <a href={`tel:${row.mobile}`} className="hover:text-pine-700">{row.mobile}</a>
                      {row.email && <span className="block text-stone-400">{row.email}</span>}
                    </Td>
                    <Td className="mono text-xs">{budgetRange(row.budgetMin, row.budgetMax)}</Td>
                    <Td><StatusBadge status={row.status} /></Td>
                    <Td><PriorityTag priority={row.priority} /></Td>
                    <Td className="text-xs">{row.assignedToName ?? <span className="text-[var(--color-danger)]">Unassigned</span>}</Td>
                    <Td className="text-xs">
                      {row.nextFollowUpAt ? (
                        <span className={due.overdue ? "text-[var(--color-danger)]" : "text-stone-600"}>
                          {due.label}
                        </span>
                      ) : (
                        <span className="text-stone-400">None</span>
                      )}
                    </Td>
                    <Td className="text-xs text-stone-500">{dateOnly(row.createdAt)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>

          {pages > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
              {page > 1 && (
                <Link href={pageHref(page - 1)} className="rounded px-3 py-1.5 hover:bg-stone-200">Previous</Link>
              )}
              <span className="text-stone-500">Page {page} of {pages}</span>
              {page < pages && (
                <Link href={pageHref(page + 1)} className="rounded px-3 py-1.5 hover:bg-stone-200">Next</Link>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
