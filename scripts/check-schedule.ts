/**
 * Broadcast scheduling, checked without a database or a cron.
 *
 *   npm run check:schedule
 *
 * The rules that decide *whether a scheduled broadcast goes out* and *whether
 * anyone finds out when it does not*. Both are silent failures by nature — a
 * broadcast that never sends looks identical to a quiet week — so they get a
 * check rather than a comment.
 *
 * The release query itself needs Postgres (the conditional UPDATE is the lock)
 * and is in docs/broadcasts.md as a manual pass.
 */
import assert from "node:assert/strict";

import {
  SCHEDULE_GRACE_MINUTES,
  missedItsWindow,
} from "../lib/crm/whatsapp/broadcast";
import { HEARTBEAT_STALE_MINUTES } from "../lib/crm/whatsapp/scheduler";
import { BROADCAST_STATUSES } from "../lib/db/schema";
import { IST, formatDateTime, zonedDateTime } from "../lib/time";

let checks = 0;

const check = (name: string, fn: () => void) => {
  try {
    fn();
    checks += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
};

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
const minutesAhead = (n: number) => new Date(Date.now() + n * 60_000);

console.log("\nBroadcast scheduling checks\n");

check("10am in the composer is 10am in Kochi, not on the server", () => {
  // The bug this prevents: new Date("2026-10-05T10:00") is the *server's* 10am.
  // On a UTC host that is 10:00Z — 3:30pm in Kochi. A breakfast offer after
  // dinner, and invisible to anyone testing on an Indian laptop.
  const when = zonedDateTime("2026-10-05", "10:00");
  assert.ok(when, "a valid date and time must resolve");
  assert.equal(when.toISOString(), "2026-10-05T04:30:00.000Z");

  const shown = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(when);
  assert.match(shown, /10:00\s*am/i, `scheduled 10am, reads back as "${shown}"`);
});

check("a time typed back out of the panel is the time that was entered", () => {
  // The round trip: instant → the two strings the native pickers hold → instant.
  // Getting this wrong by a timezone is how a reschedule silently moves a
  // broadcast five and a half hours.
  const original = zonedDateTime("2026-12-31", "23:30");
  assert.ok(original);

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(original);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(original);

  assert.equal(date, "2026-12-31", "the date must not slip to the UTC day");
  assert.equal(time, "23:30");
  assert.equal(
    zonedDateTime(date, time)?.toISOString(),
    original.toISOString(),
    "the round trip must land on the same instant",
  );
});

check("a date before 5:30am does not slip to the previous day", () => {
  // The specific case that breaks toISOString().slice(0,10): 2am IST is the
  // previous day in UTC, so a naive split shows the operator yesterday's date.
  const when = zonedDateTime("2026-10-05", "02:00");
  assert.ok(when);
  assert.equal(when.toISOString().slice(0, 10), "2026-10-04", "UTC really is the day before");

  const istDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
  assert.equal(istDay, "2026-10-05", "the panel must show the Kochi day");
});

check("an unreadable date is rejected, never treated as now", () => {
  // The one failure mode this whole feature exists to avoid: a mistyped date
  // silently becoming an immediate send to several hundred people.
  for (const bad of ["", "tomorrow", "05-10-2026", "2026-13-45", "not a date"]) {
    assert.equal(
      zonedDateTime(bad, "10:00"),
      null,
      `"${bad}" must not resolve to an instant`,
    );
  }
});

check("a missing time defaults to a sane hour rather than midnight", () => {
  const when = zonedDateTime("2026-10-05", undefined);
  assert.ok(when);
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    hour12: false,
  }).format(when);
  // Midnight would mean a broadcast going out at 00:00 because somebody left
  // the time field alone.
  assert.equal(hour, "10", "a blank time means 10am, not midnight");
});

check("a broadcast inside the grace window has not missed it", () => {
  assert.equal(
    missedItsWindow({
      status: "paused",
      startedAt: null,
      scheduledFor: minutesAgo(SCHEDULE_GRACE_MINUTES - 10),
    }),
    false,
    "still releasable, so it is merely late",
  );
});

check("a broadcast past the grace window counts as missed", () => {
  assert.equal(
    missedItsWindow({
      status: "paused",
      startedAt: null,
      scheduledFor: minutesAgo(SCHEDULE_GRACE_MINUTES + 10),
    }),
    true,
  );
});

check("a broadcast paused by hand mid-send is not reported as missed", () => {
  // This is the distinction the derivation rests on. An operator who pressed
  // Pause must not be told the scheduler failed — `startedAt` is what separates
  // "never went" from "went, then stopped".
  assert.equal(
    missedItsWindow({
      status: "paused",
      startedAt: minutesAgo(400),
      scheduledFor: minutesAgo(SCHEDULE_GRACE_MINUTES + 60),
    }),
    false,
  );
});

check("nothing else is ever reported as missed", () => {
  const scheduledFor = minutesAgo(SCHEDULE_GRACE_MINUTES + 60);
  for (const status of ["draft", "scheduled", "sending", "completed", "cancelled"]) {
    assert.equal(
      missedItsWindow({ status, startedAt: null, scheduledFor }),
      false,
      `${status} must not read as a missed schedule`,
    );
  }
  // A future broadcast is simply waiting.
  assert.equal(
    missedItsWindow({
      status: "paused",
      startedAt: null,
      scheduledFor: minutesAhead(60),
    }),
    false,
  );
  // And one with no schedule at all cannot have missed one.
  assert.equal(
    missedItsWindow({ status: "paused", startedAt: null, scheduledFor: null }),
    false,
  );
});

check("scheduled is a real broadcast status the column accepts", () => {
  assert.ok(
    (BROADCAST_STATUSES as readonly string[]).includes("scheduled"),
    "the release query filters on it, so the column has to allow it",
  );
});

check("the staleness alarm is slacker than any sane cron interval", () => {
  // An alarm that cries wolf is one people learn to ignore, which costs exactly
  // the outage it was meant to catch. The suggested cron is every 5 minutes.
  assert.ok(
    HEARTBEAT_STALE_MINUTES >= 15,
    `${HEARTBEAT_STALE_MINUTES} minutes is tight enough to fire on a normally late tick`,
  );
  // And it must still be short enough to catch a dead cron the same working day.
  assert.ok(
    HEARTBEAT_STALE_MINUTES <= 240,
    `${HEARTBEAT_STALE_MINUTES} minutes is too long to notice a stopped scheduler`,
  );
});

check("the grace window is long enough to survive a reboot, short enough to matter", () => {
  assert.ok(
    SCHEDULE_GRACE_MINUTES >= 30,
    "a window under half an hour turns an ordinary restart into a missed broadcast",
  );
  assert.ok(
    SCHEDULE_GRACE_MINUTES <= 1440,
    "beyond a day, a released broadcast is an offer arriving after its deadline",
  );
});

check("a scheduled time renders in Kochi time wherever the server is", () => {
  const when = zonedDateTime("2026-10-05", "18:45");
  assert.ok(when);
  const label = formatDateTime(when);
  assert.match(label, /6:45\s*pm/i, `expected 6:45 pm, got "${label}"`);
  assert.match(label, /Oct/i, `expected the date too, got "${label}"`);
});

console.log(`\n${checks} checks passed`);
if (process.exitCode) console.error("Some checks failed.");
