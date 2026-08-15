import { CRM_TIMEZONE } from "@/lib/integrations/whatsapp/config";
import { zonedDateTime } from "./time";

// §7. Relative dates, resolved in code rather than by the model.
//
// The model is asked for an ISO date and usually returns one, but date
// arithmetic is exactly the kind of thing language models get quietly wrong —
// and a follow-up booked on the wrong Friday is a missed call nobody notices
// until the lead has gone cold. Where the message plainly says "tomorrow" or
// "next Monday", that is computed here and wins.
//
// Ambiguity is never resolved by guessing. "Friday" sent on a Friday returns
// null, and the pipeline asks.

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/** Which day it is in Living's timezone, 0 = Sunday. */
function todayInZone(now: Date, timeZone: string) {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  })
    .format(now)
    .toLowerCase();
  return { iso, weekdayIndex: WEEKDAYS.indexOf(weekday as (typeof WEEKDAYS)[number]) };
}

/** ISO date `days` after the given ISO date. */
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type RelativeDate =
  | { kind: "date"; iso: string }
  /** Recognised but genuinely ambiguous — ask rather than pick. */
  | { kind: "ambiguous"; because: string }
  | null;

/**
 * Reads a relative date out of what the employee actually wrote.
 *
 * Returns null when the message contains no relative phrase at all, which is
 * the signal to fall back to whatever the model produced.
 */
export function resolveRelativeDate(
  text: string,
  now = new Date(),
  timeZone = CRM_TIMEZONE,
): RelativeDate {
  const said = text.toLowerCase();
  const { iso, weekdayIndex } = todayInZone(now, timeZone);

  if (/\bday after tomorrow\b/.test(said)) return { kind: "date", iso: addDays(iso, 2) };
  if (/\btomorrow\b/.test(said)) return { kind: "date", iso: addDays(iso, 1) };
  if (/\btoday\b|\bthis evening\b|\btonight\b|\bthis afternoon\b/.test(said)) {
    return { kind: "date", iso };
  }

  const inDays = said.match(/\bin (\d{1,2}) days?\b/);
  if (inDays) return { kind: "date", iso: addDays(iso, Number(inDays[1])) };

  // "next week" with no weekday is a week from today, not a specific day.
  if (/\bnext week\b/.test(said) && !WEEKDAYS.some((day) => said.includes(day))) {
    return { kind: "date", iso: addDays(iso, 7) };
  }

  for (const [index, day] of WEEKDAYS.entries()) {
    if (!new RegExp(`\\b${day}\\b`).test(said)) continue;

    // Said on the same weekday, "Friday" could mean today or in a week. The
    // difference is a week of silence on a lead, so it is asked about.
    if (index === weekdayIndex) {
      return {
        kind: "ambiguous",
        because: `today is ${day.charAt(0).toUpperCase()}${day.slice(1)}`,
      };
    }

    // Otherwise the next one ahead. "next Friday" and "Friday" resolve the
    // same way on purpose — the two readings disagree between speakers, and
    // the nearer one is what a follow-up almost always means.
    const ahead = (index - weekdayIndex + 7) % 7;
    return { kind: "date", iso: addDays(iso, ahead) };
  }

  return null;
}

/**
 * The date a scheduling command should actually use.
 *
 * The message wins over the model where it says something unambiguous, the
 * model fills the gap otherwise, and a result in the past is refused rather
 * than booked — a follow-up dated yesterday is never what anyone meant.
 */
export function scheduleAt(input: {
  text: string;
  modelDate?: string;
  time?: string;
  now?: Date;
}):
  | { ok: true; dueAt: Date }
  | { ok: false; ask: string } {
  const now = input.now ?? new Date();
  const relative = resolveRelativeDate(input.text, now);

  if (relative?.kind === "ambiguous") {
    return {
      ok: false,
      ask: `Which one — ${relative.because}. Give me the date, or say "next week".`,
    };
  }

  const iso = relative?.iso ?? input.modelDate;
  if (!iso) return { ok: false, ask: "Which day?" };

  const dueAt = zonedDateTime(iso, input.time);
  if (!dueAt) return { ok: false, ask: "I couldn't read that date. Try “tomorrow at 10am”." };

  // Start of today in Living's timezone — a time earlier today is fine (someone
  // logging a call they need to return), yesterday is not.
  const startOfToday = zonedDateTime(todayInZone(now, CRM_TIMEZONE).iso, "00:00");
  if (startOfToday && dueAt < startOfToday) {
    return {
      ok: false,
      ask: `That works out to ${iso}, which has already passed. Which day did you mean?`,
    };
  }

  return { ok: true, dueAt };
}
