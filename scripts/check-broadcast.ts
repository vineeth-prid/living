/**
 * The broadcast rules, checked without a database, a MinIO or an OpenWA.
 *
 *   npm run check:broadcast
 *
 * Same convention as check-whatsapp.ts: plain assertions, no framework. What is
 * covered here is the part that decides who receives a bulk message — the one
 * piece of this feature whose failure mode is "several hundred people got
 * something they asked not to receive", which is not a thing to find out about
 * from a customer.
 *
 * The queue itself (claim/drain/complete) needs a live Postgres and is listed
 * in docs/whatsapp.md as a manual pass.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AUDIENCE_PRESETS,
  DUPLICATE,
  NO_NUMBER,
  OPTED_OUT,
  classify,
  summarise,
  type Row,
} from "../lib/crm/whatsapp/audience";
import { STOP_WORDS } from "../lib/crm/whatsapp/customer";
import {
  BROADCAST_RECIPIENT_STATUSES,
  BROADCAST_STATUSES,
} from "../lib/db/schema";
import { broadcastMediaUrl } from "../lib/site";
import { t } from "../lib/crm/whatsapp/templates";
import { OpenWAProvider } from "../lib/integrations/whatsapp/openwa/provider";

let checks = 0;

const pending: Promise<void>[] = [];

const check = (name: string, fn: () => void | Promise<void>) => {
  // Same shape as check-whatsapp.ts: sync and async cases both land here, and
  // the run is awaited at the end so a failing promise cannot exit 0.
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

/** A lead row as the audience query returns one. */
const lead = (id: string, mobile: string, name = id): Row => ({
  leadId: id,
  name,
  reference: `LEAD-${id}`,
  mobile,
  status: "qualified",
  priority: "warm",
  city: "Ernakulam",
});

console.log("\nBroadcast checks\n");

check("an opted-out number is never a recipient", () => {
  const rows = [lead("a", "9876543210"), lead("b", "9876500000")];
  const result = classify(rows, new Set(["919876543210"]));

  assert.equal(result[0].excluded, OPTED_OUT, "the opted-out lead must be excluded");
  assert.equal(result[1].excluded, null, "the other lead must still be sendable");
});

check("the opt-out set is matched on the canonical number, not what was typed", () => {
  // The lead is saved the way a person types it; the contact row holds E.164.
  // Matching those two forms is the entire point of normalising first — without
  // it, every opt-out silently fails to apply.
  const rows = [lead("a", "+91 98765 43210"), lead("b", "098765 43211")];
  const result = classify(rows, new Set(["919876543210", "919876543211"]));

  assert.equal(result[0].excluded, OPTED_OUT);
  assert.equal(result[1].excluded, OPTED_OUT);
});

check("two leads sharing a mobile are messaged once", () => {
  const rows = [
    lead("a", "9876543210", "Raj"),
    lead("b", "+919876543210", "Raj's wife"),
    lead("c", "9876543211", "Someone else"),
  ];
  const result = classify(rows, new Set());

  assert.equal(result[0].excluded, null, "the first one wins");
  assert.equal(result[1].excluded, DUPLICATE, "the second is a duplicate");
  assert.equal(result[2].excluded, null);
});

check("an unusable number is excluded rather than attempted", () => {
  const rows = [
    lead("a", "not a phone number"),
    lead("b", "123"),
    lead("c", ""),
    lead("d", "9876543210"),
  ];
  const result = classify(rows, new Set());

  assert.equal(result[0].excluded, NO_NUMBER);
  assert.equal(result[1].excluded, NO_NUMBER, "too short to be a number");
  assert.equal(result[2].excluded, NO_NUMBER);
  assert.equal(result[3].excluded, null);
});

check("opting out beats being a duplicate", () => {
  // Order matters: if the dedupe ran first, the second row would be filed as a
  // duplicate and the opt-out would never be counted. The report would then
  // show nobody opted out while the send was correctly skipping them, which is
  // the sort of disagreement nobody can debug.
  const rows = [lead("a", "9876543210"), lead("b", "9876543210")];
  const result = classify(rows, new Set(["919876543210"]));

  assert.equal(result[0].excluded, OPTED_OUT);
  assert.equal(result[1].excluded, OPTED_OUT, "not DUPLICATE — neither is sent");
});

check("the summary adds up to the total", () => {
  const rows = [
    lead("a", "9876543210"),
    lead("b", "9876543210"),
    lead("c", "9876500000"),
    lead("d", "rubbish"),
    lead("e", "9876511111"),
  ];
  const counts = summarise(classify(rows, new Set(["919876500000"])));

  assert.equal(counts.total, 5);
  assert.equal(counts.sendable, 2, "a and e");
  assert.equal(counts.duplicates, 1, "b");
  assert.equal(counts.optedOut, 1, "c");
  assert.equal(counts.unusable, 1, "d");
  assert.equal(
    counts.sendable + counts.duplicates + counts.optedOut + counts.unusable,
    counts.total,
    "every candidate must land in exactly one bucket, or the report lies",
  );
});

check("an empty audience is empty, not everybody", () => {
  const result = classify([], new Set());
  assert.deepEqual(result, []);
  assert.equal(summarise(result).sendable, 0);
});

check("STOP is an opt-out; a sentence containing stop is not", () => {
  for (const word of [
    "STOP",
    "stop",
    "Stop.",
    "unsubscribe",
    "opt out",
    "opt-out",
    "remove me",
    "DND",
    "do not disturb",
    "no more messages",
    "please stop",
  ]) {
    assert.ok(STOP_WORDS.test(word), `"${word}" should opt them out`);
  }

  for (const sentence of [
    "don't stop looking for a 3BHK",
    "stop by the office tomorrow?",
    "is the bus stop nearby",
    "I want to stop the booking and switch to the other flat",
    "when will construction stop",
  ]) {
    assert.ok(
      !STOP_WORDS.test(sentence),
      `"${sentence}" must NOT silence a live customer`,
    );
  }
});

check("the opt-out reply says offers stop, not the conversation", () => {
  const reply = t.optedOut();
  // The wording is the whole point: someone who thinks they have been cut off
  // stops writing in, and a lead that stops writing in is a lost one.
  assert.match(reply, /offers|updates/i, "must say what actually stops");
  assert.match(reply, /message us|reply/i, "must say they can still write in");
});

check("the preset labelled Customers selects closed leads, not a made-up table", () => {
  assert.equal(AUDIENCE_PRESETS.customers.filters.status, "closed_won");
  assert.deepEqual(AUDIENCE_PRESETS.all.filters, {}, "Everyone narrows nothing");
  assert.equal(AUDIENCE_PRESETS.hot.filters.priority, "hot");
});

check("broadcast media gets an absolute URL the gateway can fetch", () => {
  process.env.APP_BASE_URL = "https://staging.livingbyitr.com";
  const url = broadcastMediaUrl("/whatsapp/broadcasts/1770000000000-abcdef.jpg");

  // Absolute, because the fetch is made by OpenWA on the VPS — a relative path
  // resolves against the gateway and 404s.
  assert.ok(url.startsWith("https://"), `expected an absolute URL, got ${url}`);
  assert.equal(
    url,
    "https://staging.livingbyitr.com/media/whatsapp/broadcasts/1770000000000-abcdef.jpg",
  );
  // One slash, not two: a double slash is a different path to MinIO.
  assert.ok(!url.includes("//media"), "the leading slash must not be doubled");
});

check("the statuses the code writes are the statuses the column allows", () => {
  for (const status of ["draft", "sending", "paused", "completed", "cancelled"]) {
    assert.ok(
      (BROADCAST_STATUSES as readonly string[]).includes(status),
      `${status} is written by the broadcast engine`,
    );
  }
  for (const status of ["queued", "sending", "sent", "failed", "skipped"]) {
    assert.ok(
      (BROADCAST_RECIPIENT_STATUSES as readonly string[]).includes(status),
      `${status} is written by the broadcast engine`,
    );
  }
});


// --- the media endpoint ----------------------------------------------------
//
// The regression this section exists for: `kind` was dropped between the
// service and the provider, the client had no way to know what it was sending,
// and so it posted everything to one hardcoded `/messages/send-media` — a route
// OpenWA does not have. Every media broadcast 404ed before the gateway looked
// at it, and nothing in the type system or the test suite noticed, because
// nothing asserted which URL a send actually reaches.
//
// So that is what these assert. fetch is stubbed; no gateway is involved.

process.env.OPENWA_ENABLED = "true";
process.env.OPENWA_BASE_URL = "https://openwa.test";
process.env.OPENWA_API_KEY = "test-key";
process.env.OPENWA_SESSION_ID = "session-1";


type Sent = { url: string; body: Record<string, unknown> };

/** Runs one send against a stubbed fetch and reports what went over the wire. */
async function capture(
  input: Parameters<InstanceType<typeof OpenWAProvider>["sendMedia"]>[0],
): Promise<{ sent: Sent | null; result: Awaited<ReturnType<InstanceType<typeof OpenWAProvider>["sendMedia"]>> }> {
  let sent: Sent | null = null;
  const original = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sent = {
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    };
    return new Response(JSON.stringify({ id: "wamid.TEST" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  try {
    const result = await new OpenWAProvider().sendMedia(input);
    return { sent, result };
  } finally {
    globalThis.fetch = original;
  }
}

const photo = {
  to: "919876543210",
  text: "A caption",
  url: "https://living.test/media/whatsapp/broadcasts/1-abc.jpg",
};

check("an image goes to send-image, not a generic send-media", async () => {
  const { sent, result } = await capture({ ...photo, kind: "image" });

  assert.ok(result.ok, `the send should succeed: ${result.ok ? "" : result.error}`);
  assert.ok(sent, "something should have been posted");
  assert.ok(
    sent.url.endsWith("/api/sessions/session-1/messages/send-image"),
    `posted to ${sent.url}`,
  );
  // The route that produced "Cannot POST …/messages/send-media" must be gone.
  assert.ok(!sent.url.includes("send-media"), "send-media is not a real route");
  assert.equal(sent.body.chatId, "919876543210@c.us");
  assert.equal(sent.body.url, photo.url);
  assert.equal(sent.body.caption, "A caption");
});

check("a video goes to send-video", async () => {
  const { sent, result } = await capture({ ...photo, kind: "video" });
  assert.ok(result.ok);
  assert.ok(sent?.url.endsWith("/messages/send-video"), `posted to ${sent?.url}`);
});

check("a document goes to send-document with its filename and mimetype", async () => {
  const { sent, result } = await capture({
    ...photo,
    kind: "document",
    filename: "brochure.pdf",
    mimeType: "application/pdf",
  });

  assert.ok(result.ok);
  assert.ok(sent?.url.endsWith("/messages/send-document"), `posted to ${sent?.url}`);
  assert.equal(sent?.body.filename, "brochure.pdf");
  // WhatsApp renders a document with no content type as an unopenable blob.
  assert.equal(sent?.body.mimetype, "application/pdf");
});

check("a document whose content type cannot be worked out is refused", async () => {
  const { sent, result } = await capture({
    ...photo,
    kind: "document",
    // No stored type and no extension to derive one from. A ".pdf" here would
    // now be derived rather than refused, which is the better answer — that
    // case is covered by "a missing content type is derived from the filename".
    filename: "brochure",
  });

  assert.equal(result.ok, false, "it must not be sent");
  assert.equal(sent, null, "and nothing should reach the gateway");
  if (!result.ok) {
    assert.match(result.error, /content type/i);
    assert.equal(result.retryable, false, "a missing field is not worth retrying");
  }
});

check("a missing kind falls back to an image rather than failing", async () => {
  // Matching the `?? "image"` the broadcast engine already applies. A photo is
  // overwhelmingly what an unlabelled attachment is.
  const { sent, result } = await capture(photo);
  assert.ok(result.ok);
  assert.ok(sent?.url.endsWith("/messages/send-image"), `posted to ${sent?.url}`);
});

check("an unsupported kind fails clearly instead of posting somewhere wrong", async () => {
  const { sent, result } = await capture({ ...photo, kind: "audio" });

  assert.equal(result.ok, false);
  assert.equal(sent, null, "nothing should be posted");
  if (!result.ok) assert.match(result.error, /not supported yet/i);
});

check("no media at all is refused before a request is made", async () => {
  const { sent, result } = await capture({
    to: "919876543210",
    text: "A caption",
    kind: "image",
  });
  // No url and no base64: OpenWA would answer 400, so this is caught earlier.
  assert.equal(result.ok, false);
  assert.equal(sent, null);
});

// --- scoping, pacing and giving up -----------------------------------------
//
// Three defects found after the first live broadcast. Two of them only show up
// with real data, so they get the cheapest check that still catches them: the
// SQL a query builds and the source of the function itself, read without ever
// connecting to Postgres.

process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/unused";

const SOURCE = new URL("../lib/crm/whatsapp/broadcast.ts", import.meta.url);

/** The body of one exported function, for asserting on what it contains. */
async function sourceOf(name: string): Promise<string> {
  const source = await readFile(SOURCE, "utf8");
  const from = source.indexOf(`export async function ${name}`);
  assert.notEqual(from, -1, `${name} should exist`);
  const body = source.slice(from);
  return body.slice(0, body.indexOf("\n}\n"));
}

check("the recipient list for a broadcast filters by that broadcast", async () => {
  // The shipped bug: broadcastRecipients(id) took the id and never used it, so
  // it returned up to 500 rows across every broadcast ever created. A
  // one-recipient broadcast reported "4 people — 1 queued, 3 failed", the three
  // being leftovers from an unrelated incident. The report page derives the
  // typed-confirmation count from these rows, so the one safeguard on that
  // screen was validating a number that did not belong to what was on it.
  const fn = await sourceOf("broadcastRecipients");
  assert.match(
    fn,
    /whatsappBroadcastRecipients\.broadcastId, id/,
    "broadcastRecipients must filter on the id it was given",
  );

  // And that such a filter is really what Postgres ends up with.
  const { db } = await import("../lib/db");
  const { whatsappBroadcastRecipients } = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const scoped = db()
    .select({ id: whatsappBroadcastRecipients.id })
    .from(whatsappBroadcastRecipients)
    .where(eq(whatsappBroadcastRecipients.broadcastId, "b-1"))
    .toSQL();

  assert.match(scoped.sql, /broadcast_id/, "the column must appear in the where");
});

check("giving up is capped, and the manual retry agrees with the loop", async () => {
  const { MAX_ATTEMPTS } = await import("../lib/crm/whatsapp/broadcast");

  // One row reached 28 attempts, because the automatic loop had no ceiling at
  // all while requeueFailed quietly enforced one.
  assert.ok(MAX_ATTEMPTS >= 1, "a cap of zero would send to nobody");
  assert.ok(
    MAX_ATTEMPTS <= 10,
    `${MAX_ATTEMPTS} attempts is not a retry policy, it is a loop`,
  );

  const source = await readFile(SOURCE, "utf8");
  // Both the claim query and requeueFailed read the same constant, so they
  // cannot drift into the loop retrying what the button refuses.
  assert.ok(
    (source.match(/MAX_ATTEMPTS\}/g) ?? []).length >= 2,
    "the cap belongs in both the claim query and requeueFailed",
  );
  assert.doesNotMatch(
    source,
    /attempts\} < 3/,
    "no hardcoded 3 left — the constant is the only place the number lives",
  );
});

check("cancelling a broadcast also stops its queued recipients", async () => {
  // Cancelling used to touch only the broadcast row, leaving its queued rows
  // claimable; requeueFailed then put the broadcast back to sending and brought
  // the whole abandoned queue with it.
  const fn = await sourceOf("setBroadcastStatus");

  assert.match(fn, /whatsappBroadcastRecipients/, "cancel must reach the rows");
  assert.match(fn, /transaction/, "in one transaction with the status change");
  // Pausing must NOT cascade — a paused broadcast resumes with its queue, and
  // that difference is the whole point of having two buttons.
  assert.match(
    fn,
    /status === "cancelled"/,
    "the cascade is conditional on cancelled, not on any status change",
  );
});

check("requeueing failures cannot restart a cancelled broadcast", async () => {
  const fn = await sourceOf("requeueFailed");
  assert.match(
    fn,
    /cancelled/,
    "cancelled is terminal — retrying its failures must not resume it",
  );
});

check("the rate limit is checked before a recipient is claimed", async () => {
  // Claiming increments `attempts`. Finding out about the rate limit afterwards
  // spent a retry on someone nothing had tried to message — and with a cap on
  // attempts, that is how a recipient ends up permanently failed because the
  // gateway happened to be busy.
  const source = await readFile(SOURCE, "utf8");
  const drain = source.slice(source.indexOf("export async function drainBroadcasts"));

  const budgetAt = drain.indexOf("hasSendBudget()");
  const claimAt = drain.indexOf("await claim(");

  assert.notEqual(budgetAt, -1, "the drain loop must ask for budget");
  assert.ok(
    budgetAt < claimAt,
    "the budget check has to come before the claim, not after",
  );
});

check("inline media travels as base64, not as a URL", async () => {
  // The transport that sidesteps the gateway fetching our HTTPS URL — the step
  // that fails silently when its container loses its trust store.
  const { sent, result } = await capture({
    to: "919876543210",
    text: "A caption",
    kind: "image",
    base64: "aGVsbG8=",
    mimeType: "image/jpeg",
  });

  assert.ok(result.ok);
  assert.equal(sent?.body.base64, "aGVsbG8=");
  assert.equal(sent?.body.url, undefined, "one or the other, never both");
  assert.ok(sent?.url.endsWith("/messages/send-image"));
});

check("inline media carries its content type, which OpenWA requires", async () => {
  // The bug the base64 diagnostic hit immediately: mimetype was written only
  // for documents, so every inline image came back
  // "400 mimetype is required when using base64 data" — and the one transport
  // added to diagnose the url path could not be used at all.
  //
  // With a URL the gateway learns the type from the fetch. With inline bytes
  // there is nothing to learn it from.
  const { sent, result } = await capture({
    to: "919876543210",
    text: "A caption",
    kind: "image",
    base64: "aGVsbG8=",
    mimeType: "image/jpeg",
  });

  assert.ok(result.ok, `the send should succeed: ${result.ok ? "" : result.error}`);
  assert.equal(sent?.body.mimetype, "image/jpeg");
  assert.equal(sent?.body.base64, "aGVsbG8=");
});

check("an inline video carries its content type too, not just documents", async () => {
  const { sent } = await capture({
    to: "919876543210",
    text: "A caption",
    kind: "video",
    base64: "aGVsbG8=",
    mimeType: "video/mp4",
  });
  assert.equal(sent?.body.mimetype, "video/mp4");
});

check("a missing content type is derived from the filename", async () => {
  // media_mime_type is recorded on upload, so this should never be needed —
  // but a row that predates it, or one inserted by hand, should not cost a
  // send when the answer is sitting in the filename.
  const { sent, result } = await capture({
    to: "919876543210",
    text: "A caption",
    kind: "image",
    base64: "aGVsbG8=",
    filename: "the-arbour-balcony.JPG",
  });

  assert.ok(result.ok);
  assert.equal(sent?.body.mimetype, "image/jpeg", "case-insensitive on the extension");
});

check("inline media with no derivable content type is refused, not sent", async () => {
  const { sent, result } = await capture({
    to: "919876543210",
    text: "A caption",
    kind: "image",
    base64: "aGVsbG8=",
    filename: "no-extension",
  });

  // Refused here rather than as a bare 400 from the gateway, so the broadcast
  // report says which broadcast and why.
  assert.equal(result.ok, false);
  assert.equal(sent, null, "nothing should reach the gateway");
  if (!result.ok) assert.match(result.error, /content type/i);
});

check("a URL send is left alone — no mimetype is forced onto it", async () => {
  // Deliberately unchanged while the url transport is still being diagnosed:
  // the gateway reads the type from its own fetch, and adding a field to a
  // payload that is mid-investigation only muddies the result.
  const { sent } = await capture({
    to: "919876543210",
    text: "A caption",
    kind: "image",
    url: "https://living.test/media/whatsapp/broadcasts/1-abc.jpg",
    mimeType: "image/jpeg",
  });

  assert.equal(sent?.body.url, "https://living.test/media/whatsapp/broadcasts/1-abc.jpg");
  assert.equal(sent?.body.mimetype, undefined);
});

check("a media send gets a longer timeout than a status check", async () => {
  const { openWAConfig } = await import("../lib/integrations/whatsapp/config");
  const config = openWAConfig();

  // Not a fix for the indefinite hang — that survived 30s with the container
  // idle, so it is not slowness. But ten seconds was always the wrong budget
  // for the one call that moves megabytes.
  assert.ok(
    config.mediaTimeoutMs > config.timeoutMs,
    `media (${config.mediaTimeoutMs}ms) must get more room than the general timeout (${config.timeoutMs}ms)`,
  );
});

check("the panel can say where the gateway will fetch attachments from", async () => {
  // APP_BASE_URL unset on staging made every broadcast point its media fetch at
  // production, because the fallback is the production URL and the fallback is
  // correct in production. Nothing said so, which is the whole problem.
  const { mediaDelivery } = await import("../lib/crm/whatsapp/broadcast");
  process.env.APP_BASE_URL = "https://staging.livingbyitr.com";

  const delivery = mediaDelivery();
  assert.equal(delivery.origin, "https://staging.livingbyitr.com");
  assert.ok(["url", "base64"].includes(delivery.transport));
});

// Awaited inside a main(), because tsx compiles these scripts to CommonJS and
// top-level await is not available there.
async function main() {
  await Promise.all(pending);
  console.log(`\n${checks} checks passed`);
  if (process.exitCode) console.error("Some checks failed.");
}

main();
