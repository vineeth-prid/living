// Last instant of the calendar quarter a date falls in — 31 Mar, 30 Jun,
// 30 Sep or 31 Dec. Day 0 of the following month is the last day of this one,
// which gets month lengths and leap years right without a lookup table.
//
// Local time by design: the countdown that uses this runs in the browser, so
// it should end at midnight where the reader is, not at midnight UTC.
export function quarterEnd(now: Date): Date {
  const endMonth = Math.floor(now.getMonth() / 3) * 3 + 2;
  return new Date(now.getFullYear(), endMonth + 1, 0, 23, 59, 59, 999);
}

export function quarterOf(now: Date): number {
  return Math.floor(now.getMonth() / 3) + 1;
}
