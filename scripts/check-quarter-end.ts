import assert from "node:assert/strict";
import { quarterEnd, quarterOf } from "../lib/quarter";

// The platform countdown rolls itself over, so the only thing worth pinning
// down is that every date lands on the right quarter boundary.
const cases: [string, string, number][] = [
  ["2026-01-01T00:00:00", "2026-03-31", 1],
  ["2026-02-14T12:00:00", "2026-03-31", 1],
  ["2026-03-31T23:00:00", "2026-03-31", 1], // last day still counts to itself
  ["2026-04-01T00:00:00", "2026-06-30", 2],
  ["2026-06-30T09:00:00", "2026-06-30", 2],
  ["2026-07-01T00:00:00", "2026-09-30", 3],
  ["2026-08-17T10:30:00", "2026-09-30", 3], // the quarter we ship in
  ["2026-09-30T23:59:00", "2026-09-30", 3],
  ["2026-10-01T00:00:00", "2026-12-31", 4],
  ["2026-12-31T18:00:00", "2026-12-31", 4],
  ["2028-02-29T12:00:00", "2028-03-31", 1], // leap day
];

for (const [input, expectedDay, expectedQuarter] of cases) {
  const end = quarterEnd(new Date(input));
  const actual = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  assert.equal(actual, expectedDay, `${input} → expected ${expectedDay}, got ${actual}`);
  assert.equal(end.getHours(), 23, `${input} should end at 23:59:59.999`);
  assert.equal(end.getMinutes(), 59);
  assert.equal(end.getSeconds(), 59);
  assert.equal(quarterOf(new Date(input)), expectedQuarter, `${input} quarter`);
}

// Rolling over is the whole point: one second past the boundary must hand
// back the next quarter, not a negative or a stale one.
const boundary = new Date("2026-09-30T23:59:59.999");
const justAfter = new Date(boundary.getTime() + 1);
assert.equal(quarterEnd(justAfter).getMonth(), 11, "past Q3 end it must target 31 Dec");
assert.ok(quarterEnd(justAfter).getTime() > justAfter.getTime(), "next target is in the future");

// And the countdown never shows a negative: the target is always >= now.
for (const [input] of cases) {
  const now = new Date(input);
  assert.ok(quarterEnd(now).getTime() >= now.getTime(), `${input} must not be past its own quarter end`);
}

console.log(`quarter-end: ${cases.length} dates + rollover OK`);
