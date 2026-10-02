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

check("a document with no content type is refused, not guessed", async () => {
  const { sent, result } = await capture({
    ...photo,
    kind: "document",
    filename: "brochure.pdf",
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

// Awaited inside a main(), because tsx compiles these scripts to CommonJS and
// top-level await is not available there.
async function main() {
  await Promise.all(pending);
  console.log(`\n${checks} checks passed`);
  if (process.exitCode) console.error("Some checks failed.");
}

main();
