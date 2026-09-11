import type { Intent } from "@/lib/ai/crm-intent/schema";
import { LEAD_STATUSES } from "@/lib/db/schema";
import { parseAmount } from "@/lib/money";
import { normaliseIsoDate, resolveRelativeDate } from "./dates";

/**
 * Every command HELP advertises, read without asking a model.
 *
 * These are the CRM's own documented shapes — the strings HELP prints. An
 * employee who types what HELP told them to type must get that command, and a
 * classifier that answers "Which lead?" to "Publish LIV-0010" makes the CRM
 * feel broken no matter how good its English is elsewhere.
 *
 * So the advertised shapes are matched here, first, and the model keeps
 * everything else: the phrasings nobody predicted, the sentences, the messages
 * that mean two things at once. This is a floor under the model, not a
 * replacement for it — and it is also what keeps the CRM usable when Ollama is
 * slow, down, or too small to be reliable.
 *
 * Deliberately conservative throughout. A rule that is not certain returns null
 * and lets the classifier have it, because a confident wrong answer is worse
 * than a slower right one.
 */

export type MatchedCommand = {
  intent: Intent;
  entities: Record<string, string | number>;
};

/** LIV-0010, liv 10, LIV0010 — all the ways a reference gets typed. */
const REFERENCE = /\b(LIV)[\s-]?(\d{1,6})\b/i;

/**
 * An Indian mobile number, however it was spaced.
 *
 * People type "9876543210", "+91 98765 43210" and "098765-43210" and mean the
 * same number, so the separators come out before the shape is judged rather
 * than being written into the pattern.
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
  /^(my|all|the|a|an|me|today|tomorrow|yesterday|this|last|next|hot|warm|cold|new|open|help|status|system|leads?|propert(?:y|ies)|follow[\s-]?ups?|followups?|listings?|drafts?|note|photos?|lead)\b/i;

const looksLikeName = (value: string): boolean => {
  const name = value.trim();
  if (name.length < 2 || name.length > 60) return false;
  if (NOT_A_NAME.test(name)) return false;
  return /^[\p{L}][\p{L}'.-]*(?:\s+[\p{L}'.-]+){0,3}$/u.test(name);
};

const reference = (text: string): string | null => {
  const found = text.match(REFERENCE);
  return found ? `${found[1].toUpperCase()}-${found[2].padStart(4, "0")}` : null;
};

/** call · whatsapp · email · meeting · site visit. */
const KIND_WORDS =
  /\b(call|phone|whats\s?app|email|mail|meeting|meet|site\s?visit|visit)\b/i;

const followUpKind = (text: string): string | null => {
  const found = text.match(KIND_WORDS);
  if (!found) return null;
  const word = found[1].toLowerCase().replace(/\s+/g, "");
  if (word === "phone" || word === "call") return "call";
  if (word === "whatsapp") return "whatsapp";
  if (word === "email" || word === "mail") return "email";
  if (word === "meeting" || word === "meet") return "meeting";
  return "site_visit";
};

/**
 * The lead's name out of a phrase that also carries a when and a how.
 *
 * "Rajesh Pillai WhatsApp at 10am" is a name followed by things that are not
 * the name, so the name is whatever precedes the first of them.
 */
function nameBefore(phrase: string): string | null {
  const cut = phrase.search(
    /\b(at|on|for|tomorrow|today|tonight|next|this|coming|in|by|about|re|via|by)\b|\d/i,
  );
  const head = (cut > 0 ? phrase.slice(0, cut) : phrase)
    .replace(KIND_WORDS, " ")
    .replace(/[,:;]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return looksLikeName(head) ? head : null;
}

/** The status words the CRM actually has, spoken the way people speak them. */
const statusIn = (text: string): string | null => {
  const spoken = text.toLowerCase().replace(/[\s-]+/g, "_");
  for (const status of LEAD_STATUSES) {
    if (spoken.includes(status)) return status;
  }
  if (/\bnegotiat/i.test(text)) return "negotiation";
  if (/\bbook(ed|ing)?\b/i.test(text)) return "booking";
  if (/\bqualif/i.test(text)) return "qualified";
  if (/\bcontacted\b/i.test(text)) return "contacted";
  if (/\bon.?hold\b/i.test(text)) return "on_hold";
  return null;
};

const strip = (value: string) =>
  value.replace(/[?.!,]+$/, "").replace(/\s+/g, " ").trim();

type Rule = (text: string) => MatchedCommand | null;

const RULES: Rule[] = [
  // --- the ones with no arguments at all --------------------------------
  (t) =>
    /^(help|commands?|what can you do)\b/i.test(t) ? { intent: "HELP", entities: {} } : null,

  (t) =>
    /^(system\s+status|status|health)$/i.test(strip(t))
      ? { intent: "GET_SYSTEM_STATUS", entities: {} }
      : null,

  (t) =>
    /^(who\s?am\s?i|my profile|whoami|profile)$/i.test(strip(t))
      ? { intent: "GET_PROFILE", entities: {} }
      : null,

  // "my follow-ups", "show my follow-ups today" — mine, so no lead is named.
  (t) =>
    /\bmy\b/i.test(t) && /\bfollow[\s-]?ups?\b/i.test(t) && !REFERENCE.test(t)
      ? { intent: "GET_MY_FOLLOWUPS", entities: {} }
      : null,

  // "my leads", "my hot leads" — the priority is the only variable.
  (t) => {
    if (!/\bmy\b/i.test(t) || !/\bleads\b/i.test(t)) return null;
    const priority = t.match(/\b(hot|warm|cold)\b/i);
    const entities: Record<string, string | number> = {};
    if (priority) entities.priority = priority[1].toLowerCase();
    return { intent: "GET_MY_LEADS", entities };
  },

  // "add a new property" — the draft form, which asks for the rest itself.
  (t) =>
    /^(add|create|new|start)\s+(a\s+)?(new\s+)?(property|listing|draft)\b/i.test(strip(t)) &&
    !REFERENCE.test(t)
      ? { intent: "CREATE_PROPERTY_DRAFT", entities: {} }
      : null,

  // --- property commands, all anchored on a reference --------------------

  // Price first: it is an UPDATE_PROPERTY shape with one specific field.
  (t) => {
    const ref = reference(t);
    if (!ref) return null;
    if (!/\b(asking\s+)?price|rate|cost\b/i.test(t)) return null;
    if (!/^(change|set|update|make|revise)\b/i.test(strip(t))) return null;
    const after = t.slice(t.search(/\bto\b/i) + 2);
    const amount = parseAmount(after.trim());
    return amount && amount > 0
      ? { intent: "UPDATE_PROPERTY_PRICE", entities: { propertyReference: ref, amount } }
      : null;
  },

  // "add photos to LIV-0010" — parks the thread so the images that follow
  // attach to that listing.
  (t) => {
    if (!/\b(photos?|pictures?|images?|pics?)\b/i.test(t)) return null;
    if (!/^(add|attach|upload|send|put)\b/i.test(strip(t))) return null;
    const ref = reference(t);
    return ref
      ? { intent: "ADD_PROPERTY_MEDIA", entities: { propertyReference: ref } }
      : null;
  },

  (t) => {
    const verb = strip(t).match(/^(un)?publish\b/i);
    const ref = reference(t);
    if (!verb || !ref) return null;
    return {
      intent: verb[1] ? "UNPUBLISH_PROPERTY" : "PUBLISH_PROPERTY",
      entities: { propertyReference: ref },
    };
  },

  // "link LIV-0027 to Raj"
  (t) => {
    const match = strip(t).match(/^(?:link|attach|associate|tag)\s+(.+?)\s+to\s+(.+)$/i);
    const ref = reference(t);
    if (!match || !ref) return null;
    const name = strip(match[2]);
    return looksLikeName(name)
      ? {
          intent: "ASSOCIATE_PROPERTY_TO_LEAD",
          entities: { propertyReference: ref, leadName: name },
        }
      : null;
  },

  // "set LIV-0027 possession to Ready to move"
  (t) => {
    const ref = reference(t);
    if (!ref) return null;
    const match = strip(t).match(/^(?:set|change|update|make)\s+(.+?)\s+to\s+(.+)$/i);
    if (!match) return null;
    const field = strip(match[1].replace(REFERENCE, " "));
    const value = strip(match[2]);
    return field && value
      ? { intent: "UPDATE_PROPERTY", entities: { propertyReference: ref, field, value } }
      : null;
  },

  // --- follow-ups. Checked before the plain lead commands, because "move
  // Raj's follow-up" and "move Raj" are the same verb. -------------------

  (t) => {
    if (!/\bfollow[\s-]?ups?\b/i.test(t)) return null;
    if (!/\b(done|complete[d]?|finished|over)\b/i.test(t)) return null;
    const match = strip(t).match(
      /^(?:mark|set|close)?\s*(.+?)(?:'s|s')?\s+follow[\s-]?up/i,
    );
    const name = match ? strip(match[1].replace(/^(mark|set|close)\s+/i, "")) : "";
    return looksLikeName(name)
      ? { intent: "COMPLETE_FOLLOWUP", entities: { leadName: name } }
      : null;
  },

  (t) => {
    if (!/\bfollow[\s-]?ups?\b/i.test(t)) return null;
    if (!/^(move|reschedule|shift|push|change)\b/i.test(strip(t))) return null;
    const match = strip(t).match(/^\w+\s+(.+?)(?:'s|s')?\s+follow[\s-]?up/i);
    const name = match ? strip(match[1]) : "";
    return looksLikeName(name)
      ? { intent: "RESCHEDULE_FOLLOWUP", entities: withWhen(t, { leadName: name }) }
      : null;
  },

  // "add follow-up for Raj tomorrow at 10am"
  (t) => {
    if (!/\bfollow[\s-]?ups?\b/i.test(t)) return null;
    if (!/^(add|create|book|schedule|set)\b/i.test(strip(t))) return null;
    const match = strip(t).match(/follow[\s-]?ups?\s+(?:for|with)\s+(.+)$/i);
    if (!match) return null;
    const name = nameBefore(match[1]);
    if (!name) return null;
    const kind = followUpKind(match[1]);
    return {
      intent: "ADD_FOLLOWUP",
      entities: withWhen(t, kind ? { leadName: name, followUpKind: kind } : { leadName: name }),
    };
  },

  // --- lead commands -----------------------------------------------------

  // "add note to Raj: interested in OMR"
  (t) => {
    const match = strip(t).match(
      /^(?:add\s+)?note\s+(?:to|for|on)\s+([^:]+?)\s*[:\-–]\s*(.+)$/i,
    );
    if (!match) return null;
    const name = strip(match[1]);
    const note = match[2].trim();
    return looksLikeName(name) && note
      ? { intent: "ADD_LEAD_NOTE", entities: { leadName: name, note } }
      : null;
  },

  // "Raj called about LIV-0027" — logging what happened.
  //
  // Deliberately narrow: a name, a contact verb, and the listing it was about.
  // A richer sentence — "Raj called this morning, wants a villa under 90L" —
  // has more in it than a summary, and the model can pull the rest out, so it
  // is left alone.
  (t) => {
    const match = strip(t).match(
      /^(.+?)\s+(called|rang|visited|emailed|messaged|met|came in)\s+(?:about|re|regarding|for)\s+(.+)$/i,
    );
    if (!match) return null;
    const ref = reference(match[3]);
    const name = strip(match[1]);
    if (!ref || !looksLikeName(name)) return null;
    // Only when the reference is the whole object of the sentence.
    if (strip(match[3].replace(REFERENCE, " ")) !== "") return null;
    return {
      intent: "ADD_LEAD_ACTIVITY",
      entities: {
        leadName: name,
        propertyReference: ref,
        summary: strip(t),
      },
    };
  },

  // "assign Raj to Anitha"
  (t) => {
    const match = strip(t).match(/^assign\s+(.+?)\s+to\s+(.+)$/i);
    if (!match) return null;
    const name = strip(match[1]);
    const employee = strip(match[2]);
    return looksLikeName(name) && looksLikeName(employee)
      ? { intent: "ASSIGN_LEAD", entities: { leadName: name, employeeName: employee } }
      : null;
  },

  // "move Raj to negotiation" — only when the destination is a real status.
  (t) => {
    const match = strip(t).match(/^(?:move|change|set|mark|put)\s+(.+?)\s+to\s+(.+)$/i);
    if (!match) return null;
    const status = statusIn(match[2]);
    const name = strip(match[1].replace(/(?:'s|s')\s+status$/i, ""));
    return status && looksLikeName(name)
      ? { intent: "CHANGE_LEAD_STATUS", entities: { leadName: name, status } }
      : null;
  },

  // "add lead Raj 9876543210"
  (t) => {
    if (!/^(add|create|new)\s+lead\b/i.test(strip(t))) return null;
    const rest = strip(t).replace(/^(add|create|new)\s+lead\b/i, "").trim();
    const mobile = mobileIn(rest);
    if (!mobile) return null;
    const name = strip(rest.replace(mobile.raw, " "));
    return looksLikeName(name)
      ? { intent: "CREATE_LEAD", entities: { leadName: name, mobile: mobile.digits } }
      : null;
  },

  // "set Raj's city to Kochi" — no reference, so it is the lead being edited.
  (t) => {
    if (REFERENCE.test(t)) return null;
    const match = strip(t).match(/^(?:set|change|update)\s+(.+?)(?:'s|s')\s+(.+?)\s+to\s+(.+)$/i);
    if (!match) return null;
    const name = strip(match[1]);
    const field = strip(match[2]);
    const value = strip(match[3]);
    return looksLikeName(name) && field && value
      ? { intent: "UPDATE_LEAD", entities: { leadName: name, field, value } }
      : null;
  },

  // --- lookups, last: they are the loosest shapes ------------------------

  (t) => {
    const ref = reference(t);
    if (!ref) return null;
    const rest = strip(t.replace(REFERENCE, " "));
    if (rest === "") return { intent: "GET_PROPERTY", entities: { propertyReference: ref } };
    return /^(show|get|find|open|view)\s*(me)?\s*(the)?\s*(property|listing)?$/i.test(rest)
      ? { intent: "GET_PROPERTY", entities: { propertyReference: ref } }
      : null;
  },

  (t) => {
    const match = strip(t).match(
      /^(?:show|get|find|open|view)\s+(?:me\s+)?(?:the\s+)?(?:lead\s+)?(.+)$/i,
    );
    if (!match) return null;
    const name = strip(match[1]);
    return looksLikeName(name) ? { intent: "GET_LEAD", entities: { leadName: name } } : null;
  },

  (t) => {
    const match = strip(t).match(/^lead\s+(.+)$/i);
    if (!match) return null;
    const name = strip(match[1]);
    return looksLikeName(name) ? { intent: "GET_LEAD", entities: { leadName: name } } : null;
  },
];

/**
 * The day and time, when the message plainly carries one.
 *
 * dates.ts still reads both out of the message inside the handler — this only
 * gets the command past the "what is it missing" gate, so a follow-up with a
 * day in it is not asked for the day it already gave.
 */
function withWhen(
  text: string,
  base: Record<string, string | number>,
): Record<string, string | number> {
  const relative = resolveRelativeDate(text, new Date());
  const iso = relative?.kind === "date" ? relative.iso : normaliseIsoDate(text);
  return iso ? { ...base, date: iso } : base;
}

/**
 * The answer to "which day?" or "which property?", read out of the reply.
 *
 * The classifier labelled "today" as CONFIRM and returned no entities with it,
 * so resuming the parked command left the same field missing and asked the same
 * question again. The field being waited on is known, and a one-word reply to
 * it is not a sentence — so it is read here instead.
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
      return looksLikeName(trimmed) ? trimmed : null;
    case "status":
      return statusIn(trimmed);
    case "employeeName":
      return looksLikeName(trimmed) ? trimmed : null;
    case "date": {
      // Enough to get past the "what is this command missing" gate. scheduleAt
      // then reads the day and the time out of the same message itself, and its
      // reading is the one that books the follow-up.
      const relative = resolveRelativeDate(trimmed, new Date());
      if (relative?.kind === "date") return relative.iso;
      return normaliseIsoDate(trimmed);
    }
    case "note":
    case "summary":
      // Free text answering "what should it say?" is whatever was typed.
      return trimmed.length <= 1000 ? trimmed : trimmed.slice(0, 1000);
    default:
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
  if (!trimmed || trimmed.length > 300) return null;
  for (const rule of RULES) {
    const found = rule(trimmed);
    if (found) return found;
  }
  return null;
}
