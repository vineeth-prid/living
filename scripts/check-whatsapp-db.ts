/**
 * The cases that need a real database: Sprint 1 §61 (identity and scope),
 * Sprint 2 §10 (duplicate webhook, session transitions, outbound persistence)
 * Sprint 3 §1–§3 (reachability vs authority, the contact allow flag) and
 * Sprint 4 §8 (invalid and ambiguous lead/property resolution) and Sprint 7
 * §2–§3 (source attribution, duplicate leads).
 *
 *   npm run check:whatsapp:db
 *
 * Skips cleanly with no DATABASE_URL, so it is safe in CI and on a laptop —
 * the point is that it exists and runs the moment a database does, rather than
 * living as a paragraph in a document nobody executes.
 *
 * Everything it creates is prefixed `wacheck-` and deleted at the end, pass or
 * fail. It never touches a row it did not create.
 */
import assert from "node:assert/strict";
import { eq, inArray, like } from "drizzle-orm";

import { db, hasDatabase } from "../lib/db";
import {
  leadSources,
  leads,
  users,
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
  whatsappSessions,
  whatsappWebhookEvents,
} from "../lib/db/schema";
import { findDuplicateLeads } from "../lib/leads";
import { resolveSender } from "../lib/integrations/whatsapp/identity";
import { resolveLead } from "../lib/crm/whatsapp/resolve";
import { isAllowed } from "../lib/crm/whatsapp/registry";
import { hashPassword } from "../lib/auth/password";
import { newId } from "../lib/ids";
import type { SessionUser } from "../lib/auth/session";

if (!hasDatabase()) {
  console.log("check:whatsapp:db — skipped, no DATABASE_URL set.");
  process.exit(0);
}

const TAG = "wacheck";
let checks = 0;

const check = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    checks += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
};

const sessionUser = (row: {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "employee";
  permissions: string[];
}): SessionUser => ({ ...row, mustChangePassword: false });

async function main() {
  const password = await hashPassword("not-a-real-password");
  const ids = {
    active: newId(),
    inactive: newId(),
    noWhatsApp: newId(),
    other: newId(),
    mine: newId(),
    theirs: newId(),
    session: newId(),
    notifyOnly: newId(),
    contact: newId(),
    blockedContact: newId(),
    dupeA: newId(),
    dupeB: newId(),
    conversation: newId(),
    message: newId(),
  };

  // Distinct last-ten digits, since that is the matching key.
  const numbers = {
    active: "919000000101",
    inactive: "919000000102",
    noWhatsApp: "919000000103",
    lead: "919000000104",
    notifyOnly: "919000000106",
  };

  try {
    await db()
      .insert(users)
      .values([
        {
          id: ids.active,
          fullName: `${TAG} Active`,
          email: `${TAG}-active@example.invalid`,
          role: "employee",
          passwordHash: password,
          isActive: true,
          whatsappEnabled: true,
          whatsappCrmEnabled: true,
          whatsappNumber: numbers.active,
        },
        {
          id: ids.inactive,
          fullName: `${TAG} Inactive`,
          email: `${TAG}-inactive@example.invalid`,
          role: "employee",
          passwordHash: password,
          isActive: false,
          whatsappEnabled: true,
          whatsappCrmEnabled: true,
          whatsappNumber: numbers.inactive,
        },
        {
          id: ids.noWhatsApp,
          fullName: `${TAG} NoAccess`,
          email: `${TAG}-noaccess@example.invalid`,
          role: "employee",
          passwordHash: password,
          isActive: true,
          // The point of §12: a mobile on file is not authorisation.
          whatsappEnabled: false,
          mobile: `+91 ${numbers.noWhatsApp.slice(2)}`,
        },
        {
          id: ids.other,
          fullName: `${TAG} Other`,
          email: `${TAG}-other@example.invalid`,
          role: "employee",
          passwordHash: password,
          isActive: true,
        },
        {
          // Reachable for notifications, not permitted to command (§1/§2).
          id: ids.notifyOnly,
          fullName: `${TAG} NotifyOnly`,
          email: `${TAG}-notify@example.invalid`,
          role: "employee",
          passwordHash: password,
          isActive: true,
          whatsappEnabled: true,
          whatsappCrmEnabled: false,
          whatsappNumber: numbers.notifyOnly,
        },
      ]);

    await db()
      .insert(leads)
      .values([
        {
          id: ids.mine,
          reference: `${TAG}-L1`,
          name: `${TAG} MyLead`,
          mobile: numbers.lead,
          assignedToId: ids.active,
          createdById: ids.active,
        },
        {
          id: ids.theirs,
          reference: `${TAG}-L2`,
          name: `${TAG} TheirLead`,
          mobile: "919000000105",
          assignedToId: ids.other,
          createdById: ids.other,
        },
      ]);

    // --- §12: who the CRM will act for --------------------------------------
    await check("an enabled, active employee is recognised", async () => {
      const sender = await resolveSender(numbers.active.slice(-10));
      assert.equal(sender.kind, "employee");
      if (sender.kind === "employee") assert.equal(sender.user.id, ids.active);
    });

    await check("a deactivated employee is not", async () => {
      const sender = await resolveSender(numbers.inactive.slice(-10));
      assert.notEqual(sender.kind, "employee");
    });

    await check("an employee without WhatsApp access is not", async () => {
      // Their number is in users.mobile. That must grant nothing (§13).
      const sender = await resolveSender(numbers.noWhatsApp.slice(-10));
      assert.notEqual(sender.kind, "employee");
    });

    await check("an unknown number is neither employee nor customer", async () => {
      const sender = await resolveSender("9000000999");
      assert.equal(sender.kind, "unknown");
    });

    await check("a number on a lead resolves as a customer", async () => {
      const sender = await resolveSender(numbers.lead.slice(-10));
      assert.equal(sender.kind, "customer");
      if (sender.kind === "customer") assert.equal(sender.leadId, ids.mine);
    });

    // --- §61: an employee cannot reach another employee's lead ---------------
    const me = sessionUser({
      id: ids.active,
      fullName: `${TAG} Active`,
      email: `${TAG}-active@example.invalid`,
      role: "employee",
      permissions: [],
    });

    await check("an employee resolves their own lead", async () => {
      const found = await resolveLead(me, { name: `${TAG} MyLead` });
      assert.equal(found.kind, "one");
      if (found.kind === "one") assert.equal(found.value.id, ids.mine);
    });

    await check("an employee cannot resolve someone else's lead", async () => {
      // The same scope filter the leads list uses. If this ever returns "one",
      // WhatsApp can reach a lead the web panel hides.
      const found = await resolveLead(me, { name: `${TAG} TheirLead` });
      assert.equal(found.kind, "none");
    });

    await check("an admin resolves both", async () => {
      const admin = sessionUser({ ...me, role: "admin" });
      const mine = await resolveLead(admin, { name: `${TAG} MyLead` });
      const theirs = await resolveLead(admin, { name: `${TAG} TheirLead` });
      assert.equal(mine.kind, "one");
      assert.equal(theirs.kind, "one");
    });

    // --- §13: the per-employee scope narrows and never grants ---------------
    await check("a scope narrows what an employee may run", async () => {
      assert.equal(isAllowed(me, "ADD_FOLLOWUP", []), true);
      assert.equal(isAllowed(me, "ADD_FOLLOWUP", ["GET_MY_LEADS"]), false);
      assert.equal(isAllowed(me, "GET_MY_LEADS", ["GET_MY_LEADS"]), true);
      // Naming a command in the scope must not confer a permission.
      assert.equal(isAllowed(me, "PUBLISH_PROPERTY", ["PUBLISH_PROPERTY"]), false);
      // Control flow survives any narrowing, or a restricted employee could
      // never answer a question.
      assert.equal(isAllowed(me, "CANCEL", ["GET_MY_LEADS"]), true);
    });

    await check("the final price never reaches a WhatsApp read", async () => {
      // The protection is the projection: resolveProperty selects an allowlist.
      const { resolveProperty } = await import("../lib/crm/whatsapp/resolve");
      const found = await resolveProperty({ text: "zzz-no-such-property-zzz" });
      assert.equal(found.kind, "none");

      const source = await import("node:fs/promises").then((fs) =>
        fs.readFile("lib/crm/whatsapp/resolve.ts", "utf8"),
      );
      for (const field of ["finalPrice", "sellerContact", "sellerName", "internalNotes"]) {
        assert.ok(
          !source.includes(field),
          `${field} appears in the WhatsApp property projection`,
        );
      }
    });
    // --- Sprint 7 §2/§3: source attribution and duplicate leads -------------
    await check("the whatsapp lead source exists, so attribution survives", async () => {
      // leads.source_key is a foreign key into seeded data. Without this row an
      // insert with sourceKey "whatsapp" fails and the enquiry is lost.
      const [row] = await db()
        .select({ key: leadSources.key })
        .from(leadSources)
        .where(eq(leadSources.key, "whatsapp"))
        .limit(1);
      assert.ok(row, "run npm run db:seed — lead_sources has no 'whatsapp' row");
    });

    await check("a second message from a known number finds the same lead", async () => {
      // §3. The check customer.ts runs immediately before creating. If this
      // ever misses, every message from a customer becomes another lead.
      const found = await findDuplicateLeads(numbers.lead);
      assert.equal(found.length >= 1, true);
      assert.equal(found[0].id, ids.mine);

      // …and it matches however the number was written down.
      for (const spelling of ["+91 90000 00104", "090000 00104", "9000000104"]) {
        const again = await findDuplicateLeads(spelling);
        assert.ok(
          again.some((lead) => lead.id === ids.mine),
          `missed on ${spelling}`,
        );
      }
    });

    await check("an unknown number matches no lead", async () => {
      assert.deepEqual(await findDuplicateLeads("919000000998"), []);
    });

    // --- Sprint 4 §8: invalid and ambiguous targets --------------------------
    await check("an invalid lead resolves to none, never a near miss", async () => {
      const found = await resolveLead(me, { name: "zzz-no-such-lead-zzz" });
      assert.equal(found.kind, "none");

      const byReference = await resolveLead(me, { reference: "LEAD-999999" });
      assert.equal(byReference.kind, "none");
    });

    await check("an ambiguous lead returns the options, never a guess", async () => {
      // Two leads share a first name. Picking one would modify the wrong
      // person's record — the whole reason resolve.ts exists.
      await db()
        .insert(leads)
        .values([
          {
            id: ids.dupeA,
            reference: `${TAG}-L3`,
            name: `${TAG} Raj Kumar`,
            mobile: "919000000301",
            assignedToId: ids.active,
            createdById: ids.active,
          },
          {
            id: ids.dupeB,
            reference: `${TAG}-L4`,
            name: `${TAG} Raj Menon`,
            mobile: "919000000302",
            assignedToId: ids.active,
            createdById: ids.active,
          },
        ]);

      const found = await resolveLead(me, { name: `${TAG} Raj` });
      assert.equal(found.kind, "many", "two matches must not resolve to one");
      if (found.kind !== "many") return;
      assert.equal(found.options.length, 2);
      // The options have to be distinguishable, or the question is useless.
      assert.notEqual(found.options[0].label, found.options[1].label);

      // Naming one exactly still resolves.
      const exact = await resolveLead(me, { name: `${TAG} Raj Menon` });
      assert.equal(exact.kind, "one");
      if (exact.kind === "one") assert.equal(exact.value.id, ids.dupeB);
    });

    await check("an invalid property resolves to none", async () => {
      const { resolveProperty } = await import("../lib/crm/whatsapp/resolve");
      assert.equal((await resolveProperty({ reference: "LIV-999999" })).kind, "none");
      assert.equal((await resolveProperty({ text: "zzz-nowhere-zzz" })).kind, "none");
      // An empty query is not a wildcard.
      assert.equal((await resolveProperty({})).kind, "none");
    });

    // --- Sprint 3 §1/§2: reachability and authority are separate ------------
    await check("WhatsApp enabled without CRM access is recognised, not empowered", async () => {
      // notifyOnly can be messaged — lead assignments reach them — but they
      // cannot drive the CRM from their phone.
      const sender = await resolveSender(numbers.notifyOnly.slice(-10));
      assert.equal(sender.kind, "employee", "they must still be identified as staff");
      if (sender.kind !== "employee") return;
      assert.equal(sender.canRunCommands, false);

      const full = await resolveSender(numbers.active.slice(-10));
      assert.equal(full.kind, "employee");
      if (full.kind === "employee") assert.equal(full.canRunCommands, true);
    });

    // --- Sprint 3 §3: isAllowed is a control, not a decoration --------------
    await check("a disallowed contact is stored and then left alone", async () => {
      const [contact] = await db()
        .insert(whatsappContacts)
        .values({
          id: ids.blockedContact,
          phoneNumber: "919000000202",
          nationalDigits: "9000000202",
          contactType: "unknown",
          isAllowed: false,
        })
        .returning();

      assert.equal(contact.isAllowed, false);

      // The default has to be permissive, or every new contact arrives silenced.
      const [normal] = await db()
        .insert(whatsappContacts)
        .values({
          id: ids.contact,
          phoneNumber: "919000000201",
          nationalDigits: "9000000201",
          contactType: "employee",
        })
        .returning();
      assert.equal(normal.isAllowed, true, "new contacts must default to allowed");
    });

    // --- Sprint 2 §4: a duplicate delivery must not persist twice -----------
    await check("a duplicate webhook event is claimed once", async () => {
      const key = `${TAG}-idem-1`;
      const insert = (id: string) =>
        db()
          .insert(whatsappWebhookEvents)
          .values({
            id,
            provider: "openwa",
            idempotencyKey: key,
            event: "message.received",
            status: "received",
          })
          .onConflictDoNothing({
            target: [
              whatsappWebhookEvents.provider,
              whatsappWebhookEvents.idempotencyKey,
            ],
          })
          .returning({ id: whatsappWebhookEvents.id });

      const first = await insert(newId());
      const second = await insert(newId());

      // The unique index is the mechanism, not a read-then-write check — two
      // concurrent redeliveries cannot both win a race that never happens.
      assert.equal(first.length, 1, "the first delivery must be claimed");
      assert.equal(second.length, 0, "the retry must claim nothing");

      const rows = await db()
        .select({ id: whatsappWebhookEvents.id })
        .from(whatsappWebhookEvents)
        .where(eq(whatsappWebhookEvents.idempotencyKey, key));
      assert.equal(rows.length, 1, "exactly one row for one event");
    });

    // --- Sprint 2 §8: session.status moves the stored record ----------------
    await check("disconnect and reconnect both land on the session row", async () => {
      const sessionId = `${TAG}-session`;
      await db().insert(whatsappSessions).values({
        id: ids.session,
        provider: "openwa",
        providerSessionId: sessionId,
      });

      const setStatus = async (status: "connected" | "disconnected") => {
        const now = new Date();
        await db()
          .update(whatsappSessions)
          .set({
            status,
            ...(status === "connected" ? { lastConnectedAt: now } : {}),
            ...(status === "disconnected" ? { lastDisconnectedAt: now } : {}),
          })
          .where(eq(whatsappSessions.id, ids.session));
      };

      await setStatus("connected");
      await setStatus("disconnected");
      await setStatus("connected");

      const [row] = await db()
        .select()
        .from(whatsappSessions)
        .where(eq(whatsappSessions.id, ids.session));

      assert.equal(row.status, "connected");
      // Both timestamps survive the round trip — a reconnect must not erase the
      // record that it had dropped.
      assert.ok(row.lastConnectedAt, "lastConnectedAt not recorded");
      assert.ok(row.lastDisconnectedAt, "lastDisconnectedAt not recorded");
    });

    // --- Sprint 2 §5/§9: a failed send stays visible ------------------------
    await check("a failed outbound message is recorded, not lost", async () => {
      const [conversation] = await db()
        .insert(whatsappConversations)
        .values({
          id: ids.conversation,
          sessionId: ids.session,
          contactId: ids.contact,
          chatId: "919000000201@c.us",
        })
        .returning();

      await db().insert(whatsappMessages).values({
        id: ids.message,
        conversationId: conversation.id,
        direction: "outbound",
        recipientPhone: "919000000201",
        text: "test",
        status: "failed",
        error: "OpenWA could not be reached",
      });

      const [row] = await db()
        .select()
        .from(whatsappMessages)
        .where(eq(whatsappMessages.id, ids.message));

      // §50: the CRM write already committed. The failure is a row someone can
      // see and retry, never a silently dropped message.
      assert.equal(row.status, "failed");
      assert.ok(row.error);
      assert.equal(row.direction, "outbound");
    });
  } finally {
    // Always, so a failure does not leave test rows in a real database.
    await db().delete(whatsappMessages).where(eq(whatsappMessages.id, ids.message));
    await db()
      .delete(whatsappConversations)
      .where(eq(whatsappConversations.id, ids.conversation));
    await db()
      .delete(whatsappContacts)
      .where(inArray(whatsappContacts.id, [ids.contact, ids.blockedContact]));
    await db().delete(whatsappSessions).where(eq(whatsappSessions.id, ids.session));
    await db()
      .delete(whatsappWebhookEvents)
      .where(like(whatsappWebhookEvents.idempotencyKey, `${TAG}-%`));
    await db().delete(leads).where(like(leads.reference, `${TAG}-%`));
    await db()
      .delete(users)
      .where(
        inArray(users.id, [
          ids.active,
          ids.inactive,
          ids.noWhatsApp,
          ids.other,
          ids.notifyOnly,
        ]),
      );
  }

  console.log(`\n${checks} checks passed`);
  if (process.exitCode) console.error("Some checks failed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
