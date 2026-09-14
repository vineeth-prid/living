import { PERMISSIONS } from "@/lib/auth/constants";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/dal";
import type { Intent } from "@/lib/ai/crm-intent/schema";

// §36. One table saying, for every intent the model can produce, who may run it
// and whether it needs a yes first.
//
// This is the authority, not the model. An intent that is not in this table
// cannot execute — adding a name to the AI schema does not grant it a path to
// the database.

export type CommandRisk = "low" | "medium" | "high";

export type CommandSpec = {
  /** Shown in HELP, for employees who hold the permission. */
  help: string | null;
  risk: CommandRisk;
  /** null = any authenticated employee. */
  permission: string | null;
  adminOnly?: boolean;
  /** High-risk actions always ask, whatever the model's confidence (§31). */
  requiresConfirmation: boolean;
  /** Reads nothing but public-to-staff data and changes nothing. */
  readOnly: boolean;
  /**
   * §1. Entity fields the command cannot run without.
   *
   * One of each group must be present — ["leadName", "leadReference"] means
   * "identify the lead somehow". Checked before dispatch, so a command that
   * cannot possibly succeed asks for what it needs instead of half-running.
   */
  requires?: string[][];
};

/** Ways to name a lead, and ways to name a property. */
const LEAD_REF = ["leadName", "leadReference", "mobile"];
const PROPERTY_REF = ["propertyReference", "propertyQuery"];

export const COMMANDS: Record<Intent, CommandSpec> = {
  GET_MY_FOLLOWUPS: {
    help: "Show my follow-ups today",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: true,
  },
  GET_MY_LEADS: {
    help: "Show my leads / show my hot leads",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: true,
  },
  GET_LEAD: {
    help: "Show me Raj",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: true,
    requires: [LEAD_REF],
  },
  GET_PROPERTY: {
    help: "Get property LIV-0027",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: true,
    requires: [PROPERTY_REF],
  },
  GET_PROFILE: {
    help: "Who am I",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: true,
  },
  HELP: {
    help: "Help",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: true,
  },
  ADD_FOLLOWUP: {
    help: "Add follow-up for Raj tomorrow at 10am",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: false,
    requires: [LEAD_REF, ["date"]],
  },
  COMPLETE_FOLLOWUP: {
    help: "Mark Raj's follow-up done",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: false,
    requires: [LEAD_REF],
  },
  ADD_LEAD_NOTE: {
    help: "Add note to Raj: interested in OMR",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: false,
    requires: [LEAD_REF, ["note"]],
  },
  ADD_LEAD_ACTIVITY: {
    help: "Raj called about LIV-0027",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: false,
    requires: [LEAD_REF, ["note", "summary"]],
  },
  CHANGE_LEAD_STATUS: {
    help: "Move Raj to negotiation",
    risk: "medium",
    permission: null,
    requiresConfirmation: false,
    readOnly: false,
    requires: [LEAD_REF, ["status"]],
  },
  ASSOCIATE_PROPERTY_TO_LEAD: {
    help: "Link LIV-0027 to Raj",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: false,
    requires: [LEAD_REF, PROPERTY_REF],
  },
  CREATE_LEAD: {
    help: "Add lead Raj 9876543210",
    risk: "medium",
    permission: null,
    requiresConfirmation: false,
    readOnly: false,
  },
  UPDATE_LEAD: {
    help: "Set Raj's city to Kochi",
    risk: "medium",
    permission: null,
    requiresConfirmation: false,
    readOnly: false,
  },
  RESCHEDULE_FOLLOWUP: {
    help: "Move Raj's follow-up to Friday 4pm",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: false,
    requires: [LEAD_REF, ["date"]],
  },
  UPDATE_PROPERTY: {
    help: "Set LIV-0027 possession to Ready to move",
    risk: "medium",
    permission: null,
    requiresConfirmation: false,
    readOnly: false,
  },
  ADD_PROPERTY_MEDIA: {
    help: "Add photos to LIV-0027",
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    // Points the conversation at a listing; the photos themselves arrive after.
    readOnly: false,
  },
  GET_SYSTEM_STATUS: {
    help: "System status",
    risk: "low",
    permission: null,
    adminOnly: true,
    requiresConfirmation: false,
    readOnly: true,
  },
  // Moving a lead to someone else takes it off the first person's list, so it
  // is never done on an inference alone (§31).
  ASSIGN_LEAD: {
    help: "Assign Raj to Anitha",
    risk: "high",
    permission: null,
    adminOnly: true,
    requiresConfirmation: true,
    readOnly: false,
    requires: [LEAD_REF, ["employeeName"]],
  },
  CREATE_PROPERTY_DRAFT: {
    help: "Add a new property",
    risk: "medium",
    permission: null,
    requiresConfirmation: false,
    readOnly: false,
  },
  UPDATE_PROPERTY_PRICE: {
    help: "Change LIV-0027 asking price to 1.75 crore",
    risk: "high",
    permission: null,
    requiresConfirmation: true,
    readOnly: false,
    requires: [PROPERTY_REF, ["amount"]],
  },
  PUBLISH_PROPERTY: {
    help: "Publish LIV-0027",
    risk: "high",
    permission: PERMISSIONS.propertyPublish,
    requiresConfirmation: true,
    readOnly: false,
    requires: [PROPERTY_REF],
  },
  UNPUBLISH_PROPERTY: {
    help: "Unpublish LIV-0027",
    risk: "high",
    permission: PERMISSIONS.propertyPublish,
    requiresConfirmation: true,
    readOnly: false,
    requires: [PROPERTY_REF],
  },
  // Control flow, not commands — they answer an outstanding question and are
  // never listed in help.
  CONFIRM: {
    help: null,
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: true,
  },
  CANCEL: {
    help: null,
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: true,
  },
  CLARIFICATION_REQUIRED: {
    help: null,
    risk: "low",
    permission: null,
    requiresConfirmation: false,
    readOnly: true,
  },
};

/**
 * §34/§25/§13: the gate every command passes before its handler is reached.
 *
 * `scope` is the per-employee narrowing from users.whatsappScope. It can only
 * ever take capability away: an intent absent from a non-empty scope is
 * refused, but naming one in the scope grants nothing the role and permissions
 * did not already allow. Widening has to happen where every other grant does.
 */
export function isAllowed(
  user: SessionUser,
  intent: Intent,
  scope: string[] = [],
): boolean {
  const spec = COMMANDS[intent];
  if (!spec) return false;
  if (spec.adminOnly && user.role !== "admin") return false;
  if (spec.permission && !can(user, spec.permission)) return false;
  // Control flow is never scoped out — an employee restricted to reads must
  // still be able to answer a question or cancel.
  if (CONTROL_FLOW.includes(intent)) return true;
  if (scope.length > 0 && !scope.includes(intent)) return false;
  return true;
}

const CONTROL_FLOW: Intent[] = ["CONFIRM", "CANCEL", "CLARIFICATION_REQUIRED", "HELP"];

/**
 * §1. Which required groups the given entities do not satisfy.
 *
 * Returns the field names to ask for. Empty means the command has everything it
 * needs to at least attempt its job — the handler still does the real work of
 * resolving names to rows, which is where ambiguity is caught.
 */
export function missingFields(
  intent: Intent,
  entities: Record<string, unknown>,
): string[] {
  const groups = COMMANDS[intent]?.requires ?? [];
  return groups
    .filter((group) => !group.some((field) => entities[field] !== undefined))
    .map((group) => group[0]);
}

/** Only what this employee can actually run (§39). */
export function helpFor(user: SessionUser, scope: string[] = []): string[] {
  return Object.entries(COMMANDS)
    .filter(([intent, spec]) => spec.help && isAllowed(user, intent as Intent, scope))
    .map(([, spec]) => spec.help as string);
}

/** The intents an admin can pick from when narrowing someone's access. */
export const SCOPEABLE_INTENTS = Object.entries(COMMANDS)
  .filter(([intent, spec]) => spec.help && !CONTROL_FLOW.includes(intent as Intent))
  .map(([intent, spec]) => ({ intent: intent as Intent, help: spec.help as string }));
