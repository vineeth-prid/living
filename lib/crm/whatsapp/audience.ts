import { and, desc, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, whatsappContacts } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { leadFilterClause, type LeadFilters } from "@/lib/leads.admin";
import { normalisePhone } from "@/lib/phone";
import type { SessionUser } from "@/lib/auth/session";

// §B2/§B4. Who a broadcast goes to, and — more importantly — who it does not.
//
// Three things are decided here and nowhere else: the filter is the same one
// the leads list uses, a number that opted out is never a recipient, and a
// number appearing twice is one recipient. Doing any of that in the UI would
// mean the rule held only for the one screen that remembered it.

/**
 * A ceiling on one broadcast.
 *
 * Not a performance number — at the gateway's 20 a minute a list this long
 * already takes over two hours. It is there so a mis-set filter cannot turn
 * into a send to the entire database before anyone has read the preview.
 */
export const MAX_AUDIENCE = Number(process.env.WHATSAPP_MAX_AUDIENCE ?? 2_000);

/** The filter presets the composer offers. "Customers" is not a lead status. */
export const AUDIENCE_PRESETS = {
  all: {
    label: "Everyone",
    help: "Every lead on file, whatever stage they are at.",
    filters: {} as LeadFilters,
  },
  customers: {
    label: "Customers",
    help: "Leads that closed — people who have actually bought or rented.",
    // There is no customers table: a customer is a lead that reached
    // closed_won. Spelling that out here keeps the composer honest about what
    // it is selecting, instead of inventing a word the CRM does not use.
    filters: { status: "closed_won" } as LeadFilters,
  },
  active: {
    label: "Active pipeline",
    help: "Qualified and beyond — not raw enquiries, not closed.",
    filters: { status: "qualified" } as LeadFilters,
  },
  hot: {
    label: "Hot leads",
    help: "Everything marked hot, at any stage.",
    filters: { priority: "hot" } as LeadFilters,
  },
} as const;

export type AudiencePreset = keyof typeof AUDIENCE_PRESETS;

export type Candidate = {
  leadId: string;
  name: string;
  reference: string;
  /** Canonical E.164 without the plus, or null when the number is unusable. */
  phoneNumber: string | null;
  status: string;
  priority: string;
  city: string | null;
  /** Set when this one will NOT be messaged, and why. */
  excluded: string | null;
};

export type Row = {
  leadId: string;
  name: string;
  reference: string;
  mobile: string;
  status: string;
  priority: string;
  city: string | null;
};

const candidateColumns = {
  leadId: leads.id,
  name: leads.name,
  reference: leads.reference,
  mobile: leads.mobile,
  status: leads.status,
  priority: leads.priority,
  city: leads.city,
};

/**
 * Everyone the filter matches, each marked with whether they can be messaged.
 *
 * Excluded candidates are returned rather than dropped. The operator needs to
 * see "412 selected, 9 opted out, 3 bad numbers" before sending — a list that
 * silently shrinks between the preview and the send is one nobody can check.
 */
export async function audienceCandidates(
  user: SessionUser,
  filters: LeadFilters,
  { limit = MAX_AUDIENCE }: { limit?: number } = {},
): Promise<Candidate[]> {
  const rows = await db()
    .select(candidateColumns)
    .from(leads)
    // Paging is deliberately absent: an audience is sent to in one piece, so
    // it is read in one piece. MAX_AUDIENCE is what keeps that bounded.
    .where(leadFilterClause(user, { ...filters, page: 1 }))
    .orderBy(desc(leads.createdAt))
    .limit(limit);

  return markExclusions(rows);
}

/** The same marking, for a hand-picked list of lead ids. */
export async function candidatesByIds(
  user: SessionUser,
  leadIds: string[],
): Promise<Candidate[]> {
  if (leadIds.length === 0) return [];

  const rows = await db()
    .select(candidateColumns)
    .from(leads)
    // §40: scoped through the same clause, so an employee hand-posting lead
    // ids they cannot see gets nothing back rather than a broadcast to them.
    .where(
      and(
        leadFilterClause(user, {}),
        inArray(leads.id, leadIds.slice(0, MAX_AUDIENCE)),
      ),
    )
    .orderBy(desc(leads.createdAt));

  return markExclusions(rows);
}

async function markExclusions(rows: Row[]): Promise<Candidate[]> {
  const normalised = rows.map((row) => ({
    row,
    phone: normalisePhone(row.mobile),
  }));

  const numbers = [
    ...new Set(
      normalised
        .map((entry) => entry.phone?.phoneNumber)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  // One query for the whole list. Checking per candidate would be a query per
  // lead, which on a 2,000-person audience is the page timing out.
  const blocked = await (numbers.length === 0
    ? Promise.resolve([] as { phoneNumber: string }[])
    : db()
        .select({ phoneNumber: whatsappContacts.phoneNumber })
        .from(whatsappContacts)
        .where(
          and(
            inArray(whatsappContacts.phoneNumber, numbers),
            // Either switch excludes them, for different reasons — see the
            // column comments on whatsapp_contacts.
            sql`(${whatsappContacts.marketingOptOutAt} is not null or ${whatsappContacts.isAllowed} = false)`,
          ),
        ));

  return classify(rows, new Set(blocked.map((contact) => contact.phoneNumber)));
}

/**
 * The exclusion rules themselves, with the opted-out set handed in.
 *
 * Split out from the query above so the rules can be checked without a
 * database — see scripts/check-broadcast.ts. These three decisions are the
 * whole reason this file exists, and "it looked right" is not how you want to
 * find out that the dedupe stopped working on a Friday afternoon.
 */
export function classify(rows: Row[], optedOut: Set<string>): Candidate[] {
  // First occurrence of a number wins. Two leads sharing a mobile — a couple
  // enquiring separately, a duplicate nobody merged — is one WhatsApp chat,
  // and sending twice into it is the thing that reads as spam.
  const seen = new Set<string>();

  return rows.map((row) => {
    const phone = normalisePhone(row.mobile);
    let excluded: string | null = null;

    if (!phone) excluded = NO_NUMBER;
    else if (optedOut.has(phone.phoneNumber)) excluded = OPTED_OUT;
    else if (seen.has(phone.phoneNumber)) excluded = DUPLICATE;
    else seen.add(phone.phoneNumber);

    return {
      leadId: row.leadId,
      name: row.name,
      reference: row.reference,
      phoneNumber: phone?.phoneNumber ?? null,
      status: row.status,
      priority: row.priority,
      city: row.city,
      excluded,
    };
  });
}

// Exclusion reasons are stored on the recipient row and counted in the
// summary, so they are constants rather than three string literals that have
// to keep agreeing with each other.
export const OPTED_OUT = "Opted out";
export const NO_NUMBER = "No usable WhatsApp number";
export const DUPLICATE = "Duplicate number";

/** Counts for the preview line. */
export function summarise(candidates: Candidate[]) {
  return {
    total: candidates.length,
    sendable: candidates.filter((c) => !c.excluded).length,
    optedOut: candidates.filter((c) => c.excluded === OPTED_OUT).length,
    unusable: candidates.filter((c) => c.excluded === NO_NUMBER).length,
    duplicates: candidates.filter((c) => c.excluded === DUPLICATE).length,
  };
}

/**
 * §B4. Recording an opt-out, from a STOP reply or from the panel.
 *
 * Upserts, because someone can ask to be left alone before Living has ever
 * stored a contact row for them — and that request has to stick either way.
 */
export async function setMarketingOptOut(
  phoneNumber: string,
  optedOut: boolean,
): Promise<void> {
  const phone = normalisePhone(phoneNumber);
  if (!phone) return;

  const at = optedOut ? new Date() : null;

  await db()
    .insert(whatsappContacts)
    .values({
      id: newId(),
      phoneNumber: phone.phoneNumber,
      nationalDigits: phone.nationalDigits,
      marketingOptOutAt: at,
    })
    .onConflictDoUpdate({
      target: whatsappContacts.phoneNumber,
      set: { marketingOptOutAt: at, updatedAt: new Date() },
    });
}

/** Everyone currently opted out, for the panel to show and undo. */
export async function optedOutContacts() {
  return db()
    .select({
      id: whatsappContacts.id,
      phoneNumber: whatsappContacts.phoneNumber,
      displayName: whatsappContacts.displayName,
      optedOutAt: whatsappContacts.marketingOptOutAt,
    })
    .from(whatsappContacts)
    .where(
      and(
        isNotNull(whatsappContacts.marketingOptOutAt),
        // Staff are not a marketing audience, so they are never in this list.
        isNull(whatsappContacts.employeeId),
      ),
    )
    .orderBy(desc(whatsappContacts.marketingOptOutAt))
    .limit(100);
}

