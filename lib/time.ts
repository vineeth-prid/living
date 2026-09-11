/**
 * Living runs on Indian Standard Time, everywhere, with no exceptions.
 *
 * The business is in Kochi, the staff are in Kochi, and the people they call
 * are in Kochi. A date typed into the panel, a date spoken over WhatsApp and a
 * date printed back onto a screen all mean the same wall clock, and none of
 * them mean whatever zone the server happens to boot in.
 *
 * That mattered: a follow-up booked for 2pm in the panel came back as 7:30pm,
 * because `new Date("2026-09-11T14:00")` is the *server's* 2pm, and on a UTC
 * host that is 14:00Z — five and a half hours out, and invisible on an Indian
 * laptop where the server zone happens to be right. Both halves of the round
 * trip live here now, so they cannot disagree.
 *
 * IST has no daylight saving, so the offset is a constant and every conversion
 * below is exact.
 */

export const IST = "Asia/Kolkata";

/** The zone's offset from UTC, in milliseconds, at a given instant. */
function offsetMs(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Intl renders midnight as 24 in some locales' hour12:false output.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - at.getTime();
}

/**
 * "2026-09-11" + "14:00" in Indian time → the instant to store.
 *
 * One offset correction rather than an iterative solve: India has no daylight
 * saving, so the offset is constant and this is exact.
 */
export function zonedDateTime(
  date: string,
  time: string | undefined,
  timeZone = IST,
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const clock = time && /^\d{2}:\d{2}$/.test(time) ? time : "10:00";

  const naive = new Date(`${date}T${clock}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  return new Date(naive.getTime() - offsetMs(naive, timeZone));
}

/** Today's date in Indian time, as "YYYY-MM-DD". */
export const istDate = (now = new Date(), timeZone = IST): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

/** Start and end of a day in Indian time, as instants. */
export function dayBounds(date: string, timeZone = IST) {
  const from = zonedDateTime(date, "00:00", timeZone);
  if (!from) return null;
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1) };
}

/**
 * The last instant of a day in Indian time.
 *
 * What a "to" date on a filter means. `new Date("2026-09-11T23:59:59")` meant
 * the server's end of day, so on a UTC host a range ending today quietly
 * included five and a half hours of tomorrow — and excluded the same from the
 * start.
 */
export const endOfDay = (date: string, timeZone = IST): Date | null =>
  dayBounds(date, timeZone)?.to ?? null;

/** The first instant of a day in Indian time. */
export const startOfDay = (date: string, timeZone = IST): Date | null =>
  zonedDateTime(date, "00:00", timeZone);

const formatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: IST, ...options });

/**
 * "11 Sept 2026, 2:00 pm" — always the Kochi wall clock.
 *
 * Explicit about the zone so a laptop set to something else, or a server
 * rendering the same markup, shows the hour the follow-up was actually booked
 * for rather than the hour local to whoever is looking.
 */
export const formatDateTime = (value: Date | null | undefined): string =>
  value ? formatter({ dateStyle: "medium", timeStyle: "short" }).format(value) : "—";

export const formatDate = (value: Date | null | undefined): string =>
  value ? formatter({ dateStyle: "medium" }).format(value) : "—";
