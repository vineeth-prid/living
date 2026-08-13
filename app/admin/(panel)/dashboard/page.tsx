import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import {
  employeePerformance,
  funnelFrom,
  leadCities,
  leadKpis,
  propertyKpis,
  resolveRange,
  sourceBreakdown,
  topPropertiesByInterest,
} from "@/lib/analytics";
import { employeeOptions, leadSourceOptions } from "@/lib/leads.admin";
import {
  Card,
  PageHeader,
  TableWrap,
  Td,
  Th,
  cx,
  inputClass,
} from "@/components/admin/ui";
import { LEAD_STATUS_LABELS, inr } from "@/components/admin/crm";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // §33 — administrators only. An employee who types this URL is stopped in
  // the DAL before any of these queries run.
  await requireAdmin();
  const sp = await searchParams;

  const range = resolveRange(sp.range, sp.from, sp.to);
  const filters = {
    range,
    assignedToId: sp.assignedToId,
    sourceKey: sp.sourceKey,
    propertyKind: sp.propertyKind,
    city: sp.city,
  };

  const [leadStats, propertyStats, sources, performance, topProperties, employees, sourceList, cities] =
    await Promise.all([
      leadKpis(filters),
      propertyKpis(),
      sourceBreakdown(filters),
      employeePerformance(filters),
      topPropertiesByInterest(),
      employeeOptions(),
      leadSourceOptions(),
      leadCities(),
    ]);

  const funnel = funnelFrom(leadStats.status);
  const won = leadStats.status.closed_won ?? 0;
  const avgDeal = won > 0 ? Math.round(leadStats.wonValue / won) : 0;

  const rangeTab = (key: string, label: string) => (
    <Link
      key={key}
      href={`/admin/dashboard?range=${key}`}
      className={cx(
        "rounded-[9px] px-3 py-1.5 text-sm transition",
        (sp.range ?? "30d") === key
          ? "bg-pine-600 text-white"
          : "text-stone-600 hover:bg-stone-200",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${range.label} · lead and inventory performance`} />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[12px] border border-stone-200 bg-white p-2">
        {rangeTab("today", "Today")}
        {rangeTab("7d", "7 days")}
        {rangeTab("30d", "30 days")}
        {rangeTab("month", "This month")}
        {rangeTab("last_month", "Last month")}
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-[14px] border border-stone-200 bg-white p-4">
        <input type="hidden" name="range" value="custom" />
        <label className="text-xs text-stone-600">
          From
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={cx(inputClass, "mt-1 w-auto")} />
        </label>
        <label className="text-xs text-stone-600">
          To
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={cx(inputClass, "mt-1 w-auto")} />
        </label>
        <select name="assignedToId" defaultValue={sp.assignedToId ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Everyone</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.fullName}</option>
          ))}
        </select>
        <select name="sourceKey" defaultValue={sp.sourceKey ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Any source</option>
          {sourceList.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <select name="propertyKind" defaultValue={sp.propertyKind ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Any property type</option>
          <option value="residential">Residential</option>
          <option value="commercial">Commercial</option>
        </select>
        <select name="city" defaultValue={sp.city ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Any city</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button type="submit" className="rounded-[10px] bg-pine-600 px-4 py-2 text-sm font-medium text-white hover:bg-pine-700">
          Apply
        </button>
      </form>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total leads" value={leadStats.total} href="/admin/leads" />
        <Kpi label="New" value={leadStats.status.new ?? 0} href="/admin/leads?status=new" />
        <Kpi label="Qualified" value={leadStats.status.qualified ?? 0} href="/admin/leads?status=qualified" />
        <Kpi label="Hot" value={leadStats.hot} href="/admin/leads?priority=hot" />
        <Kpi label="Need follow-up" value={leadStats.needsFollowUp} href="/admin/followups?scope=all" alert={leadStats.needsFollowUp > 0} />
        <Kpi label="Unassigned" value={leadStats.unassigned} href="/admin/leads" alert={leadStats.unassigned > 0} />
        <Kpi label="Site visits" value={(leadStats.status.site_visited ?? 0) + (leadStats.status.site_visit_scheduled ?? 0)} href="/admin/leads?status=site_visit_scheduled" />
        <Kpi label="Negotiation" value={leadStats.status.negotiation ?? 0} href="/admin/leads?status=negotiation" />
        <Kpi label="Closed won" value={won} href="/admin/leads?status=closed_won" />
        <Kpi label="Closed lost" value={leadStats.status.closed_lost ?? 0} href="/admin/leads?status=closed_lost" />
        <Kpi label="Pipeline value" value={inr(leadStats.pipelineValue)} href="/admin/leads/pipeline" />
        <Kpi label="Average deal" value={inr(avgDeal)} href="/admin/leads?status=closed_won" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Conversion funnel">
          <ul className="flex flex-col gap-3">
            {funnel.map((step, i) => {
              const width = funnel[0].value > 0 ? (step.value / funnel[0].value) * 100 : 0;
              return (
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
                      style={{ width: `${Math.max(width, step.value > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-stone-500">
            Each row counts leads that reached that stage or moved past it, so
            progress never reduces an earlier stage.
          </p>
        </Card>

        <Card title="Inventory">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Mini label="Total" value={propertyStats.total} />
            <Mini label="Published" value={propertyStats.status.published ?? 0} />
            <Mini label="Draft" value={propertyStats.status.draft ?? 0} />
            <Mini label="Reserved" value={propertyStats.status.reserved ?? 0} />
            <Mini label="Sold" value={propertyStats.status.sold ?? 0} />
            <Mini label="Rented" value={propertyStats.status.rented ?? 0} />
          </div>
          <dl className="mt-5 flex flex-col gap-2 border-t border-stone-200 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-500">Total asking value</dt>
              <dd className="mono text-stone-900">{inr(propertyStats.askingValue)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Live on site</dt>
              <dd className="mono text-stone-900">{inr(propertyStats.liveValue)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Closed value</dt>
              <dd className="mono text-stone-900">{inr(leadStats.wonValue)}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Lead sources">
          {sources.length === 0 ? (
            <p className="text-sm text-stone-500">No leads in this range.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {sources.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-stone-700">{s.label}</span>
                  <span className="text-stone-500">
                    {s.total}
                    {s.won > 0 && (
                      <span className="ml-2 text-xs text-pine-700">{s.won} won</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Properties generating interest">
          {topProperties.length === 0 ? (
            <p className="text-sm text-stone-500">No enquiries recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {topProperties.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/admin/properties/${p.id}`} className="text-stone-700 hover:text-pine-700">
                    {p.name}
                    <span className="ml-2 text-xs text-stone-400">{p.locality}</span>
                  </Link>
                  <span className="text-stone-500">{p.leadCount}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-stone-900">Employee performance</h2>
          {performance.length === 0 ? (
            <Card><p className="text-sm text-stone-500">No assigned leads in this range.</p></Card>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th>Leads</Th>
                  <Th>Active</Th>
                  <Th>Won</Th>
                  <Th>Lost</Th>
                  <Th>Win rate</Th>
                </tr>
              </thead>
              <tbody>
                {performance.map((row) => {
                  const closed = row.won + row.lost;
                  return (
                    <tr key={row.id} className="hover:bg-stone-50">
                      <Td className="font-medium text-stone-900">{row.name}</Td>
                      <Td>{row.total}</Td>
                      <Td>{row.active}</Td>
                      <Td>{row.won}</Td>
                      <Td>{row.lost}</Td>
                      <Td>{closed > 0 ? `${Math.round((row.won / closed) * 100)}%` : "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-stone-500">
        Status counts cover leads created in the selected range.
        &ldquo;Need follow-up&rdquo; is current across all time — an old lead
        without a next step still needs calling.
      </p>
    </>
  );
}

function Kpi({
  label,
  value,
  href,
  alert,
}: {
  label: string;
  value: number | string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "rounded-[14px] border bg-white p-4 shadow-soft transition hover:border-pine-300",
        alert ? "border-[var(--color-danger)]/40" : "border-stone-200",
      )}
    >
      <span className="block text-2xl font-semibold text-stone-900">{value}</span>
      <span className="mt-0.5 block text-xs text-stone-500">{label}</span>
    </Link>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] bg-stone-50 px-3 py-2">
      <span className="block text-lg font-semibold text-stone-900">{value}</span>
      <span className="block text-[11px] text-stone-500">{label}</span>
    </div>
  );
}
