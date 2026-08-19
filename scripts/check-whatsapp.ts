/**
 * The WhatsApp integration's security and parsing boundaries, checked without a
 * database, an Ollama or an OpenWA.
 *
 *   npm run check:whatsapp
 *
 * Same convention as check-security.ts and check-property.ts: plain assertions,
 * no framework. The database-backed cases from §61 — an inactive employee being
 * refused, an employee not reaching another employee's lead — need a live
 * Postgres and are listed in docs/whatsapp.md as a manual pass.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  parseOpenWAWebhook,
  verifySignature,
} from "../lib/integrations/whatsapp/openwa/webhook";
import { maskPhone, normalisePhone } from "../lib/integrations/whatsapp/phone";
import { INTENTS, parseIntentJson } from "../lib/ai/crm-intent/schema";
import {
  COMMANDS,
  helpFor,
  isAllowed,
  missingFields,
} from "../lib/crm/whatsapp/registry";
import {
  COMMAND_EXECUTION_STATUSES,
  whatsappCommandExecutions,
} from "../lib/db/schema";
import { OUTBOUND_RATE } from "../lib/integrations/whatsapp/config";
import { zonedDateTime } from "../lib/crm/whatsapp/time";
import { resolveRelativeDate, scheduleAt } from "../lib/crm/whatsapp/dates";
import { kindFor } from "../lib/crm/whatsapp/media";
import { t } from "../lib/crm/whatsapp/templates";
import { systemHealth } from "../lib/health";
import { openWA } from "../lib/integrations/whatsapp/openwa/client";
import {
  __resetLidCache,
  isLidId,
  resolveLidPhone,
} from "../lib/integrations/whatsapp/openwa/lid";

const SECRET = "s".repeat(64);

let checks = 0;
const pending: Promise<void>[] = [];

const check = (name: string, fn: () => void | Promise<void>) => {
  const run = Promise.resolve()
    .then(fn)
    .then(
      () => {
        checks += 1;
        console.log(`  ok  ${name}`);
      },
      (error) => {
        console.error(`FAIL  ${name}`);
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      },
    );
  pending.push(run);
};

const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

const headersFor = (body: string, overrides: Record<string, string> = {}) =>
  new Headers({ "x-openwa-signature": sign(body), ...overrides });

const envelope = (data: Record<string, unknown>, event = "message.received") =>
  JSON.stringify({
    event,
    timestamp: "2026-08-14T05:00:00Z",
    sessionId: "abc-123",
    idempotencyKey: "idem-1",
    deliveryId: "del-1",
    data,
  });

const TEXT_MESSAGE = {
  id: "3EB0F5A2B4C",
  chatId: "919876543210@c.us",
  from: "919876543210@c.us",
  body: "Show my follow-ups",
  type: "text",
  timestamp: 1_755_140_000,
};

const admin = {
  id: "u1",
  fullName: "Vineeth Kumar",
  email: "v@example.com",
  role: "admin" as const,
  permissions: [],
  mustChangePassword: false,
};
const employee = { ...admin, id: "u2", fullName: "Anitha", role: "employee" as const };

async function main() {
  // --- §5: the signature is the whole boundary ------------------------------
  check("a correctly signed body verifies", () => {
    const body = envelope(TEXT_MESSAGE);
    assert.equal(verifySignature(body, sign(body), SECRET), true);
  });

  check("a tampered body does not verify", () => {
    const body = envelope(TEXT_MESSAGE);
    const signature = sign(body);
    const tampered = body.replace("Show my follow-ups", "Publish LIV-0027");
    assert.equal(verifySignature(tampered, signature, SECRET), false);
  });

  check("a missing, empty or wrong-secret signature is refused", () => {
    const body = envelope(TEXT_MESSAGE);
    assert.equal(verifySignature(body, null, SECRET), false);
    assert.equal(verifySignature(body, "", SECRET), false);
    assert.equal(verifySignature(body, "sha256=deadbeef", SECRET), false);
    assert.equal(verifySignature(body, sign(body, "other-secret"), SECRET), false);
    // No secret configured must never mean "accept anything".
    assert.equal(verifySignature(body, sign(body, ""), ""), false);
  });

  check("an unsigned delivery is rejected before it is parsed", () => {
    const body = envelope(TEXT_MESSAGE);
    const result = parseOpenWAWebhook(body, new Headers(), SECRET);
    assert.ok("rejected" in result, "unsigned payload must not parse");
  });

  check("malformed JSON with a valid signature is still rejected", () => {
    const body = "{not json";
    const result = parseOpenWAWebhook(body, headersFor(body), SECRET);
    assert.ok("rejected" in result && result.rejected.includes("JSON"));
  });

  check("an event with no idempotency key anywhere is rejected", () => {
    // Without one there is nothing to deduplicate on, so a retry would book a
    // second follow-up.
    const body = JSON.stringify({ event: "message.received", data: {} });
    const result = parseOpenWAWebhook(body, headersFor(body), SECRET);
    assert.ok("rejected" in result && result.rejected.includes("idempotency"));
  });

  // --- normalisation --------------------------------------------------------
  check("a text message normalises to Living's shape", () => {
    const body = envelope(TEXT_MESSAGE);
    const result = parseOpenWAWebhook(body, headersFor(body), SECRET);
    assert.ok(!("rejected" in result));
    if ("rejected" in result) return;

    assert.equal(result.idempotencyKey, "idem-1");
    assert.equal(result.provider, "openwa");
    assert.equal(result.message?.fromPhone, "919876543210");
    assert.equal(result.message?.text, "Show my follow-ups");
    // Epoch seconds, not milliseconds — off by a factor of 1000 puts it in 1970.
    assert.equal(result.message?.sentAt.getUTCFullYear(), 2025);
  });

  check("our own echoed messages and group chats are dropped", () => {
    const mine = envelope({ ...TEXT_MESSAGE, fromMe: true });
    const one = parseOpenWAWebhook(mine, headersFor(mine), SECRET);
    assert.ok(!("rejected" in one) && one.message === null, "fromMe must not loop");

    const group = envelope({
      ...TEXT_MESSAGE,
      chatId: "12036304@g.us",
      from: "12036304@g.us",
    });
    const two = parseOpenWAWebhook(group, headersFor(group), SECRET);
    assert.ok(!("rejected" in two) && two.message === null, "group is not a person");
  });

  check("an event for another session is refused", () => {
    // OpenWA is multi-session and a secret can be shared across the sessions on
    // one instance. A correctly signed delivery for somebody else's number must
    // not become Living's traffic — their customers would become Living's leads.
    const body = envelope(TEXT_MESSAGE);
    const mine = parseOpenWAWebhook(body, headersFor(body), SECRET, "abc-123");
    assert.ok(!("rejected" in mine), "our own session must be accepted");

    const theirs = parseOpenWAWebhook(body, headersFor(body), SECRET, "someone-else");
    assert.ok("rejected" in theirs && /different session/.test(theirs.rejected));
  });

  check("an event with no session at all is still accepted", () => {
    // Not every event type carries one; being strict here would drop real
    // deliveries. Strict on a mismatch, lenient on an absence.
    const body = JSON.stringify({
      event: "session.status",
      idempotencyKey: "idem-2",
      data: { status: "connected" },
    });
    const result = parseOpenWAWebhook(body, headersFor(body), SECRET, "abc-123");
    assert.ok(!("rejected" in result));
  });

  check("session.status maps every state OpenWA reports", () => {
    // §8: disconnect and reconnect both have to land somewhere sensible, or the
    // admin page shows "unknown" for ever.
    const cases: [string, string][] = [
      ["connected", "connected"],
      ["authenticated", "connected"],
      ["CONNECTING", "connecting"],
      ["qr", "connecting"],
      ["disconnected", "disconnected"],
      ["logged_out", "disconnected"],
      ["something-new", "unknown"],
    ];
    for (const [reported, expected] of cases) {
      const body = envelope({ status: reported }, "session.status");
      const result = parseOpenWAWebhook(body, headersFor(body), SECRET);
      assert.ok(!("rejected" in result));
      if ("rejected" in result) continue;
      assert.equal(result.sessionStatus, expected, `${reported} → ${result.sessionStatus}`);
    }
  });

  check("a duplicate delivery carries the same idempotency key", () => {
    // The database's unique index does the deduplicating; this pins the half
    // that decides what "the same event" means. A retry keeps idempotencyKey
    // and may change deliveryId, so keying on the delivery would double-book.
    const first = envelope(TEXT_MESSAGE);
    const retry = JSON.stringify({
      ...JSON.parse(first),
      deliveryId: "del-2",
      timestamp: "2026-08-14T05:00:09Z",
    });

    const a = parseOpenWAWebhook(first, headersFor(first), SECRET);
    const b = parseOpenWAWebhook(retry, headersFor(retry), SECRET);
    assert.ok(!("rejected" in a) && !("rejected" in b));
    if ("rejected" in a || "rejected" in b) return;
    assert.equal(a.idempotencyKey, b.idempotencyKey);
    assert.notEqual(a.deliveryId, b.deliveryId);
  });

  check("a session.status event carries a status and no message", () => {
    const body = envelope({ status: "disconnected" }, "session.status");
    const result = parseOpenWAWebhook(body, headersFor(body), SECRET);
    assert.ok(!("rejected" in result));
    if ("rejected" in result) return;
    assert.equal(result.sessionStatus, "disconnected");
    assert.equal(result.message, null);
  });

  // --- phone numbers --------------------------------------------------------
  check("every spelling of one number lands on the same canonical form", () => {
    for (const input of [
      "919876543210@c.us",
      "+91 98765 43210",
      "09876543210",
      "9876543210",
      "0091 98765 43210",
      "919876543210:12@c.us",
    ]) {
      const result = normalisePhone(input);
      assert.equal(result?.phoneNumber, "919876543210", `failed on ${input}`);
      assert.equal(result?.nationalDigits, "9876543210", `failed on ${input}`);
    }
  });

  check("a number that already has a country code keeps it", () => {
    // The Indian default must not be stapled onto a foreign number.
    assert.equal(normalisePhone("+971 50 123 4567")?.phoneNumber, "971501234567");
    assert.equal(normalisePhone("+1 415 555 2671")?.phoneNumber, "14155552671");
  });

  check("nonsense is rejected rather than guessed", () => {
    assert.equal(normalisePhone(""), null);
    assert.equal(normalisePhone(null), null);
    assert.equal(normalisePhone("12345"), null);
    assert.equal(normalisePhone("hello"), null);
    assert.equal(normalisePhone("12036304@g.us"), null);
  });

  check("a masked number cannot be dialled", () => {
    const masked = maskPhone("919876543210");
    assert.ok(!masked.includes("98765"), `leaked digits: ${masked}`);
    assert.ok(masked.endsWith("3210"));
  });

  // --- §16/§34: the AI contract ---------------------------------------------
  check("a well-formed intent parses", () => {
    const parsed = parseIntentJson(
      JSON.stringify({
        actions: [
          {
            intent: "ADD_FOLLOWUP",
            entities: { leadName: "Raj", date: "2026-08-18", time: "10:00" },
          },
        ],
        confidence: 0.96,
      }),
    );
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    assert.equal(parsed.actions[0].intent, "ADD_FOLLOWUP");
    assert.equal(parsed.actions[0].entities.leadName, "Raj");
  });

  check("§19: one message can carry several actions", () => {
    // "Raj called, he's interested in LIV-0027 and wants a visit Saturday."
    const parsed = parseIntentJson(
      JSON.stringify({
        actions: [
          { intent: "ADD_LEAD_ACTIVITY", entities: { leadName: "Raj", note: "called" } },
          {
            intent: "ASSOCIATE_PROPERTY_TO_LEAD",
            entities: { leadName: "Raj", propertyReference: "LIV-0027" },
          },
          {
            intent: "ADD_FOLLOWUP",
            entities: { leadName: "Raj", date: "2026-08-15", followUpKind: "site_visit" },
          },
        ],
        confidence: 0.93,
      }),
    );
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    assert.equal(parsed.actions.length, 3);
    assert.equal(parsed.actions[2].entities.followUpKind, "site_visit");
  });

  check("a single-object answer is lifted into the list form", () => {
    // Models answer a one-thing question with one object however they are told
    // to reply. Tolerating the shape is not tolerating the content.
    const parsed = parseIntentJson('{"intent":"HELP","confidence":1}');
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    assert.equal(parsed.actions.length, 1);
    assert.equal(parsed.actions[0].intent, "HELP");
  });

  check("an unbounded action list is refused", () => {
    // A model that returns fifty actions has lost the plot; executing them
    // would be fifty CRM writes from one sentence.
    const many = Array.from({ length: 9 }, () => ({ intent: "HELP", entities: {} }));
    assert.ok("error" in parseIntentJson(JSON.stringify({ actions: many, confidence: 1 })));
    assert.ok("error" in parseIntentJson('{"actions":[],"confidence":1}'));
  });

  check("prose around the JSON is tolerated; bad content is not", () => {
    const wrapped = parseIntentJson('Sure!\n```json\n{"intent":"HELP","confidence":1}\n```');
    assert.ok(!("error" in wrapped), "fenced JSON should still parse");

    assert.ok("error" in parseIntentJson("I'm not sure what you mean."));
    assert.ok("error" in parseIntentJson('{"intent":"DROP_TABLE","confidence":1}'));
    assert.ok("error" in parseIntentJson('{"intent":"HELP","confidence":7}'));
    assert.ok("error" in parseIntentJson('{"confidence":0.9}'));
    assert.ok("error" in parseIntentJson('{"intent":"ADD_FOLLOWUP","confidence":0.9,"entities":{"date":"tomorrow"}}'));
  });

  // --- §36: the registry is the authority -----------------------------------
  check("every intent the model can emit has a registry entry", () => {
    // Otherwise a new intent name would reach dispatch with no permission rule.
    for (const intent of INTENTS) {
      assert.ok(COMMANDS[intent], `${intent} has no registry entry`);
    }
  });

  check("publishing needs the permission, whoever asks", () => {
    assert.equal(isAllowed(employee, "PUBLISH_PROPERTY"), false);
    assert.equal(isAllowed(employee, "UNPUBLISH_PROPERTY"), false);
    assert.equal(
      isAllowed({ ...employee, permissions: ["property.publish"] }, "PUBLISH_PROPERTY"),
      true,
    );
    assert.equal(isAllowed(admin, "PUBLISH_PROPERTY"), true);
  });

  check("reassigning a lead is admin-only", () => {
    assert.equal(isAllowed(employee, "ASSIGN_LEAD"), false);
    assert.equal(isAllowed(admin, "ASSIGN_LEAD"), true);
  });

  check("every state-changing command is gated or confirmed", () => {
    for (const [intent, spec] of Object.entries(COMMANDS)) {
      if (spec.readOnly) continue;
      if (spec.risk === "high") {
        assert.equal(
          spec.requiresConfirmation,
          true,
          `${intent} is high risk but does not ask first`,
        );
      }
    }
  });

  check("help only lists what the reader can actually run", () => {
    const forEmployee = helpFor(employee);
    const forAdmin = helpFor(admin);
    assert.ok(!forEmployee.some((line) => line.toLowerCase().startsWith("publish")));
    assert.ok(forAdmin.some((line) => line.toLowerCase().startsWith("publish")));
    // Control-flow intents are not commands and must never be advertised.
    assert.ok(!forAdmin.some((line) => /confirm|cancel|clarification/i.test(line)));
  });

  // --- §26: dates resolve in Living's timezone ------------------------------
  check("a follow-up time is Kochi time, not server time", () => {
    // 10:00 IST is 04:30 UTC. A server in UTC or in London must agree.
    const due = zonedDateTime("2026-08-18", "10:00");
    assert.equal(due?.toISOString(), "2026-08-18T04:30:00.000Z");

    const midnight = zonedDateTime("2026-08-18", "00:00");
    assert.equal(midnight?.toISOString(), "2026-08-17T18:30:00.000Z");
  });

  check("a missing time defaults rather than failing, a bad date does not", () => {
    assert.equal(zonedDateTime("2026-08-18", undefined)?.toISOString(), "2026-08-18T04:30:00.000Z");
    assert.equal(zonedDateTime("tomorrow", "10:00"), null);
    assert.equal(zonedDateTime("18-08-2026", "10:00"), null);
  });

  check("§17: every command in the brief has a registry entry", () => {
    // The list from the brief, verbatim. A rename that quietly drops one of
    // these is the failure this catches.
    const required = [
      "GET_MY_FOLLOWUPS", "GET_MY_LEADS", "GET_LEAD", "CREATE_LEAD", "UPDATE_LEAD",
      "ADD_LEAD_NOTE", "CHANGE_LEAD_STATUS", "ASSIGN_LEAD", "ADD_FOLLOWUP",
      "COMPLETE_FOLLOWUP", "RESCHEDULE_FOLLOWUP", "ADD_LEAD_ACTIVITY",
      "ASSOCIATE_PROPERTY_TO_LEAD", "GET_PROPERTY", "CREATE_PROPERTY_DRAFT",
      "UPDATE_PROPERTY", "ADD_PROPERTY_MEDIA", "UPDATE_PROPERTY_PRICE",
      "PUBLISH_PROPERTY", "UNPUBLISH_PROPERTY", "HELP", "GET_PROFILE",
      "GET_SYSTEM_STATUS",
    ];
    for (const intent of required) {
      assert.ok(INTENTS.includes(intent as never), `${intent} is not a known intent`);
      assert.ok(COMMANDS[intent as never], `${intent} has no registry entry`);
    }
  });

  check("§13: a scope narrows and never grants", () => {
    // Empty scope is the usual case — role and permissions decide.
    assert.equal(isAllowed(employee, "ADD_FOLLOWUP", []), true);
    // A non-empty scope is an allow-list.
    assert.equal(isAllowed(employee, "ADD_FOLLOWUP", ["GET_MY_LEADS"]), false);
    assert.equal(isAllowed(employee, "GET_MY_LEADS", ["GET_MY_LEADS"]), true);
    // Naming a command must not confer the permission it needs.
    assert.equal(isAllowed(employee, "PUBLISH_PROPERTY", ["PUBLISH_PROPERTY"]), false);
    assert.equal(isAllowed(employee, "ASSIGN_LEAD", ["ASSIGN_LEAD"]), false);
    // …and an admin who is scoped is still scoped.
    assert.equal(isAllowed(admin, "PUBLISH_PROPERTY", ["GET_MY_LEADS"]), false);
    // Control flow survives narrowing, or a restricted employee could never
    // answer a question or cancel.
    for (const intent of ["CONFIRM", "CANCEL", "HELP"] as const) {
      assert.equal(isAllowed(employee, intent, ["GET_MY_LEADS"]), true);
    }
  });

  check("§13: help shrinks with the scope", () => {
    const full = helpFor(admin);
    const narrowed = helpFor(admin, ["GET_MY_LEADS"]);
    assert.ok(narrowed.length < full.length);
    // HELP itself is control flow and has no help line of its own to lose.
    assert.ok(narrowed.every((line) => full.includes(line)));
  });

  check("echo suppression survives every spelling of fromMe", () => {
    // A loop on a WhatsApp number is how the number gets banned. OpenWA
    // documents fromMe as a metadata field, not a column, and `direction` as
    // the column that is always there — so all three are checked.
    for (const shape of [
      { fromMe: true },
      { metadata: { fromMe: true } },
      { direction: "outgoing" },
    ]) {
      const body = envelope({ ...TEXT_MESSAGE, ...shape });
      const result = parseOpenWAWebhook(body, headersFor(body), SECRET);
      assert.ok(
        !("rejected" in result) && result.message === null,
        `not suppressed: ${JSON.stringify(shape)}`,
      );
    }
    // An ordinary incoming message still comes through.
    const incoming = envelope({ ...TEXT_MESSAGE, direction: "incoming" });
    const ok = parseOpenWAWebhook(incoming, headersFor(incoming), SECRET);
    assert.ok(!("rejected" in ok) && ok.message !== null);
  });

  check("media is read from OpenWA's documented column names", () => {
    const body = envelope({
      ...TEXT_MESSAGE,
      type: "image",
      mediaMimetype: "image/jpeg",
      mediaPath: "media/abc.jpg",
      metadata: { size: 2048, filename: "villa.jpg" },
    });
    const result = parseOpenWAWebhook(body, headersFor(body), SECRET);
    assert.ok(!("rejected" in result));
    if ("rejected" in result) return;
    assert.equal(result.message?.media?.mimeType, "image/jpeg");
    assert.equal(result.message?.media?.filename, "villa.jpg");
    assert.equal(result.message?.media?.sizeBytes, 2048);
    // A relative path resolves against the gateway rather than being fetched
    // as-is from nowhere.
    assert.match(result.message?.media?.url ?? "", /media\/abc\.jpg$/);
  });

  check("§1: a command declares what it cannot run without", () => {
    // ADD_FOLLOWUP needs a lead and a date. Neither is optional, and the gap is
    // caught before dispatch rather than surfacing from inside a handler.
    assert.deepEqual(missingFields("ADD_FOLLOWUP", {}), ["leadName", "date"]);
    assert.deepEqual(missingFields("ADD_FOLLOWUP", { leadName: "Raj" }), ["date"]);
    assert.deepEqual(
      missingFields("ADD_FOLLOWUP", { leadName: "Raj", date: "2026-08-18" }),
      [],
    );

    // Any member of a group satisfies it — a reference names a lead as well as
    // a name does.
    assert.deepEqual(missingFields("GET_LEAD", { leadReference: "LEAD-0004" }), []);
    assert.deepEqual(missingFields("GET_LEAD", { mobile: "9876543210" }), []);
    assert.deepEqual(missingFields("GET_LEAD", {}), ["leadName"]);

    // A command with no declared requirements never blocks.
    assert.deepEqual(missingFields("GET_MY_FOLLOWUPS", {}), []);
    assert.deepEqual(missingFields("HELP", {}), []);
  });

  check("§1: the high-risk commands all declare their target", () => {
    // A publish or a price change that could not say which listing would be
    // the worst possible thing to run on a guess.
    for (const intent of [
      "PUBLISH_PROPERTY",
      "UNPUBLISH_PROPERTY",
      "UPDATE_PROPERTY_PRICE",
      "ASSIGN_LEAD",
    ] as const) {
      assert.ok(
        missingFields(intent, {}).length > 0,
        `${intent} accepts an empty payload`,
      );
    }
  });

  check("§6: the confirmation states are all distinct", () => {
    // EXPIRED has to exist separately from "still waiting", or an ignored
    // confirmation is indistinguishable from one in flight.
    for (const status of [
      "awaiting_confirmation",
      "executed",
      "cancelled",
      "expired",
    ]) {
      assert.ok(
        (COMMAND_EXECUTION_STATUSES as readonly string[]).includes(status),
        `${status} is not a recorded command state`,
      );
    }
  });

  check("§7: relative dates are computed, not taken from the model", () => {
    // Saturday 15 August 2026, 09:00 IST.
    const now = new Date("2026-08-15T03:30:00Z");
    const on = (text: string) => resolveRelativeDate(text, now);

    assert.deepEqual(on("follow up today"), { kind: "date", iso: "2026-08-15" });
    assert.deepEqual(on("call him tomorrow at 10"), { kind: "date", iso: "2026-08-16" });
    assert.deepEqual(on("day after tomorrow"), { kind: "date", iso: "2026-08-17" });
    assert.deepEqual(on("in 3 days"), { kind: "date", iso: "2026-08-18" });
    assert.deepEqual(on("next week"), { kind: "date", iso: "2026-08-22" });

    // Weekdays resolve to the next one ahead.
    assert.deepEqual(on("see him Monday"), { kind: "date", iso: "2026-08-17" });
    assert.deepEqual(on("next Monday"), { kind: "date", iso: "2026-08-17" });
    assert.deepEqual(on("visit on Friday"), { kind: "date", iso: "2026-08-21" });

    // Nothing relative in the message at all — the model's date is used.
    assert.equal(on("book it for the 20th"), null);
  });

  check("§7: a weekday said on that weekday is asked about, not guessed", () => {
    // Saturday. "Saturday" could be today or in a week, and the difference is
    // a week of silence on a lead.
    const now = new Date("2026-08-15T03:30:00Z");
    const result = resolveRelativeDate("come Saturday", now);
    assert.equal(result?.kind, "ambiguous");
  });

  check("§7: a follow-up is never booked in the past", () => {
    const now = new Date("2026-08-15T03:30:00Z");

    // A model that got its arithmetic wrong and returned yesterday.
    const stale = scheduleAt({ text: "book it in", modelDate: "2026-08-14", now });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.match(stale.ask, /already passed/);

    // Earlier the same day is fine — someone logging a call to return.
    const earlier = scheduleAt({
      text: "book it in",
      modelDate: "2026-08-15",
      time: "08:00",
      now,
    });
    assert.equal(earlier.ok, true);
  });

  check("§7: the message beats the model when they disagree", () => {
    const now = new Date("2026-08-15T03:30:00Z");
    // The message says tomorrow; the model returned something else entirely.
    const result = scheduleAt({
      text: "follow up tomorrow at 10",
      modelDate: "2026-09-30",
      time: "10:00",
      now,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // 10:00 IST on the 16th is 04:30Z.
    assert.equal(result.dueAt.toISOString(), "2026-08-16T04:30:00.000Z");
  });

  check("§5: every example in the sprint maps to a real command", () => {
    // Not a test of the model — a test that the intents its examples imply
    // exist and are runnable. A prompt example with no command behind it is a
    // promise the system cannot keep.
    const expected = [
      "ADD_FOLLOWUP",
      "ADD_LEAD_NOTE",
      "ADD_LEAD_ACTIVITY",
      "CHANGE_LEAD_STATUS",
      "GET_MY_FOLLOWUPS",
      "GET_MY_LEADS",
      "GET_PROPERTY",
    ] as const;
    for (const intent of expected) {
      assert.ok(COMMANDS[intent], `${intent} has no registry entry`);
      assert.ok(isAllowed(admin, intent), `${intent} is not runnable by an admin`);
    }
  });

  check("Sprint 6 §5: a file becomes the right kind of media row", () => {
    assert.equal(kindFor("image/jpeg", "here you go"), "image");
    assert.equal(kindFor("video/mp4", "walkthrough"), "video");
    assert.equal(kindFor("application/pdf", "the title deed"), "document");
    // A floor plan and a sketch are both JPEGs, and they are not both public.
    assert.equal(kindFor("image/png", "floor plan for the first floor"), "floor_plan");
    assert.equal(kindFor("image/png", "rough sketch of the layout"), "sketch");
    // Anything else is refused rather than stored as something it is not.
    assert.equal(kindFor("application/x-msdownload", "open this"), null);
    assert.equal(kindFor("audio/ogg", "voice note"), null);
  });

  check("Sprint 6 §8: the internal price is rendered only when passed", () => {
    const listing = {
      reference: "LIV-0027",
      name: "The Arbour",
      type: "3 BHK",
      locality: "Kakkanad",
      city: "Ernakulam",
      priceLabel: "₹1.85 Cr",
      workflowStatus: "published",
      isPublic: true,
    };

    // No permission → the caller passes nothing → the line does not exist.
    const withheld = t.property(listing);
    assert.ok(!/final/i.test(withheld), `leaked: ${withheld}`);
    assert.ok(!/internal/i.test(withheld));
    // …and it does not advertise that something is being kept from them.
    assert.ok(!/hidden|restricted|—/.test(withheld.split("\n")[2]));

    // Permission → the caller fetched it → it renders.
    const shown = t.property(listing, 17000000);
    assert.match(shown, /Final \(internal\): ₹1\.70 Cr/);
    // The asking price is still there; one did not replace the other.
    assert.match(shown, /Asking: ₹1\.85 Cr/);
  });

  check("Sprint 6 §8: the internal price is not in the resolver's projection", async () => {
    // The protection is the projection. If finalPrice ever appears in
    // resolve.ts, every read path gains it at once — including the customer one.
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("lib/crm/whatsapp/resolve.ts", "utf8");
    for (const field of ["finalPrice", "sellerName", "sellerContact", "internalNotes"]) {
      assert.ok(!source.includes(field), `${field} is in the shared property projection`);
    }
  });

  check("Sprint 6 §3: nothing created over WhatsApp is publishable by itself", () => {
    // Publishing is a separate, confirmed, permissioned command — a draft
    // cannot become live as a side effect of being created.
    assert.equal(COMMANDS.CREATE_PROPERTY_DRAFT.readOnly, false);
    assert.equal(COMMANDS.CREATE_PROPERTY_DRAFT.requiresConfirmation, false);
    assert.equal(COMMANDS.PUBLISH_PROPERTY.requiresConfirmation, true);
    assert.equal(COMMANDS.PUBLISH_PROPERTY.permission, "property.publish");
    assert.equal(isAllowed(employee, "PUBLISH_PROPERTY"), false);
  });

  check("Sprint 7 §6: the customer reply names the listing, and nothing else", () => {
    const withProperty = t.customerAcknowledged("LIV-0027");
    assert.match(withProperty, /LIV-0027/);
    assert.match(withProperty, /get in touch/i);
    // §5/§8: no price, no status, no internal anything in a customer reply.
    assert.ok(!/₹|draft|internal|final|reserved|owner|seller/i.test(withProperty));

    // No property known — still an acknowledgement, no invented reference.
    const generic = t.customerAcknowledged(null);
    assert.ok(!/LIV-/.test(generic));
    assert.match(generic, /get in touch/i);
  });

  check("Sprint 7 §8: the customer module cannot reach a CRM command", async () => {
    // Structural, and the strongest form available without a database: if the
    // customer path never imports the registry, the dispatcher or the handlers,
    // there is no code path by which a customer message runs a command.
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("lib/crm/whatsapp/customer.ts", "utf8");

    for (const forbidden of [
      "./registry",
      "./handlers",
      "./employee",
      "./draft",
      "parseIntent",
      "isAllowed",
    ]) {
      assert.ok(
        !source.includes(forbidden),
        `customer.ts references ${forbidden} — a customer could reach a command`,
      );
    }

    // And it must not select the internal columns either.
    for (const field of ["finalPrice", "sellerContact", "internalNotes", "sellerName"]) {
      assert.ok(!source.includes(field), `customer.ts selects ${field}`);
    }
  });

  check("Sprint 7 §8: the inbound router sends non-employees down one path", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("lib/integrations/whatsapp/inbound.ts", "utf8");

    // Exactly one call to the employee handler, and it is inside the
    // employee branch. A second call site would be a way around the check.
    const employeeCalls = source.match(/handleEmployeeMessage\(/g) ?? [];
    assert.equal(employeeCalls.length, 1, "handleEmployeeMessage is called more than once");
    assert.match(source, /sender\.kind === "employee"/);
    // Customers and unknowns share the else branch — unknown is never treated
    // as staff by omission.
    assert.match(source, /handleCustomerMessage\(/);
  });

  check("Sprint 8 §4: the audit row can answer all eight questions", () => {
    // Who, from where, saying what, understood as what, doing what to which
    // record, when, and with what result. A column missing here means a
    // WhatsApp-driven change nobody can account for afterwards.
    const columns = Object.keys(whatsappCommandExecutions);
    for (const required of [
      "employeeId", // user
      "senderPhone", // phone
      "originalText", // message
      "intent", // intent + action
      "entities", // parameters
      "targetEntity", // entity
      "targetEntityId",
      "createdAt", // timestamp
      "status", // result
      "resultSummary",
    ]) {
      assert.ok(columns.includes(required), `whatsapp_command_executions has no ${required}`);
    }
  });

  check("Sprint 8 §5: no client component reads a server secret", async () => {
    // NEXT_PUBLIC_ is the mechanism, but nothing enforced it. A "use client"
    // file reading process.env.OPENWA_API_KEY gets undefined today and a leak
    // the day someone "fixes" it by adding the prefix.
    const { readdir, readFile } = await import("node:fs/promises");
    const offenders: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const source = await readFile(full, "utf8");
        if (!/^\s*["']use client["']/m.test(source)) continue;
        if (/process\.env\.(OPENWA|OLLAMA|SMTP|MINIO|DATABASE)/.test(source)) {
          offenders.push(full);
        }
      }
    };

    for (const root of ["app", "components"]) await walk(root);
    assert.deepEqual(offenders, [], `client components reading secrets: ${offenders.join(", ")}`);
  });

  check("Sprint 8 §5: the AI has no path to the database", async () => {
    // §34. The model produces an intent; it never touches a table. If the AI
    // modules ever import the database or a handler, that boundary is gone.
    const { readdir, readFile } = await import("node:fs/promises");
    const offenders: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        const source = await readFile(full, "utf8");
        if (/from "@\/lib\/db|drizzle-orm|leads\.service|whatsapp\/handlers/.test(source)) {
          offenders.push(full);
        }
      }
    };

    await walk("lib/ai");
    assert.deepEqual(offenders, [], `AI modules reaching the database: ${offenders.join(", ")}`);
  });

  check("Sprint 8 §6: the outbound limits are conservative by default", () => {
    // §68. An unofficial gateway gets numbers banned for looking like a bulk
    // sender. These are the ceiling, and they should stay small.
    assert.ok(OUTBOUND_RATE.perMinute <= 60, "per-minute ceiling is too high for a gateway");
    assert.ok(OUTBOUND_RATE.minGapMs >= 500, "messages would go out back to back");
  });

  check("§67: health reports rather than throws when nothing is configured", async () => {
    const rows = await systemHealth();
    assert.ok(rows.length >= 5);
    // Unconfigured is not unhealthy — this app runs deliberately without SMTP,
    // MinIO, Ollama and WhatsApp.
    assert.ok(rows.every((row) => typeof row.detail === "string" && row.detail));
    assert.equal(rows.find((row) => row.label === "WhatsApp")?.ok, true);
  });

  // --- privacy-masked senders (@lid) --------------------------------------
  //
  // Regression cases for a live bug: every inbound message on the staging
  // session arrived masked as "210354630082686@lid". Those digits parsed as a
  // valid E.164 number, so a fabricated contact was stored, employee matching
  // never matched, commands never ran, and replies went to a number that does
  // not exist.

  const LID = "210354630082686@lid";
  const REAL = "919035367324";

  check("a masked sender id is not a phone number", () => {
    // The root cause. @g.us and @broadcast were already refused; @lid was not,
    // and 15 digits is a legal E.164 length, so it sailed through.
    assert.equal(normalisePhone(LID), null, "@lid must never normalise");
    assert.equal(normalisePhone("210354630082686@LID"), null, "case-insensitive");
    // The ordinary forms must still work.
    assert.equal(normalisePhone("919876543210@c.us")?.phoneNumber, "919876543210");
    assert.equal(normalisePhone("9876543210")?.phoneNumber, "919876543210");
  });

  check("isLidId spots the mask and nothing else", () => {
    assert.equal(isLidId(LID), true);
    assert.equal(isLidId("210354630082686@LID"), true);
    assert.equal(isLidId("919876543210@c.us"), false);
    assert.equal(isLidId("12036304@g.us"), false);
    assert.equal(isLidId(null), false);
  });

  check("a masked delivery survives parsing with no invented number", () => {
    const body = envelope({ ...TEXT_MESSAGE, chatId: LID, from: LID });
    const result = parseOpenWAWebhook(body, headersFor(body), SECRET);
    assert.ok(!("rejected" in result), "a masked sender is not a forgery");
    // The message must NOT be dropped — dropping it loses a real message.
    assert.ok(result.message, "masked messages must reach the routing step");
    assert.equal(result.message?.fromPhone, null, "no fabricated number");
    assert.equal(result.message?.senderLid, LID, "the mask is carried forward");
    // The specific garbage this bug produced.
    assert.notEqual(result.message?.fromPhone, "210354630082686");
  });

  check("a stated sender phone beats the mask", () => {
    const body = envelope({
      ...TEXT_MESSAGE,
      chatId: LID,
      from: LID,
      senderPhone: "+91 90353 67324",
    });
    const result = parseOpenWAWebhook(body, headersFor(body), SECRET);
    assert.ok(!("rejected" in result));
    assert.equal(result.message?.fromPhone, REAL, "no lookup needed");
    assert.equal(result.message?.senderLid, null);
  });

  check("an ordinary sender is unaffected", () => {
    const body = envelope(TEXT_MESSAGE);
    const result = parseOpenWAWebhook(body, headersFor(body), SECRET);
    assert.ok(!("rejected" in result));
    assert.equal(result.message?.fromPhone, "919876543210");
    assert.equal(result.message?.senderLid, null);
  });

  check("the resolver reads id, not number", async () => {
    // The trap: the gateway answers a lid lookup with the real number in `id`
    // and the masked pseudo-number still sitting in `number`. Reading `number`
    // hands back exactly the garbage we are trying to get rid of.
    __resetLidCache();
    const original = openWA.getContact;
    let calls = 0;
    openWA.getContact = (async () => {
      calls += 1;
      return { id: "919035367324@c.us", number: "210354630082686" };
    }) as typeof openWA.getContact;

    try {
      const phone = await resolveLidPhone(LID);
      assert.equal(phone?.phoneNumber, REAL, "must come from id");
      assert.notEqual(phone?.phoneNumber, "210354630082686", "must not come from number");

      // Same sender on every message, so the lookup is cached.
      await resolveLidPhone(LID);
      assert.equal(calls, 1, "a repeat lookup must be served from cache");
    } finally {
      openWA.getContact = original;
      __resetLidCache();
    }
  });

  check("an unresolvable mask refuses rather than guesses", async () => {
    __resetLidCache();
    const original = openWA.getContact;

    try {
      // Gateway unreachable.
      openWA.getContact = (async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof openWA.getContact;
      assert.equal(await resolveLidPhone(LID), null, "an error is not a number");

      // Gateway answers, but only with the masked number and no usable id.
      __resetLidCache();
      openWA.getContact = (async () => ({
        number: "210354630082686",
      })) as typeof openWA.getContact;
      assert.equal(await resolveLidPhone(LID), null, "number alone is not enough");

      // Gateway echoes the mask back in id.
      __resetLidCache();
      openWA.getContact = (async () => ({ id: LID })) as typeof openWA.getContact;
      assert.equal(await resolveLidPhone(LID), null, "a lid in id is still a lid");
    } finally {
      openWA.getContact = original;
      __resetLidCache();
    }
  });

  check("a masked group is still refused", () => {
    // A mask must not become a way past the group check.
    const body = envelope({
      ...TEXT_MESSAGE,
      chatId: "12036304@g.us",
      from: "12036304@g.us",
      author: LID,
    });
    const result = parseOpenWAWebhook(body, headersFor(body), SECRET);
    assert.ok(!("rejected" in result));
    assert.equal(result.message?.fromPhone, null);
  });

  // --- blank fields from the model ----------------------------------------
  //
  // Regression cases for a live bug: every employee command failed with
  // "question: Too small: expected string to have >=1 characters". In
  // format:"json" mode against a fixed shape, both models tested filled in
  // every documented key — and for a key they had no value for, the plausible
  // filler is "". .optional() accepts absent-or-undefined, never "", so a
  // blank field discarded an otherwise perfect intent.

  const ok = (raw: string) => {
    const parsed = parseIntentJson(raw);
    assert.ok(!("error" in parsed), `expected a parse, got: ${"error" in parsed ? parsed.error : ""}`);
    return parsed as Exclude<typeof parsed, { error: string }>;
  };

  check("an empty question no longer discards a correct intent", () => {
    // The exact payload from the report: CREATE_PROPERTY_DRAFT, confidence 1,
    // question "". This is what llama3.2:3b and qwen3:8b both returned.
    const parsed = ok(JSON.stringify({
      actions: [{ intent: "CREATE_PROPERTY_DRAFT", entities: {} }],
      confidence: 1.0,
      question: "",
    }));
    assert.equal(parsed.actions[0].intent, "CREATE_PROPERTY_DRAFT");
    assert.equal(parsed.confidence, 1);
    assert.equal(parsed.question, undefined, "a blank question is an absent one");
  });

  check("null and whitespace read the same as absent", () => {
    for (const question of [null, "   ", "\n"]) {
      const parsed = ok(JSON.stringify({
        actions: [{ intent: "HELP", entities: {} }],
        confidence: 0.9,
        question,
      }));
      assert.equal(parsed.question, undefined, `${JSON.stringify(question)} is not a question`);
    }
  });

  check("a real question still survives", () => {
    const parsed = ok(JSON.stringify({
      actions: [{ intent: "CLARIFICATION_REQUIRED", entities: {} }],
      confidence: 0.4,
      question: "Which Raj do you mean?",
    }));
    assert.equal(parsed.question, "Which Raj do you mean?");
  });

  check("blank entity fields are dropped, not rejected", () => {
    // The same bug, and the reason fixing only `question` would not have held:
    // every field in `entities` has the identical .min(1).optional() shape, so
    // the next command carrying entities would have failed the same way.
    const parsed = ok(JSON.stringify({
      actions: [{
        intent: "ADD_FOLLOWUP",
        entities: {
          leadName: "Raj Menon",
          note: "",
          city: null,
          propertyReference: "   ",
          date: "2026-08-20",
          amount: null,
        },
      }],
      confidence: 0.95,
    }));
    const e = parsed.actions[0].entities;
    assert.equal(e.leadName, "Raj Menon", "real values are untouched");
    assert.equal(e.date, "2026-08-20");
    assert.equal(e.note, undefined, "empty string is absent");
    assert.equal(e.city, undefined, "null is absent");
    assert.equal(e.propertyReference, undefined, "whitespace is absent");
    assert.equal(e.amount, undefined, "a null number is absent");
  });

  check("a null entities object becomes an empty one", () => {
    const parsed = ok(JSON.stringify({
      actions: [{ intent: "GET_MY_LEADS", entities: null }],
      confidence: 0.9,
    }));
    assert.deepEqual(parsed.actions[0].entities, {});
  });

  check("normalising blanks does not weaken the schema", () => {
    // The guard removes a spelling of "absent"; it must not start accepting
    // values that are genuinely wrong.
    const bad = [
      // required field blanked out is still missing, not defaulted
      { actions: [{ intent: "HELP", entities: {} }], confidence: "" },
      // unknown intent
      { actions: [{ intent: "DROP_TABLE", entities: {} }], confidence: 0.9 },
      // confidence out of range
      { actions: [{ intent: "HELP", entities: {} }], confidence: 1.4 },
      // no actions at all
      { actions: [], confidence: 0.9 },
      // more than the five-action ceiling
      { actions: Array.from({ length: 6 }, () => ({ intent: "HELP", entities: {} })), confidence: 0.9 },
      // a question that is too long
      {
        actions: [{ intent: "CLARIFICATION_REQUIRED", entities: {} }],
        confidence: 0.4,
        question: "x".repeat(301),
      },
    ];
    for (const payload of bad) {
      const parsed = parseIntentJson(JSON.stringify(payload));
      assert.ok("error" in parsed, `should have been refused: ${JSON.stringify(payload).slice(0, 60)}`);
    }
  });

  await Promise.all(pending);
  console.log(`\n${checks} checks passed`);
  if (process.exitCode) console.error("Some checks failed.");
}

main();
