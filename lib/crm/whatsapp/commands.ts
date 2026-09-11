import type { Intent } from "@/lib/ai/crm-intent/schema";
import { normaliseIsoDate, resolveRelativeDate } from "./dates";

/**
 * The commands that do not need a model to be understood.
 *
 * Every intent used to go through the classifier, and a small local model
 * misreads the rigid ones in ways that are not recoverable: "Add photos to
 * LIV-0010" came back as a lead command and asked "Which lead?", "Show me
 * Rajesh Pillai" came back as a scheduling command and asked "Which day?", and
 * "Add lead Raj 9876543210" came back below the confidence floor and was
 * answered with "I didn't follow that".
 *
 * These shapes are not ambiguous English. A regular expression reads them
 * exactly, every time, at no cost and with no network call — and the CRM keeps
 * working for them when Ollama is slow, down, or simply small. Anything that is
 * genuinely a sentence still goes to the model; this only claims the messages
 * whose shape leaves nothing to interpret.
 *
 * Deliberately conservative. A pattern that is not certain returns null and
 * lets the classifier have it, because a wrong deterministic answer is worse
 * than a slow correct one.
 */

export type MatchedCommand = {
  intent: Intent;
  entities: Record<string, string>;
};

/** LIV-0010, liv 10, LIV0010 — all the ways a reference gets typed. */
const REFERENCE = /\b(LIV)[\s-]?(\d{1,6})\b/i;

/**
 * An Indian mobile number, however it was spaced.
 *
 * People type "9876543210", "+91 98765 43210" and "098765-43210" and mean the
 * same number, so the separators come out before the shape is judged rather
 * than being written into the pattern. Ten digits starting 6-9 is the test; a
 * country code or a trunk zero in front is allowed, and dropped.
 */
const DIGIT_RUN = /(?:\+?\s*91[\s-]?)?\d[\d\s-]{8,16}\d/g;

function mobileIn(text: string): { raw: string; digits: string } | null {
  for (const candidate of text.match(DIGIT_RUN) ?? []) {
    let digits = candidate.replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (/^[6-9]\d{9}$/.test(digits)) return { raw: candidate, digits };
  }
  return null;
}

/**
 * Words that look like a name to a regex but are not one.
 *
 * "show my leads" and "show me Rajesh" are the same shape, so the list of
 * things that are never a person is what keeps the two apart.
 */
const NOT_A_NAME =
  /^(my|all|the|a|an|me|today|tomorrow|yesterday|this|last|next|hot|warm|cold|new|open|help|status|leads?|propert(?:y|ies)|follow[\s-]?ups?|followups?|listings?|drafts?)\b/i;

const looksLikeName = (value: string): boolean => {
  const name = value.trim();
  if (name.length < 2 || name.length > 60) return false;
  if (NOT_A_NAME.test(name)) return false;
  // A name is letters, and possibly a second word. Digits mean it is a
  // reference or a number, which other patterns own.
  return /^[\p{L}][\p{L}'.-]*(?:\s+[\p{L}'.-]+){0,3}$/u.test(name);
};

const reference = (text: string): string | null => {
  const found = text.match(REFERENCE);
  return found ? `${found[1].toUpperCase()}-${found[2].padStart(4, "0")}` : null;
};

type Rule = (text: string) => MatchedCommand | null;

const RULES: Rule[] = [
  // help
  (text) =>
    /^(help|commands?|what can you do\??)$/i.test(text)
      ? { intent: "HELP", entities: {} }
      : null,

  // Photos for a named property. Parks the thread on that listing so the
  // images that follow attach to it rather than arriving with no context.
  (text) => {
    if (!/\b(photos?|pictures?|images?|pics?)\b/i.test(text)) return null;
    if (!/^(add|attach|upload|send|put)\b/i.test(text.trim())) return null;
    const ref = reference(text);
    return ref
      ? { intent: "ADD_PROPERTY_MEDIA", entities: { propertyReference: ref } }
      : null;
  },

  // add lead <name> <mobile> — in either order, since both get typed.
  (text) => {
    if (!/^(add|create|new)\s+lead\b/i.test(text.trim())) return null;
    const rest = text.trim().replace(/^(add|create|new)\s+lead\b/i, "").trim();
    const mobile = mobileIn(rest);
    if (!mobile) return null;
    const name = rest.replace(mobile.raw, " ").replace(/\s+/g, " ").trim();
    if (!looksLikeName(name)) return null;
    return {
      intent: "CREATE_LEAD",
      entities: { leadName: name, mobile: mobile.digits },
    };
  },

  // publish / unpublish LIV-0010
  (text) => {
    const match = text.trim().match(/^(un)?publish\b/i);
    if (!match) return null;
    const ref = reference(text);
    if (!ref) return null;
    return {
      intent: match[1] ? "UNPUBLISH_PROPERTY" : "PUBLISH_PROPERTY",
      entities: { propertyReference: ref },
    };
  },

  // A bare reference, or one asked about: "LIV-0010", "show property LIV-0010".
  (text) => {
    const ref = reference(text);
    if (!ref) return null;
    const bare = text.trim().replace(REFERENCE, "").trim();
    if (bare === "") return { intent: "GET_PROPERTY", entities: { propertyReference: ref } };
    return /^(show|get|find|open|view)\s*(me\s+)?(the\s+)?(property|listing)?$/i.test(bare)
      ? { intent: "GET_PROPERTY", entities: { propertyReference: ref } }
      : null;
  },

  // show me <name> — the lead lookup, guarded against "show my leads".
  (text) => {
    const match = text
      .trim()
      .match(/^(?:show|get|find|open|view)\s+(?:me\s+)?(?:the\s+)?(?:lead\s+)?(.+)$/i);
    if (!match) return null;
    const name = match[1].replace(/[?.!]+$/, "").trim();
    return looksLikeName(name)
      ? { intent: "GET_LEAD", entities: { leadName: name } }
      : null;
  },

  // "lead Rajesh Pillai" on its own.
  (text) => {
    const match = text.trim().match(/^lead\s+(.+)$/i);
    if (!match) return null;
    const name = match[1].replace(/[?.!]+$/, "").trim();
    return looksLikeName(name)
      ? { intent: "GET_LEAD", entities: { leadName: name } }
      : null;
  },
];

/**
 * The answer to "which day?" or "which property?", read out of the reply.
 *
 * The classifier labelled "today" as CONFIRM and returned no entities with it,
 * so resuming the parked command left the same field missing and asked the same
 * question again. The field the CRM is waiting on is known, and a one-word
 * reply to it is not a sentence — so it is read here instead, on the same
 * principle as the rest of this file.
 *
 * Only consulted when the model supplied nothing for the field; anything it
 * does answer still wins.
 */
export function answerFor(field: string, text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  switch (field) {
    case "propertyReference":
      return reference(trimmed);
    case "mobile":
      return mobileIn(trimmed)?.digits ?? null;
    case "leadName":
      // Only a bare name. A sentence here is a new command, not an answer.
      return looksLikeName(trimmed) ? trimmed : null;
    case "date": {
      // Enough to get past the "what is this command missing" gate. scheduleAt
      // then reads the day and the time out of the same message itself, and
      // its reading is the one that books the follow-up.
      const relative = resolveRelativeDate(trimmed, new Date());
      if (relative?.kind === "date") return relative.iso;
      return normaliseIsoDate(trimmed);
    }
    default:
      // note, status, amount and the rest are read by the handlers themselves,
      // from the same message — scheduleAt already prefers the employee's
      // words to the model's for exactly this reason.
      return null;
  }
}

/**
 * The command this message plainly is, or null to let the model decide.
 *
 * Never called while a form or a clarification is in flight — an answer to a
 * question is not a new command, and the caller checks that first.
 */
export function matchCommand(text: string): MatchedCommand | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 200) return null;
  for (const rule of RULES) {
    const found = rule(trimmed);
    if (found) return found;
  }
  return null;
}
