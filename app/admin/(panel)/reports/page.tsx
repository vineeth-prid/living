import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import {
  RANGE_PRESETS,
  auditActions,
  employeePerformance,
  funnelFrom,
  inventoryMovement,
  leadCities,
  leadKpis,
  leadsOverTime,
  resolveRange,
  sourceBreakdown,
  type DashboardFilters,
} from "@/lib/analytics";
import { employeeOptions, leadSourceOptions } from "@/lib/leads.admin";
import {
  Card,
  FilterBar,
  FilterLabel,
  PageHeader,
  TableWrap,
  Td,
  Th,
  cx,
  filterClass,
} from "@/components/admin/ui";
import { dateTime, inr } from "@/components/admin/crm";
import {
  expensesByCategory,
  expensesByMonth,
  formatMoney,
  listExpenses,
} from "@/lib/expenses";

export const metadata = { title: "Reports" };

const AUDIT_PAGE = 50;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";

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

  const filters: DashboardFilters = {
    range,
    assignedToId: sp.assignedToId,
    sourceKey: sp.sourceKey,
    city: sp.city,
  };

  // The ledger takes its own date strings, so the same range drives both and
  // spend can be compared with the revenue it was spent chasing.
  const expenseFilters = { from: iso(range.from), to: iso(range.to) };

  const [
    leadStats,
    sources,
    performance,
    trend,
    inventory,
    spendByMonth,
    spendByCategory,
    spendTotals,
    employees,
    sourceList,
    cities,
    actions,
    logs,
  ] = await Promise.all([
    leadKpis(filters),
    sourceBreakdown(filters),
    employeePerformance(filters),
    leadsOverTime(filters),
    inventoryMovement(range),
    expensesByMonth(12),
    expensesByCategory(expenseFilters),
    // The category breakdown is capped at twelve rows, so its sum is not the
    // total — this is.
    listExpenses(expenseFilters),
    employeeOptions(),
    leadSourceOptions(),
    leadCities(),
    auditActions(),
    db()
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        after: auditLogs.after,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
        actorName: users.fullName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(
        and(
          sp.entity ? eq(auditLogs.entity, sp.entity) : undefined,
          sp.action ? eq(auditLogs.action, sp.action) : undefined,
          sp.actorId ? eq(auditLogs.actorId, sp.actorId) : undefined,
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(AUDIT_PAGE)
      .offset((page - 1) * AUDIT_PAGE),
  ]);

  const funnel = funnelFrom(leadStats.status);
  const won = leadStats.status.closed_won ?? 0;
  const lost = leadStats.status.closed_lost ?? 0;
  const spendMinor = spendTotals.amountMinor;
  const peakTrend = Math.max(1, ...trend.rows.map((r) => r.total));
  const peakMonth = Math.max(1, ...spendByMonth.map((m) => Number(m.amount)));

  // Every link out of this page has to carry the filters, or paging through
  // the audit log silently resets the range back to the last 30 days.
  const withParams = (next: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...sp, ...next })) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    return `/admin/reports?${params}`;
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${range.label} · ${iso(range.from)} to ${iso(range.to)}`}
      />

      <FilterBar clearHref="/admin/reports">
        <select name="range" defaultValue={sp.range ?? "30d"} className={filterClass}>
          {RANGE_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>{preset.label}</option>
          ))}
        </select>
        {/* Filling both dates overrides the preset — resolveRange prefers them. */}
        <FilterLabel label="From">
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={filterClass} />
        </FilterLabel>
        <FilterLabel label="To">
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={filterClass} />
        </FilterLabel>
        <select name="assignedToId" defaultValue={sp.assignedToId ?? ""} className={filterClass}>
          <option value="">Everyone</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.fullName}</option>
          ))}
        </select>
        <select name="sourceKey" defaultValue={sp.sourceKey ?? ""} className={filterClass}>
          <option value="">Any source</option>
          {sourceList.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <select name="city" defaultValue={sp.city ?? ""} className={filterClass}>
          <option value="">Any city</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </FilterBar>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Leads in range" value={leadStats.total} />
        <Stat label="Closed won" value={won} note={`${pct(won, won + lost)} of decided`} />
        <Stat label="Closed value" value={inr(leadStats.wonValue)} />
        <Stat label="Open pipeline" value={inr(leadStats.pipelineValue)} />
        <Stat label="Spend in range" value={formatMoney(spendMinor)} />
        <Stat
          label="Value per rupee spent"
          value={spendMinor > 0 ? `${(leadStats.wonValue / (spendMinor / 100)).toFixed(1)}×` : "—"}
          note="Closed value ÷ recorded spend"
        />
        <Stat label="Listings added" value={inventory.created} note={inr(inventory.addedValue)} />
        <Stat label="Listings published" value={inventory.published} />
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title={`Leads by ${trend.bucket}`}>
          {trend.rows.length === 0 ? (
            <p className="text-sm text-stone-500">No leads in this range.</p>
          ) : (
            <>
              {/* A plain flex row of columns — a chart library for seven bars
                  would be more code than the bars. */}
              <div className="flex h-40 items-end gap-1">
                {trend.rows.map((row) => (
                  <div
                    key={row.bucket}
                    title={`${row.bucket}: ${row.total} leads, ${row.won} won`}
                    className="flex min-w-0 flex-1 flex-col justify-end gap-px"
                  >
                    <div
                      className="rounded-t-sm bg-pine-200"
                      style={{ height: `${((row.total - row.won) / peakTrend) * 100}%` }}
                    />
                    <div
                      className="bg-pine-600"
                      style={{ height: `${(row.won / peakTrend) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-stone-400">
                <span>{trend.rows[0].bucket}</span>
                <span>{trend.rows[trend.rows.length - 1].bucket}</span>
              </div>
              <p className="mt-3 flex items-center gap-4 text-xs text-stone-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-pine-200" /> Created
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-pine-600" /> Won
                </span>
              </p>
            </>
          )}
        </Card>

        <Card title="Conversion funnel">
          <ul className="flex flex-col gap-3">
            {funnel.map((step, i) => (
              <li key={step.key}>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="text-stone-700">{step.label}</span>
                  <span className="text-stone-500">
                    {step.value}
                    {i > 0 && <span className="ml-2 text-stone-400">{step.rate}%</span>}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-pine-500"
                    style={{
                      width: `${funnel[0].value > 0 ? Math.max((step.value / funnel[0].value) * 100, step.value > 0 ? 2 : 0) : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>

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
              {spendByMonth.map((m) => (
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
                      style={{ width: `${Math.max((Number(m.amount) / peakMonth) * 100, 2)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-stone-500">
            Last twelve months, archived entries excluded. Not affected by the
            range above — the point of it is the shape over time.
          </p>
        </Card>

        <Card title="Spend by category, in range">
          {spendByCategory.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing recorded in this range.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {spendByCategory.map((c) => (
                <li key={c.key ?? "uncategorised"}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-stone-700">{c.label ?? "Uncategorised"}</span>
                    <span className="mono text-stone-500">
                      {formatMoney(Number(c.amount))}
                      <span className="ml-2 text-stone-400">
                        {pct(Number(c.amount), spendMinor)}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-clay-500"
                      style={{
                        width: `${Math.max((Number(c.amount) / Math.max(spendMinor, 1)) * 100, 2)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-stone-900">Source performance</h2>
      {sources.length === 0 ? (
        <Card><p className="text-sm text-stone-500">No leads in this range.</p></Card>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Source</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">Won</Th>
              <Th className="text-right">Conversion</Th>
              <Th className="text-right">Share of leads</Th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.key} className="hover:bg-stone-50">
                <Td className="font-medium text-stone-900">{s.label}</Td>
                <Td className="mono text-right">{s.total}</Td>
                <Td className="mono text-right">{s.won}</Td>
                <Td className="mono text-right">{pct(s.won, s.total)}</Td>
                <Td className="mono text-right text-stone-500">
                  {pct(s.total, leadStats.total)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <h2 className="mb-3 mt-6 text-sm font-semibold text-stone-900">
        Employee performance
      </h2>
      {performance.length === 0 ? (
        <Card><p className="text-sm text-stone-500">No assigned leads in this range.</p></Card>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Employee</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">Active</Th>
              <Th className="text-right">Won</Th>
              <Th className="text-right">Lost</Th>
              <Th className="text-right">Win rate</Th>
              <Th className="text-right">Closed value</Th>
            </tr>
          </thead>
          <tbody>
            {performance.map((row) => (
              <tr key={row.id} className="hover:bg-stone-50">
                <Td className="font-medium text-stone-900">
                  <Link
                    href={withParams({ assignedToId: row.id, page: undefined })}
                    className="hover:text-pine-700"
                  >
                    {row.name}
                  </Link>
                </Td>
                <Td className="mono text-right">{row.total}</Td>
                <Td className="mono text-right">{row.active}</Td>
                <Td className="mono text-right">{row.won}</Td>
                <Td className="mono text-right">{row.lost}</Td>
                <Td className="mono text-right">{pct(row.won, row.won + row.lost)}</Td>
                <Td className="mono text-right">{inr(Number(row.wonValue))}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <div className="mb-3 mt-6 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold text-stone-900">Audit log</h2>
        <form method="get" className="flex items-center gap-2 overflow-x-auto">
          {/* The range filters are not part of this form — the audit log is
              its own query — so carry them as hidden fields or applying an
              entity filter would reset the whole page's range. */}
          {(["range", "from", "to", "assignedToId", "sourceKey", "city"] as const).map(
            (key) =>
              sp[key] ? <input key={key} type="hidden" name={key} value={sp[key]} /> : null,
          )}
          <select name="entity" defaultValue={sp.entity ?? ""} className={cx(filterClass, "h-8 text-xs")}>
            <option value="">All entities</option>
            <option value="property">Properties</option>
            <option value="lead">Leads</option>
            <option value="user">Employees</option>
            <option value="expense">Expenses</option>
            <option value="lead_taxonomy">Settings</option>
          </select>
          <select name="action" defaultValue={sp.action ?? ""} className={cx(filterClass, "h-8 text-xs")}>
            <option value="">Any action</option>
            {actions.map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
          <select name="actorId" defaultValue={sp.actorId ?? ""} className={cx(filterClass, "h-8 text-xs")}>
            <option value="">Anyone</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.fullName}</option>
            ))}
          </select>
          <button
            type="submit"
            className="h-8 shrink-0 rounded-[8px] border border-stone-300 px-3 text-xs hover:bg-stone-100"
          >
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
                            : log.entity === "expense"
                              ? `/admin/expenses/${log.entityId}`
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
                Nothing matches those filters.
              </Td>
            </tr>
          )}
        </tbody>
      </TableWrap>

      <nav className="mt-4 flex items-center justify-center gap-3 text-sm">
        {page > 1 && (
          <Link href={withParams({ page: page - 1 })} className="rounded px-3 py-1.5 hover:bg-stone-200">
            Previous
          </Link>
        )}
        <span className="text-stone-500">Page {page}</span>
        {logs.length === AUDIT_PAGE && (
          <Link href={withParams({ page: page + 1 })} className="rounded px-3 py-1.5 hover:bg-stone-200">
            Next
          </Link>
        )}
      </nav>

      <p className="mt-6 text-xs text-stone-500">
        Lead figures cover leads created inside the range. Spend is taken from
        the ledger over the same dates, so &ldquo;value per rupee&rdquo; only
        means anything once expenses are being recorded.
      </p>
    </>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: number | string;
  note?: string;
}) {
  return (
    <div className="rounded-[14px] border border-stone-200 bg-white p-4 shadow-soft">
      <span className="block text-2xl font-semibold text-stone-900">{value}</span>
      <span className="mt-0.5 block text-xs text-stone-500">{label}</span>
      {note && <span className="mt-1 block text-[11px] text-stone-400">{note}</span>}
    </div>
  );
}
