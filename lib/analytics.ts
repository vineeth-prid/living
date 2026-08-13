import { and, count, eq, gte, isNull, lte, sql, sum } from "drizzle-orm";
import { db } from "./db";
import {
  leadFollowups,
  leadSources,
  leads,
  properties,
  users,
} from "./db/schema";

// Management reporting (§33). Every function here aggregates in Postgres and
// returns scalars or small groupings — no page ever pulls rows to count them in
// JavaScript.
//
// Callers must be administrators. That is enforced by requireAdmin() in the
// dashboard page, not here, so these stay plain queries.

export type DateRange = { from: Date; to: Date; label: string };

export function resolveRange(
  preset: string | undefined,
  fromParam?: string,
  toParam?: string,
): DateRange {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  switch (preset) {
    case "today":
      return { from, to, label: "Today" };
    case "7d":
      from.setDate(from.getDate() - 6);
      return { from, to, label: "Last 7 days" };
    case "month":
      from.setDate(1);
      return { from, to, label: "This month" };
    case "last_month": {
      const start = new Date();
      start.setDate(1);
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end, label: "Last month" };
    }
    case "custom": {
      if (fromParam && toParam) {
        const start = new Date(fromParam);
        const end = new Date(`${toParam}T23:59:59`);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
          return { from: start, to: end, label: "Custom range" };
        }
      }
      break;
    }
  }

  from.setDate(from.getDate() - 29);
  return { from, to, label: "Last 30 days" };
}

export type DashboardFilters = {
  range: DateRange;
  assignedToId?: string;
  sourceKey?: string;
  propertyKind?: string;
  city?: string;
};

function leadWhere(f: DashboardFilters) {
  return and(
    isNull(leads.deletedAt),
    gte(leads.createdAt, f.range.from),
    lte(leads.createdAt, f.range.to),
    f.assignedToId ? eq(leads.assignedToId, f.assignedToId) : undefined,
    f.sourceKey ? eq(leads.sourceKey, f.sourceKey) : undefined,
    f.propertyKind
      ? eq(leads.propertyKind, f.propertyKind as "residential")
      : undefined,
    f.city ? eq(leads.city, f.city) : undefined,
  );
}

/** Lead KPIs and the status breakdown, in one grouped query. */
export async function leadKpis(f: DashboardFilters) {
  const where = leadWhere(f);

  const [byStatus, [totals], [hot], [needsFollowUp], [unassigned]] =
    await Promise.all([
      db()
        .select({ status: leads.status, total: count() })
        .from(leads)
        .where(where)
        .groupBy(leads.status),

      db()
        .select({
          total: count(),
          closedValue: sum(leads.closedValue),
          pipelineValue: sql<number>`coalesce(sum(
            case when ${leads.status} not in ('closed_won','closed_lost')
            then ${leads.budgetMax} else 0 end
          ), 0)::bigint`,
          wonValue: sql<number>`coalesce(sum(
            case when ${leads.status} = 'closed_won'
            then coalesce(${leads.closedValue}, ${leads.budgetMax}) else 0 end
          ), 0)::bigint`,
        })
        .from(leads)
        .where(where),

      db()
        .select({ total: count() })
        .from(leads)
        .where(and(where, eq(leads.priority, "hot"))),

      // Overdue or unscheduled follow-ups are the actionable number, so this
      // deliberately ignores the date range — old leads still need calling.
      db()
        .select({ total: sql<number>`count(distinct ${leads.id})::int` })
        .from(leads)
        .leftJoin(leadFollowups, eq(leadFollowups.leadId, leads.id))
        .where(
          and(
            isNull(leads.deletedAt),
            sql`${leads.status} not in ('closed_won','closed_lost')`,
            sql`(${leads.nextFollowUpAt} is null or ${leads.nextFollowUpAt} < now())`,
            f.assignedToId ? eq(leads.assignedToId, f.assignedToId) : undefined,
          ),
        ),

      db()
        .select({ total: count() })
        .from(leads)
        .where(and(where, isNull(leads.assignedToId))),
    ]);

  const status = Object.fromEntries(
    byStatus.map((r) => [r.status, r.total]),
  ) as Record<string, number>;

  return {
    total: totals?.total ?? 0,
    status,
    hot: hot?.total ?? 0,
    needsFollowUp: needsFollowUp?.total ?? 0,
    unassigned: unassigned?.total ?? 0,
    pipelineValue: Number(totals?.pipelineValue ?? 0),
    wonValue: Number(totals?.wonValue ?? 0),
  };
}

/**
 * Conversion funnel (§33).
 *
 * Counts leads that reached *at least* each step, not leads sitting on it —
 * otherwise a lead that moved from contacted to negotiation would make the
 * "contacted" conversion look like it fell.
 */
export function funnelFrom(status: Record<string, number>) {
  const order = [
    "new",
    "contacted",
    "qualified",
    "property_matched",
    "site_visit_scheduled",
    "site_visited",
    "negotiation",
    "booking",
    "closed_won",
  ];
  const at = (key: string) => status[key] ?? 0;

  // Everything from this step rightwards, plus closed_lost only where it
  // already passed the step — lost leads still counted toward earlier stages.
  const reached = (index: number) =>
    order.slice(index).reduce((sum, key) => sum + at(key), 0);

  const steps = [
    { key: "new", label: "Leads", value: reached(0) + (status.on_hold ?? 0) + (status.closed_lost ?? 0) },
    { key: "contacted", label: "Contacted", value: reached(1) },
    { key: "qualified", label: "Qualified", value: reached(2) },
    { key: "site_visit_scheduled", label: "Site visit", value: reached(4) },
    { key: "negotiation", label: "Negotiation", value: reached(6) },
    { key: "booking", label: "Booking", value: reached(7) },
    { key: "closed_won", label: "Closed won", value: reached(8) },
  ];

  return steps.map((step, i) => {
    const previous = i === 0 ? step.value : steps[i - 1].value;
    return {
      ...step,
      rate: previous > 0 ? Math.round((step.value / previous) * 100) : 0,
    };
  });
}

/** Where leads come from (§20) — the basis for marketing ROI later. */
export async function sourceBreakdown(f: DashboardFilters) {
  const rows = await db()
    .select({
      sourceKey: leads.sourceKey,
      label: leadSources.label,
      total: count(),
      won: sql<number>`count(*) filter (where ${leads.status} = 'closed_won')::int`,
    })
    .from(leads)
    .leftJoin(leadSources, eq(leadSources.key, leads.sourceKey))
    .where(leadWhere(f))
    .groupBy(leads.sourceKey, leadSources.label)
    .orderBy(sql`count(*) desc`)
    .limit(12);

  return rows.map((r) => ({
    key: r.sourceKey ?? "unknown",
    label: r.label ?? r.sourceKey ?? "Not recorded",
    total: r.total,
    won: r.won,
  }));
}

/** Per-employee performance (§33 employee performance). */
export async function employeePerformance(f: DashboardFilters) {
  return db()
    .select({
      id: users.id,
      name: users.fullName,
      total: count(),
      won: sql<number>`count(*) filter (where ${leads.status} = 'closed_won')::int`,
      lost: sql<number>`count(*) filter (where ${leads.status} = 'closed_lost')::int`,
      active: sql<number>`count(*) filter (where ${leads.status} not in ('closed_won','closed_lost'))::int`,
    })
    .from(leads)
    .innerJoin(users, eq(users.id, leads.assignedToId))
    .where(leadWhere(f))
    .groupBy(users.id, users.fullName)
    .orderBy(sql`count(*) desc`)
    .limit(20);
}

/** Property KPIs — not date-filtered: inventory is a current-state question. */
export async function propertyKpis() {
  const [byStatus, [values]] = await Promise.all([
    db()
      .select({ workflowStatus: properties.workflowStatus, total: count() })
      .from(properties)
      .where(isNull(properties.deletedAt))
      .groupBy(properties.workflowStatus),

    db()
      .select({
        total: count(),
        askingValue: sql<number>`coalesce(sum(${properties.priceValue}), 0)::bigint`,
        liveValue: sql<number>`coalesce(sum(
          case when ${properties.isPublic} then ${properties.priceValue} else 0 end
        ), 0)::bigint`,
      })
      .from(properties)
      .where(isNull(properties.deletedAt)),
  ]);

  const status = Object.fromEntries(
    byStatus.map((r) => [r.workflowStatus, r.total]),
  ) as Record<string, number>;

  return {
    total: values?.total ?? 0,
    status,
    askingValue: Number(values?.askingValue ?? 0),
    liveValue: Number(values?.liveValue ?? 0),
  };
}

/** Which listings are generating interest (§54). */
export async function topPropertiesByInterest(limit = 8) {
  return db()
    .select({
      id: properties.id,
      name: properties.name,
      reference: properties.reference,
      locality: properties.locality,
      leadCount: sql<number>`(
        select count(*) from lead_properties lp where lp.property_id = ${properties.id}
      )::int`,
    })
    .from(properties)
    .where(isNull(properties.deletedAt))
    .orderBy(
      sql`(select count(*) from lead_properties lp where lp.property_id = ${properties.id}) desc`,
    )
    .limit(limit);
}

/** Distinct cities present on leads, for the dashboard filter. */
export async function leadCities() {
  const rows = await db()
    .selectDistinct({ city: leads.city })
    .from(leads)
    .where(isNull(leads.deletedAt));
  return rows.map((r) => r.city).filter((c): c is string => Boolean(c)).sort();
}
