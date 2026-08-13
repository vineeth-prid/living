import Link from "next/link";
import { desc, eq, and } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import {
  employeePerformance,
  resolveRange,
  sourceBreakdown,
} from "@/lib/analytics";
import {
  Card,
  PageHeader,
  TableWrap,
  Td,
  Th,
  cx,
  inputClass,
} from "@/components/admin/ui";
import { dateTime } from "@/components/admin/crm";
import { expensesByMonth, formatMoney } from "@/lib/expenses";

export const metadata = { title: "Reports" };

const AUDIT_PAGE = 50;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // §37 — audit administration is explicitly admin-only.
  await requireAdmin();
  const sp = await searchParams;

  const range = resolveRange(sp.range, sp.from, sp.to);
  const page = Math.max(1, Number(sp.page ?? 1));
  const entity = sp.entity;

  const [sources, performance, spendByMonth, logs] = await Promise.all([
    sourceBreakdown({ range }),
    employeePerformance({ range }),
    expensesByMonth(6),
    db()
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        before: auditLogs.before,
        after: auditLogs.after,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
        actorName: users.fullName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(entity ? and(eq(auditLogs.entity, entity)) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(AUDIT_PAGE)
      .offset((page - 1) * AUDIT_PAGE),
  ]);

  return (
    <>
      <PageHeader title="Reports" subtitle={`${range.label} · performance and audit trail`} />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card
          title="Spend by month"
          action={
            <Link href="/admin/expenses" className="text-xs text-pine-700 hover:underline">
              Open the ledger
            </Link>
          }
        >
          {spendByMonth.length === 0 ? (
            <p className="text-sm text-stone-500">No expenses recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {spendByMonth.map((m) => {
                const peak = Math.max(
                  ...spendByMonth.map((row) => Number(row.amount)),
                );
                const width = peak > 0 ? (Number(m.amount) / peak) * 100 : 0;
                return (
                  <li key={m.month}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="text-stone-700">{m.month}</span>
                      <span className="mono text-stone-500">
                        {formatMoney(Number(m.amount))}
                        <span className="ml-2 text-stone-400">
                          {m.entries} entr{m.entries === 1 ? "y" : "ies"}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-clay-500"
                        style={{ width: `${Math.max(width, 2)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-stone-500">
            Last six months, archived entries excluded.
          </p>
        </Card>

        <Card title="Source performance">
          {sources.length === 0 ? (
            <p className="text-sm text-stone-500">No leads in this range.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {sources.map((s) => (
                <li key={s.key} className="flex items-center justify-between text-sm">
                  <span className="text-stone-700">{s.label}</span>
                  <span className="text-stone-500">
                    {s.total} lead{s.total === 1 ? "" : "s"}
                    {s.won > 0 && <span className="ml-2 text-xs text-pine-700">{s.won} won</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Employee performance">
          {performance.length === 0 ? (
            <p className="text-sm text-stone-500">No assigned leads in this range.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {performance.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-stone-700">{p.name}</span>
                  <span className="text-stone-500">
                    {p.total} · {p.won} won · {p.active} active
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-stone-900">Audit log</h2>
        <form method="get" className="flex items-center gap-2">
          <select name="entity" defaultValue={entity ?? ""} className={cx(inputClass, "w-auto py-1 text-xs")}>
            <option value="">All entities</option>
            <option value="property">Properties</option>
            <option value="lead">Leads</option>
            <option value="user">Employees</option>
            <option value="lead_taxonomy">Settings</option>
          </select>
          <button type="submit" className="rounded-[9px] border border-stone-300 px-3 py-1 text-xs hover:bg-stone-100">
            Filter
          </button>
        </form>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Who</Th>
            <Th>Action</Th>
            <Th>Entity</Th>
            <Th>Change</Th>
            <Th>IP</Th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-stone-50">
              <Td className="whitespace-nowrap text-xs text-stone-500">{dateTime(log.createdAt)}</Td>
              <Td className="text-xs">{log.actorName ?? "System"}</Td>
              <Td className="mono text-xs text-stone-800">{log.action}</Td>
              <Td className="text-xs">
                {log.entityId ? (
                  <Link
                    href={
                      log.entity === "property"
                        ? `/admin/properties/${log.entityId}`
                        : log.entity === "lead"
                          ? `/admin/leads/${log.entityId}`
                          : log.entity === "user"
                            ? `/admin/employees/${log.entityId}`
                            : "#"
                    }
                    className="text-stone-600 hover:text-pine-700"
                  >
                    {log.entity}
                  </Link>
                ) : (
                  log.entity
                )}
              </Td>
              <Td className="max-w-[22rem] truncate text-xs text-stone-500">
                {log.after ? JSON.stringify(log.after) : "—"}
              </Td>
              <Td className="mono text-[11px] text-stone-400">{log.ip ?? "—"}</Td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-sm text-stone-500">
                Nothing recorded yet.
              </Td>
            </tr>
          )}
        </tbody>
      </TableWrap>

      <nav className="mt-4 flex items-center justify-center gap-3 text-sm">
        {page > 1 && (
          <Link href={`/admin/reports?page=${page - 1}${entity ? `&entity=${entity}` : ""}`} className="rounded px-3 py-1.5 hover:bg-stone-200">
            Previous
          </Link>
        )}
        <span className="text-stone-500">Page {page}</span>
        {logs.length === AUDIT_PAGE && (
          <Link href={`/admin/reports?page=${page + 1}${entity ? `&entity=${entity}` : ""}`} className="rounded px-3 py-1.5 hover:bg-stone-200">
            Next
          </Link>
        )}
      </nav>
    </>
  );
}
