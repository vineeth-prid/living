import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "./db";
import {
  leadActivities,
  leadFollowups,
  leadNotes,
  leadProperties,
  leadSources,
  leadTypes,
  leads,
  properties,
  users,
  type LeadPriority,
  type LeadStatus,
} from "./db/schema";
import type { SessionUser } from "./auth/session";

export const LEAD_PAGE_SIZE = 25;

/**
 * §23 — the scope an employee is allowed to see, expressed as SQL.
 *
 * Every lead read goes through this. Returning `undefined` for admins means
 * "no extra restriction"; for employees it restricts to leads assigned to them
 * or created by them, so a guessed lead id in the URL resolves to nothing.
 */
export function visibleTo(user: SessionUser) {
  if (user.role === "admin") return undefined;
  return or(
    eq(leads.assignedToId, user.id),
    eq(leads.createdById, user.id),
  );
}

export type LeadFilters = {
  q?: string;
  status?: string;
  priority?: string;
  assignedToId?: string;
  typeKey?: string;
  sourceKey?: string;
  propertyKind?: string;
  city?: string;
  budgetMin?: number;
  budgetMax?: number;
  createdFrom?: string;
  createdTo?: string;
  followUpBefore?: string;
  mine?: boolean;
  page?: number;
};

function filterClause(user: SessionUser, f: LeadFilters) {
  return and(
    isNull(leads.deletedAt),
    visibleTo(user),
    f.mine ? eq(leads.assignedToId, user.id) : undefined,
    f.status && f.status !== "all"
      ? eq(leads.status, f.status as LeadStatus)
      : undefined,
    f.priority ? eq(leads.priority, f.priority as LeadPriority) : undefined,
    // Admin-only filter in practice; an employee passing it can still only
    // narrow within their own scope, never widen it.
    f.assignedToId ? eq(leads.assignedToId, f.assignedToId) : undefined,
    f.typeKey ? eq(leads.typeKey, f.typeKey) : undefined,
    f.sourceKey ? eq(leads.sourceKey, f.sourceKey) : undefined,
    f.propertyKind
      ? eq(leads.propertyKind, f.propertyKind as "residential")
      : undefined,
    f.city ? ilike(leads.city, `%${f.city}%`) : undefined,
    f.budgetMin ? gte(leads.budgetMax, f.budgetMin) : undefined,
    f.budgetMax ? lte(leads.budgetMin, f.budgetMax) : undefined,
    f.createdFrom ? gte(leads.createdAt, new Date(f.createdFrom)) : undefined,
    f.createdTo ? lte(leads.createdAt, new Date(`${f.createdTo}T23:59:59`)) : undefined,
    f.followUpBefore
      ? lte(leads.nextFollowUpAt, new Date(`${f.followUpBefore}T23:59:59`))
      : undefined,
    f.q
      ? or(
          ilike(leads.name, `%${f.q}%`),
          ilike(leads.mobile, `%${f.q}%`),
          ilike(leads.email, `%${f.q}%`),
          ilike(leads.reference, `%${f.q}%`),
        )
      : undefined,
  );
}

const listColumns = {
  id: leads.id,
  reference: leads.reference,
  name: leads.name,
  mobile: leads.mobile,
  email: leads.email,
  status: leads.status,
  priority: leads.priority,
  budgetMin: leads.budgetMin,
  budgetMax: leads.budgetMax,
  city: leads.city,
  sourceKey: leads.sourceKey,
  createdAt: leads.createdAt,
  nextFollowUpAt: leads.nextFollowUpAt,
  lastContactedAt: leads.lastContactedAt,
  assignedToId: leads.assignedToId,
  assignedToName: users.fullName,
};

export async function listLeads(user: SessionUser, f: LeadFilters) {
  const page = Math.max(1, f.page ?? 1);
  const where = filterClause(user, f);

  const rows = await db()
    .select(listColumns)
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedToId))
    .where(where)
    .orderBy(desc(leads.createdAt))
    .limit(LEAD_PAGE_SIZE)
    .offset((page - 1) * LEAD_PAGE_SIZE);

  const [{ total }] = await db().select({ total: count() }).from(leads).where(where);

  return {
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / LEAD_PAGE_SIZE)),
  };
}

/**
 * Pipeline board (§28). Capped per column — a board that tries to render every
 * lead in NEW stops being usable long before it stops being slow.
 */
export const PIPELINE_COLUMN_LIMIT = 50;

export async function pipelineLeads(user: SessionUser, f: LeadFilters) {
  const where = filterClause(user, f);

  const rows = await db()
    .select({
      ...listColumns,
      // One property label per card, without a second round trip per lead.
      propertyName: sql<string | null>`(
        select p.name from ${leadProperties} lp
        join ${properties} p on p.id = lp.property_id
        where lp.lead_id = ${leads.id}
        order by lp.created_at desc
        limit 1
      )`,
      rank: sql<number>`row_number() over (
        partition by ${leads.status}
        order by ${leads.priority} = 'hot' desc, ${leads.createdAt} desc
      )`,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedToId))
    .where(where);

  const totals = await db()
    .select({ status: leads.status, total: count() })
    .from(leads)
    .where(where)
    .groupBy(leads.status);

  return {
    cards: rows.filter((r) => r.rank <= PIPELINE_COLUMN_LIMIT),
    totals: Object.fromEntries(totals.map((t) => [t.status, t.total])) as Record<
      string,
      number
    >,
  };
}

/** Full lead workspace (§27). Returns null when the viewer may not see it. */
export async function getLead(user: SessionUser, id: string) {
  const [lead] = await db()
    .select({
      lead: leads,
      assignedToName: users.fullName,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedToId))
    .where(and(eq(leads.id, id), isNull(leads.deletedAt), visibleTo(user)))
    .limit(1);

  if (!lead) return null;

  const [linked, notes, activities, followups] = await Promise.all([
    db()
      .select({
        id: leadProperties.id,
        propertyId: properties.id,
        name: properties.name,
        reference: properties.reference,
        locality: properties.locality,
        priceLabel: properties.priceLabel,
        note: leadProperties.note,
      })
      .from(leadProperties)
      .innerJoin(properties, eq(properties.id, leadProperties.propertyId))
      .where(eq(leadProperties.leadId, id))
      .orderBy(desc(leadProperties.createdAt)),

    db()
      .select({
        id: leadNotes.id,
        body: leadNotes.body,
        kind: leadNotes.kind,
        createdAt: leadNotes.createdAt,
        authorName: users.fullName,
      })
      .from(leadNotes)
      .leftJoin(users, eq(users.id, leadNotes.authorId))
      .where(eq(leadNotes.leadId, id))
      .orderBy(desc(leadNotes.createdAt)),

    db()
      .select({
        id: leadActivities.id,
        kind: leadActivities.kind,
        summary: leadActivities.summary,
        fromValue: leadActivities.fromValue,
        toValue: leadActivities.toValue,
        createdAt: leadActivities.createdAt,
        actorName: users.fullName,
      })
      .from(leadActivities)
      .leftJoin(users, eq(users.id, leadActivities.actorId))
      .where(eq(leadActivities.leadId, id))
      .orderBy(desc(leadActivities.createdAt))
      .limit(100),

    db()
      .select({
        id: leadFollowups.id,
        dueAt: leadFollowups.dueAt,
        kind: leadFollowups.kind,
        status: leadFollowups.status,
        notes: leadFollowups.notes,
        completedAt: leadFollowups.completedAt,
        assignedToName: users.fullName,
      })
      .from(leadFollowups)
      .leftJoin(users, eq(users.id, leadFollowups.assignedToId))
      .where(eq(leadFollowups.leadId, id))
      .orderBy(asc(leadFollowups.dueAt)),
  ]);

  return {
    ...lead.lead,
    assignedToName: lead.assignedToName,
    properties: linked,
    notes,
    activities,
    followups,
  };
}

export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLead>>>;

/** Follow-ups for the "My follow-ups" view (§26). */
export async function followupsFor(
  user: SessionUser,
  scope: "mine" | "all",
  status = "pending",
) {
  const restrictToUser =
    scope === "mine" || user.role !== "admin"
      ? eq(leadFollowups.assignedToId, user.id)
      : undefined;

  return db()
    .select({
      id: leadFollowups.id,
      dueAt: leadFollowups.dueAt,
      kind: leadFollowups.kind,
      status: leadFollowups.status,
      notes: leadFollowups.notes,
      leadId: leads.id,
      leadName: leads.name,
      leadReference: leads.reference,
      leadStatus: leads.status,
      leadPriority: leads.priority,
      leadMobile: leads.mobile,
      assignedToName: users.fullName,
    })
    .from(leadFollowups)
    .innerJoin(leads, eq(leads.id, leadFollowups.leadId))
    .leftJoin(users, eq(users.id, leadFollowups.assignedToId))
    .where(
      and(
        status === "all" ? undefined : eq(leadFollowups.status, status),
        restrictToUser,
        isNull(leads.deletedAt),
      ),
    )
    .orderBy(asc(leadFollowups.dueAt))
    .limit(200);
}

export async function employeeOptions() {
  return db()
    .select({ id: users.id, fullName: users.fullName, role: users.role })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.fullName));
}

export async function leadTypeOptions() {
  return db()
    .select()
    .from(leadTypes)
    .where(eq(leadTypes.isActive, true))
    .orderBy(asc(leadTypes.sortOrder), asc(leadTypes.label));
}

export async function leadSourceOptions() {
  return db()
    .select()
    .from(leadSources)
    .where(eq(leadSources.isActive, true))
    .orderBy(asc(leadSources.sortOrder), asc(leadSources.label));
}

/** Counts for the employee workspace (§35) — operational, not managerial. */
export async function workspaceSummary(user: SessionUser) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const mine = and(isNull(leads.deletedAt), eq(leads.assignedToId, user.id));

  const [[assigned], [fresh], [dueToday], [overdue], recent] = await Promise.all([
    db().select({ total: count() }).from(leads).where(mine),
    db()
      .select({ total: count() })
      .from(leads)
      .where(and(mine, eq(leads.status, "new"))),
    db()
      .select({ total: count() })
      .from(leadFollowups)
      .where(
        and(
          eq(leadFollowups.assignedToId, user.id),
          eq(leadFollowups.status, "pending"),
          gte(leadFollowups.dueAt, startOfDay),
          lte(leadFollowups.dueAt, endOfDay),
        ),
      ),
    db()
      .select({ total: count() })
      .from(leadFollowups)
      .where(
        and(
          eq(leadFollowups.assignedToId, user.id),
          eq(leadFollowups.status, "pending"),
          lte(leadFollowups.dueAt, startOfDay),
        ),
      ),
    db()
      .select(listColumns)
      .from(leads)
      .leftJoin(users, eq(users.id, leads.assignedToId))
      .where(mine)
      .orderBy(desc(leads.updatedAt))
      .limit(8),
  ]);

  return {
    assigned: assigned?.total ?? 0,
    fresh: fresh?.total ?? 0,
    dueToday: dueToday?.total ?? 0,
    overdue: overdue?.total ?? 0,
    recent,
  };
}

/** Upcoming site visits for the workspace. */
export async function upcomingSiteVisits(user: SessionUser) {
  return db()
    .select({
      id: leadFollowups.id,
      dueAt: leadFollowups.dueAt,
      leadId: leads.id,
      leadName: leads.name,
      leadMobile: leads.mobile,
    })
    .from(leadFollowups)
    .innerJoin(leads, eq(leads.id, leadFollowups.leadId))
    .where(
      and(
        eq(leadFollowups.assignedToId, user.id),
        eq(leadFollowups.kind, "site_visit"),
        eq(leadFollowups.status, "pending"),
      ),
    )
    .orderBy(asc(leadFollowups.dueAt))
    .limit(8);
}

/** Property picker options, scoped to nothing sensitive. */
export async function propertyPickerOptions(query?: string) {
  return db()
    .select({
      id: properties.id,
      name: properties.name,
      reference: properties.reference,
      locality: properties.locality,
      priceLabel: properties.priceLabel,
    })
    .from(properties)
    .where(
      and(
        isNull(properties.deletedAt),
        query
          ? or(
              ilike(properties.name, `%${query}%`),
              ilike(properties.reference, `%${query}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(properties.createdAt))
    .limit(50);
}

export async function leadsByIds(ids: string[]) {
  if (!ids.length) return [];
  return db()
    .select({ id: leads.id, name: leads.name })
    .from(leads)
    .where(inArray(leads.id, ids));
}
