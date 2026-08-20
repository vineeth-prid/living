import { z } from "zod";

// §16. The contract the model has to meet before a single CRM function is
// called. Anything that does not parse here is treated as "I did not
// understand", never as a best guess.

export const INTENTS = [
  // CRM — read
  "GET_MY_FOLLOWUPS",
  "GET_MY_LEADS",
  "GET_LEAD",
  // CRM — write
  "CREATE_LEAD",
  "UPDATE_LEAD",
  "ADD_LEAD_NOTE",
  "CHANGE_LEAD_STATUS",
  "ASSIGN_LEAD",
  "ADD_FOLLOWUP",
  "COMPLETE_FOLLOWUP",
  "RESCHEDULE_FOLLOWUP",
  "ADD_LEAD_ACTIVITY",
  "ASSOCIATE_PROPERTY_TO_LEAD",
  // Properties
  "GET_PROPERTY",
  "CREATE_PROPERTY_DRAFT",
  "UPDATE_PROPERTY",
  "UPDATE_PROPERTY_PRICE",
  "ADD_PROPERTY_MEDIA",
  "PUBLISH_PROPERTY",
  "UNPUBLISH_PROPERTY",
  // General
  "HELP",
  "GET_PROFILE",
  "GET_SYSTEM_STATUS",
  "CONFIRM",
  "CANCEL",
  // The model's way of saying it does not know. Explicit, because the
  // alternative is a confident wrong intent.
  "CLARIFICATION_REQUIRED",
] as const;

export type Intent = (typeof INTENTS)[number];

/**
 * "Not present" arrives in three spellings, and only one of them is the one
 * the schema was written for.
 *
 * A model answering in `format: "json"` against a fixed shape fills in every
 * documented key. When it has no value for one, what comes back is `""` or
 * `null` — not an absent key. `.optional()` accepts only absent-or-undefined,
 * so an empty string is a length violation, and one blank field discards the
 * whole response including a perfectly correct intent.
 *
 * Normalising here rather than on each field is deliberate: every optional
 * field in this file has the same shape and would need the same guard, and a
 * field added later would silently reintroduce the bug.
 */
const dropBlanks = (value: unknown) => {
  // A null object is an absent object; let `.default({})` do its job.
  if (value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[key] = v;
  }
  return out;
};

/**
 * Entities are all optional and all loosely typed on purpose: this is what the
 * model claims it read, not what the CRM will act on. Each command handler
 * re-validates the fields it needs and resolves names to real rows itself.
 */
const entityFields = z
  .object({
    leadName: z.string().trim().min(1).optional(),
    leadReference: z.string().trim().min(1).optional(),
    propertyReference: z.string().trim().min(1).optional(),
    propertyQuery: z.string().trim().min(1).optional(),
    employeeName: z.string().trim().min(1).optional(),
    status: z.string().trim().min(1).optional(),
    priority: z.string().trim().min(1).optional(),
    note: z.string().trim().min(1).optional(),
    /** ISO date, resolved by the model against the date it was given. */
    date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** 24-hour HH:MM. */
    time: z.string().trim().regex(/^\d{2}:\d{2}$/).optional(),
    followUpKind: z.string().trim().min(1).optional(),
    /** Rupees, as a plain number. "1.75 crore" → 17500000. */
    amount: z.number().nonnegative().optional(),
    mobile: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    locality: z.string().trim().min(1).optional(),
    propertyKind: z.string().trim().min(1).optional(),
    /** Which sort of commercial property — office, retail, warehouse, ... */
    commercialKind: z.string().trim().min(1).optional(),
    /** The configuration line: "3 BHK villa", "2000 sqft office space". */
    configuration: z.string().trim().min(1).optional(),
    landArea: z.number().nonnegative().optional(),
    landAreaUnit: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
    summary: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    builtUpArea: z.number().nonnegative().optional(),
    /** §4. Flats or shops in a building, not bedrooms. */
    units: z.number().int().nonnegative().optional(),
    beds: z.number().int().nonnegative().optional(),
    baths: z.number().int().nonnegative().optional(),
    listingType: z.string().trim().min(1).optional(),
    rentalIncome: z.number().nonnegative().optional(),
    email: z.string().trim().min(1).optional(),
    /** Which field an UPDATE_LEAD / UPDATE_PROPERTY should change. */
    field: z.string().trim().min(1).optional(),
    value: z.union([z.string().trim().min(1), z.number()]).optional(),
  })
  .partial();

// `?? {}` rather than `.default({})`: a default only fires on undefined, and
// it is checked before the preprocessor runs — so `"entities": null`, which is
// what a model sends for an action carrying none, would reach the object parse
// as undefined and fail.
const entities = z.preprocess((value) => dropBlanks(value) ?? {}, entityFields);

export type Entities = z.infer<typeof entities>;

const action = z.object({
  intent: z.enum(INTENTS),
  entities,
});

export type IntentAction = z.infer<typeof action>;

/**
 * §19. One message can carry several CRM effects — "Raj called, he's interested
 * in LIV-0027 and wants a visit Saturday" is an activity, a property link and a
 * follow-up. Forcing that into one intent would silently drop two of the three,
 * so the model returns a list and the pipeline executes it in order.
 */
export const intentSchema = z.preprocess(
  dropBlanks,
  z.object({
    actions: z.array(action).min(1).max(5),
    confidence: z.number().min(0).max(1),
    /** What to ask when the model could not resolve something itself. */
    question: z.string().trim().min(1).max(300).optional(),
  }),
);

export type ParsedIntent = z.infer<typeof intentSchema>;

/**
 * Parses and validates model output.
 *
 * Models wrap JSON in prose and fences even when told not to, so the first
 * balanced object in the response is extracted before parsing. That is
 * tolerance of formatting, not of content — the schema is still absolute.
 */
export function parseIntentJson(raw: string): ParsedIntent | { error: string } {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return { error: "no JSON object in response" };

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { error: "response is not valid JSON" };
  }

  // Models reliably answer a single-intent question with a single object even
  // when told to return a list. Lifting it is formatting tolerance; the
  // contents still face the full schema below.
  if (
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate) &&
    "intent" in candidate &&
    !("actions" in candidate)
  ) {
    const flat = candidate as { intent: unknown; entities?: unknown };
    candidate = {
      ...candidate,
      actions: [{ intent: flat.intent, entities: flat.entities ?? {} }],
    };
  }

  const parsed = intentSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      error: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; "),
    };
  }
  return parsed.data;
}
