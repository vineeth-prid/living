import { CRM_TIMEZONE } from "@/lib/integrations/whatsapp/config";

// §26. "Tomorrow at 10" has to mean 10am in Kochi, whatever the server thinks
// the time is. The model returns a plain date and time; this turns that into an
// instant.

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
 * "2026-08-18" + "10:00" in Living's timezone → the corresponding instant.
 *
 * ponytail: one offset correction rather than an iterative solve. India has no
 * daylight saving, so the offset is constant and this is exact; in a DST zone a
 * time inside the one-hour transition could land an hour out. Iterate, or reach
 * for Temporal once it ships, if Living ever operates in such a zone.
 */
export function zonedDateTime(
  date: string,
  time: string | undefined,
  timeZone = CRM_TIMEZONE,
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const clock = time && /^\d{2}:\d{2}$/.test(time) ? time : "10:00";

  const naive = new Date(`${date}T${clock}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  return new Date(naive.getTime() - offsetMs(naive, timeZone));
}

/** Start and end of "today" in Living's timezone, as instants. */
export function crmDayBounds(now = new Date(), timeZone = CRM_TIMEZONE) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const from = zonedDateTime(date, "00:00", timeZone)!;
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { from, to };
}
