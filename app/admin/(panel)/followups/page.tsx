import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { followupsFor } from "@/lib/leads.admin";
import {
  EmptyState,
  PageHeader,
  TableWrap,
  Td,
  Th,
  cx,
} from "@/components/admin/ui";
import { PriorityTag, dateTime, relativeDue } from "@/components/admin/crm";
import { FollowUpActions } from "./actions-cell";

export const metadata = { title: "Follow-ups" };

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; status?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  // followupsFor forces "mine" for employees regardless of the query string.
  const scope = sp.scope === "all" ? "all" : "mine";
  const status = sp.status ?? "pending";
  const rows = await followupsFor(user, scope, status);

  const tab = (label: string, href: string, active: boolean) => (
    <Link
      href={href}
      className={cx(
        "shrink-0 rounded-[8px] px-3 py-1.5 text-sm transition",
        active ? "bg-pine-600 text-white" : "text-stone-600 hover:bg-stone-100",
      )}
    >
      {label}
    </Link>
  );

  // relativeDue already owns the "is this late?" comparison, so the header
  // count and the per-row labels can never disagree.
  const overdue = rows.filter((r) => relativeDue(r.dueAt).overdue).length;

  return (
    <>
      <PageHeader
        title="Follow-ups"
        subtitle={
          overdue > 0
            ? `${rows.length} shown · ${overdue} overdue`
            : `${rows.length} shown`
        }
      />

      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto rounded-[12px] border border-stone-200 bg-white px-3 py-2">
        {tab("Pending", `/admin/followups?scope=${scope}&status=pending`, status === "pending")}
        {tab("Completed", `/admin/followups?scope=${scope}&status=completed`, status === "completed")}
        {tab("All", `/admin/followups?scope=${scope}&status=all`, status === "all")}
        <span className="mx-1.5 h-5 w-px shrink-0 bg-stone-200" />
        {tab("Mine", `/admin/followups?scope=mine&status=${status}`, scope === "mine")}
        {user.role === "admin" &&
          tab("Everyone", `/admin/followups?scope=all&status=${status}`, scope === "all")}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing here"
          hint="Follow-ups scheduled from a lead show up in this list until they're completed or cancelled."
        />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Due</Th>
              <Th>Type</Th>
              <Th>Lead</Th>
              <Th>Contact</Th>
              <Th>Priority</Th>
              <Th>Owner</Th>
              <Th>Notes</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const due = relativeDue(row.dueAt);
              return (
                <tr key={row.id} className="hover:bg-stone-50">
                  <Td>
                    <span className={cx("text-xs", due.overdue && row.status === "pending" ? "font-medium text-[var(--color-danger)]" : "text-stone-600")}>
                      {dateTime(row.dueAt)}
                    </span>
                    <span className="block text-[11px] text-stone-400">{due.label}</span>
                  </Td>
                  <Td className="text-xs capitalize">{row.kind.replace(/_/g, " ")}</Td>
                  <Td>
                    <Link href={`/admin/leads/${row.leadId}`} className="font-medium text-stone-900 hover:text-pine-700">
                      {row.leadName}
                    </Link>
                    <span className="mono block text-[11px] text-stone-400">{row.leadReference}</span>
                  </Td>
                  <Td className="text-xs">
                    <a href={`tel:${row.leadMobile}`} className="hover:text-pine-700">{row.leadMobile}</a>
                  </Td>
                  <Td><PriorityTag priority={row.leadPriority} /></Td>
                  <Td className="text-xs">{row.assignedToName ?? "—"}</Td>
                  <Td className="max-w-[16rem] truncate text-xs text-stone-500">{row.notes ?? "—"}</Td>
                  <Td className="text-right">
                    {row.status === "pending" ? (
                      <FollowUpActions id={row.id} />
                    ) : (
                      <span className="text-xs capitalize text-stone-400">{row.status}</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
