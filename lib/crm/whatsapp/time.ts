import { CRM_TIMEZONE } from "@/lib/integrations/whatsapp/config";
import { dayBounds, istDate, zonedDateTime as zoned } from "@/lib/time";

// §26. "Tomorrow at 10" has to mean 10am in Kochi, whatever the server thinks
// the time is. The model returns a plain date and time; this turns that into an
// instant.
//
// The conversion itself now lives in lib/time.ts, because the admin panel needs
// exactly the same one — a follow-up typed into a form and a follow-up spoken
// over WhatsApp are the same booking, and having two implementations of "what
// does 2pm mean" is how they came to disagree by five and a half hours.

/**
 * "2026-08-18" + "10:00" in Living's timezone → the corresponding instant.
 */
export function zonedDateTime(
  date: string,
  time: string | undefined,
  timeZone = CRM_TIMEZONE,
): Date | null {
  return zoned(date, time, timeZone);
}

/** Start and end of "today" in Living's timezone, as instants. */
export function crmDayBounds(now = new Date(), timeZone = CRM_TIMEZONE) {
  return dayBounds(istDate(now, timeZone), timeZone)!;
}
