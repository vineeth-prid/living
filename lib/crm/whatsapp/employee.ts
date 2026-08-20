import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappCommandExecutions } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { parseIntent } from "@/lib/ai/crm-intent/parser";
import type { Entities, Intent, IntentAction } from "@/lib/ai/crm-intent/schema";
import { CONFIDENCE, PENDING_COMMAND_TTL_MS } from "@/lib/integrations/whatsapp/config";
import { sendText } from "@/lib/integrations/whatsapp/service";
import type { InboundMedia } from "@/lib/integrations/whatsapp/types";
import type { SessionUser } from "@/lib/auth/session";
import { COMMANDS, isAllowed, missingFields } from "./registry";
import * as handlers from "./handlers";
import type { HandlerResult } from "./handlers";
import { startDraft } from "./draft";
import {
  formById,
  parseForm,
  type IntakeForm,
  type IntakeState,
} from "./intake";
import { attachWhatsAppMedia } from "./media";
import { inr, t } from "./templates";

// §15/§72. The pipeline, and only the pipeline: interpret, gate, dispatch,
// reply, record.
//
// One message can mean several things (§19), so the unit of work is a list of
// actions executed in order. Every one of them passes the registry check
// independently — a batch is not a way to smuggle a command past a permission.

type PendingRow = {
  id: string;
  intent: string;
  entities: unknown;
  question: string | null;
  status: string;
  targetEntityId: string | null;
};

export async function handleEmployeeMessage(input: {
  user: SessionUser;
  /** §13 per-employee narrowing. Empty means role and permissions decide. */
  scope: string[];
  /** §2. False means recognised as staff but not permitted to command. */
  canRunCommands: boolean;
  conversationId: string;
  messageId: string;
  fromPhone: string;
  text: string;
  media: InboundMedia | null;
}): Promise<void> {
  const reply = (text: string) =>
    sendText({ to: input.fromPhone, text, conversationId: input.conversationId });

  const pending = await pendingCommand(input.conversationId);

  // §23. Media is not a sentence — it never goes to the model. It attaches to
  // whatever property the conversation is already about, or it is refused.
  if (input.media) {
    const result = await attachWhatsAppMedia({
      user: input.user,
      conversationId: input.conversationId,
      media: input.media,
      caption: input.text,
      pendingPropertyId: pending?.targetEntityId ?? null,
    });
    await record({
      ...input,
      intent: "ADD_PROPERTY_MEDIA",
      confidence: null,
      model: "none",
      entities: {},
      status: result.ok ? "executed" : "rejected",
      target: result.target,
      summary: result.summary ?? result.reply.slice(0, 200),
    });
    await reply(result.reply);
    return;
  }

  const text = input.text.trim();
  if (!text) return;

  // §2. Checked before the model is asked anything: someone who cannot run a
  // command should not have their message interpreted, let alone executed.
  if (!input.canRunCommands) {
    await reply(t.noCrmAccess());
    return;
  }

  // §55b. A filled-in form is not a sentence, so it never goes to the model.
  //
  // This is the whole point of template intake: the labels anchor extraction,
  // so a typo in a value cannot be reinterpreted as some other intent. Placed
  // above parseIntent deliberately — routing it through the classifier first is
  // the bug this replaces.
  const waitingOn = intakeForm(pending);
  if (waitingOn && pending) {
    // "cancel" has to keep working mid-form, and it is the one word that must
    // not be read as a field value.
    if (/^(cancel|stop|forget it|never mind)\b/i.test(text)) {
      await closePending(pending.id, "cancelled");
      await reply(t.cancelled());
      return;
    }

    const { values, unreadable } = parseForm(waitingOn, text);
    const merged = { ...pendingEntities(pending), ...values };

    // Named values that could not be read — "Price: soon". Asking about just
    // those beats discarding a form somebody has already typed out.
    if (unreadable.length > 0) {
      const question = t.unreadableFields(unreadable);
      await updatePending(pending.id, merged, question);
      await reply(question);
      return;
    }

    await closePending(pending.id, "executed");
    await runBatch({
      ...input,
      reply,
      actions: [{ intent: pending.intent as Intent, entities: merged }],
      // The employee's own words in a known shape. There is no interpretation
      // here to be uncertain about.
      confidence: 1,
      model: "template",
      resumed: true,
    });
    return;
  }

  const parsed = await parseIntent({
    text,
    employeeName: input.user.fullName,
    pending: pending?.question ?? undefined,
  });

  if (!parsed.ok) {
    await record({
      ...input,
      intent: "CLARIFICATION_REQUIRED",
      confidence: null,
      model: parsed.model,
      entities: {},
      status: "failed",
      error: parsed.error,
    });
    // §40: an interpreter that is down is reported as down, not as "done".
    await reply(
      /not configured|could not be reached|timed out/.test(parsed.error)
        ? t.unavailable()
        : t.notUnderstood(),
    );
    return;
  }

  const { actions, confidence } = parsed.intent;
  const first = actions[0];

  // --- answering an outstanding question ---------------------------------

  if (first.intent === "CANCEL") {
    if (pending) await closePending(pending.id, "cancelled");
    await reply(pending ? t.cancelled() : t.nothingPending());
    return;
  }

  if (first.intent === "CONFIRM") {
    if (!pending || pending.status !== "awaiting_confirmation") {
      await reply(t.nothingPending());
      return;
    }
    await closePending(pending.id, "executed");
    await runBatch({
      ...input,
      reply,
      // Replay what the confirmation was about, not the word "yes".
      actions: (pending.entities as { batch?: IntentAction[] })?.batch ?? [
        { intent: pending.intent as Intent, entities: pendingEntities(pending) },
      ],
      confidence: 1,
      model: parsed.model,
      alreadyConfirmed: true,
    });
    return;
  }

  // §55/§56/§57. A reply to "which OMR property?" is not a new command — it is
  // the missing half of the one already in flight. Merging rather than
  // restarting is what makes "27" a usable answer.
  if (pending?.status === "awaiting_clarification") {
    const merged = { ...pendingEntities(pending), ...first.entities };
    await closePending(pending.id, "executed");
    await runBatch({
      ...input,
      reply,
      actions: [{ intent: pending.intent as Intent, entities: merged }],
      confidence: Math.max(confidence, CONFIDENCE.confirm),
      model: parsed.model,
      resumed: true,
    });
    return;
  }

  if (first.intent === "CLARIFICATION_REQUIRED") {
    await record({
      ...input,
      intent: "CLARIFICATION_REQUIRED",
      confidence,
      model: parsed.model,
      entities: first.entities,
      status: "awaiting_clarification",
      question: parsed.intent.question ?? null,
      expires: true,
    });
    await reply(parsed.intent.question ?? t.notUnderstood());
    return;
  }

  // --- confidence banding (§35) ------------------------------------------
  if (confidence < CONFIDENCE.confirm) {
    await record({
      ...input,
      intent: first.intent,
      confidence,
      model: parsed.model,
      entities: first.entities,
      status: "rejected",
      error: "below confidence floor",
    });
    await reply(t.notUnderstood());
    return;
  }

  await runBatch({
    ...input,
    reply,
    actions,
    confidence,
    model: parsed.model,
    // Above the floor but below the execute band: ask, even for something
    // low-risk, because the doubt is about what was meant at all.
    forceConfirm: confidence < CONFIDENCE.execute,
  });
}

/** Entities as stored, minus the batch envelope a confirmation carries. */
function pendingEntities(pending: PendingRow): Entities {
  const stored = (pending.entities ?? {}) as Record<string, unknown>;
  // `batch` is the envelope a confirmation carries, not an entity.
  const { batch, ...rest } = stored;
  void batch;
  return rest as Entities;
}

async function runBatch(args: {
  user: SessionUser;
  scope: string[];
  conversationId: string;
  messageId: string;
  fromPhone: string;
  text: string;
  actions: IntentAction[];
  confidence: number;
  model: string;
  reply: (text: string) => Promise<unknown>;
  forceConfirm?: boolean;
  alreadyConfirmed?: boolean;
  resumed?: boolean;
}) {
  const { user, actions } = args;

  // Gate every action before running any of them. Half-executing a batch and
  // then refusing the rest leaves the CRM in a state nobody asked for.
  for (const action of actions) {
    const spec = COMMANDS[action.intent];
    // §34: an intent with no registry entry has no path to the database,
    // whatever the model produced.
    if (!spec) {
      await args.reply(t.notUnderstood());
      return;
    }
    if (!isAllowed(user, action.intent, args.scope)) {
      await record({
        ...args,
        intent: action.intent,
        entities: action.entities,
        status: "rejected",
        error: "permission denied",
      });
      await args.reply(t.notPermitted());
      return;
    }
  }

  // §1. A command that cannot possibly succeed asks for what it needs rather
  // than half-running and reporting a confusing failure from deep inside a
  // handler. Only the first gap is asked about — one question at a time.
  for (const action of actions) {
    const missing = missingFields(action.intent, action.entities as Record<string, unknown>);
    if (missing.length === 0) continue;

    const question = t.missingField(missing[0], action.intent);
    await db().insert(whatsappCommandExecutions).values({
      id: newId(),
      messageId: args.messageId,
      conversationId: args.conversationId,
      employeeId: user.id,
      senderPhone: args.fromPhone,
      originalText: args.text,
      intent: action.intent,
      confidence: args.confidence,
      model: args.model,
      entities: action.entities,
      status: "awaiting_clarification",
      requiresConfirmation: false,
      resultSummary: question,
      expiresAt: new Date(Date.now() + PENDING_COMMAND_TTL_MS),
    });
    await args.reply(question);
    return;
  }

  // §31: high-risk actions always ask, however confident the model was.
  const needsConfirming = actions.filter(
    (action) => !COMMANDS[action.intent].readOnly,
  );
  const mustConfirm =
    !args.alreadyConfirmed &&
    needsConfirming.length > 0 &&
    (args.forceConfirm ||
      actions.some((action) => COMMANDS[action.intent].requiresConfirmation));

  if (mustConfirm) {
    const question = await confirmationQuestion(actions, user);
    await db().insert(whatsappCommandExecutions).values({
      id: newId(),
      messageId: args.messageId,
      conversationId: args.conversationId,
      employeeId: user.id,
      senderPhone: args.fromPhone,
      originalText: args.text,
      intent: actions[0].intent,
      confidence: args.confidence,
      model: args.model,
      // The whole batch is stored, so a "yes" replays all of it and not just
      // the action that happened to trigger the question.
      entities: { ...actions[0].entities, batch: actions },
      status: "awaiting_confirmation",
      requiresConfirmation: true,
      resultSummary: question,
      expiresAt: new Date(Date.now() + PENDING_COMMAND_TTL_MS),
    });
    await args.reply(t.confirm(question));
    return;
  }

  const replies: string[] = [];

  for (const action of actions) {
    let result: HandlerResult;
    try {
      result = await dispatch(
        action.intent,
        {
          user,
          scope: args.scope,
          conversationId: args.conversationId,
          text: args.text,
        },
        action.entities,
      );
    } catch (error) {
      // §40: a thrown handler is a failure, reported as one. The technical
      // detail stays in the log.
      console.error("[whatsapp] handler threw", action.intent, error);
      await record({
        ...args,
        intent: action.intent,
        entities: action.entities,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      replies.push(t.failed("do that"));
      // The rest of the batch is abandoned: later actions usually depend on
      // the one that just failed.
      break;
    }

    // A handler that needs more information parks the batch and asks. The
    // remaining actions are dropped rather than run against a half-answer.
    if (result.needs) {
      await db().insert(whatsappCommandExecutions).values({
        id: newId(),
        messageId: args.messageId,
        conversationId: args.conversationId,
        employeeId: user.id,
        senderPhone: args.fromPhone,
        originalText: args.text,
        intent: action.intent,
        confidence: args.confidence,
        model: args.model,
        entities: result.needs.entities,
        status: "awaiting_clarification",
        requiresConfirmation: false,
        resultSummary: result.needs.question,
        targetEntity: result.target?.entity ?? null,
        targetEntityId: result.target?.id ?? null,
        expiresAt: new Date(Date.now() + PENDING_COMMAND_TTL_MS),
      });
      replies.push(result.reply);
      break;
    }

    await record({
      ...args,
      intent: action.intent,
      entities: action.entities,
      status: result.ok ? "executed" : "rejected",
      target: result.target,
      summary: result.summary ?? result.reply.slice(0, 200),
      confirmed: args.alreadyConfirmed,
    });

    replies.push(result.reply);
    if (!result.ok) break;
  }

  await args.reply(replies.join("\n\n"));
}

function dispatch(
  intent: Intent,
  ctx: handlers.HandlerContext,
  entities: Entities,
): Promise<HandlerResult> {
  switch (intent) {
    case "HELP":
      return handlers.help(ctx);
    case "GET_PROFILE":
      return handlers.getProfile(ctx);
    case "GET_SYSTEM_STATUS":
      return handlers.getSystemStatus();
    case "GET_MY_FOLLOWUPS":
      return handlers.getMyFollowups(ctx);
    case "GET_MY_LEADS":
      return handlers.getMyLeads(ctx, entities);
    case "GET_LEAD":
      return handlers.getLead(ctx, entities);
    case "GET_PROPERTY":
      return handlers.getProperty(entities, ctx.user);
    case "CREATE_LEAD":
      return handlers.createLeadCommand(ctx, entities);
    case "UPDATE_LEAD":
      return handlers.updateLead(ctx, entities);
    case "ADD_FOLLOWUP":
      return handlers.addFollowup(ctx, entities);
    case "COMPLETE_FOLLOWUP":
      return handlers.completeFollowup(ctx, entities);
    case "RESCHEDULE_FOLLOWUP":
      return handlers.rescheduleFollowup(ctx, entities);
    case "ADD_LEAD_NOTE":
      return handlers.addLeadNote(ctx, entities);
    case "ADD_LEAD_ACTIVITY":
      return handlers.addLeadActivity(ctx, entities);
    case "CHANGE_LEAD_STATUS":
      return handlers.changeLeadStatus(ctx, entities);
    case "ASSOCIATE_PROPERTY_TO_LEAD":
      return handlers.associatePropertyToLead(ctx, entities);
    case "ASSIGN_LEAD":
      return handlers.assignLead(ctx, entities);
    case "CREATE_PROPERTY_DRAFT":
      return startDraft(ctx, entities);
    case "UPDATE_PROPERTY":
      return handlers.updatePropertyField(ctx, entities);
    case "UPDATE_PROPERTY_PRICE":
      return handlers.updatePropertyPrice(ctx, entities);
    case "ADD_PROPERTY_MEDIA":
      return handlers.awaitPropertyMedia(ctx, entities);
    case "PUBLISH_PROPERTY":
      return handlers.setPublished(ctx, entities, true);
    case "UNPUBLISH_PROPERTY":
      return handlers.setPublished(ctx, entities, false);
    default:
      return Promise.resolve({ ok: false, reply: t.notUnderstood() });
  }
}

/** What the employee is actually being asked to agree to (§24/§31). */
async function confirmationQuestion(
  actions: IntentAction[],
  user: SessionUser,
): Promise<string> {
  if (actions.length > 1) {
    const lines = await Promise.all(actions.map((a) => oneLine(a, user)));
    return `This will:\n${lines.map((line) => `• ${line}`).join("\n")}`;
  }
  return oneLine(actions[0], user);
}

async function oneLine(action: IntentAction, user: SessionUser): Promise<string> {
  const e = action.entities;
  const target = e.propertyReference ?? e.propertyQuery ?? e.leadName ?? "that record";

  switch (action.intent) {
    case "PUBLISH_PROPERTY":
      return `This will make ${target} visible on the public Living website. Confirm?`;
    case "UNPUBLISH_PROPERTY":
      return `Take ${target} off the public website. Confirm?`;
    case "UPDATE_PROPERTY_PRICE": {
      // §6 wants both figures in the question. Being asked to confirm a change
      // without being shown what it is replacing is not a confirmation.
      const current = await handlers.currentAskingPrice(e);
      const to = e.amount === undefined ? "the new figure" : inr(e.amount);
      return current === null
        ? `Change the asking price of ${target} to ${to}?`
        : `Change ${target} asking price from ${inr(current)} to ${to}?`;
    }
    case "ASSIGN_LEAD":
      return `Reassign ${e.leadName ?? "that lead"} to ${e.employeeName ?? "someone else"}? It leaves ${user.fullName === e.employeeName ? "their" : "the current owner's"} list.`;
    default:
      return `${action.intent.toLowerCase().replace(/_/g, " ")} on ${target}?`;
  }
}

// --- pending state (§57) --------------------------------------------------
//
// Persisted, not held in process memory: the reply arrives as a separate
// webhook, which may land on a different instance and certainly lands after a
// redeploy.

/**
 * §6. Marks questions nobody answered in time as expired.
 *
 * Done on read: there is no scheduler in this app, and the only moment the
 * distinction matters is when the next message arrives. Without it an ignored
 * confirmation sits as "awaiting" for ever and the audit cannot tell the two
 * apart.
 */
async function expireStale(conversationId: string) {
  await db()
    .update(whatsappCommandExecutions)
    .set({ status: "expired" })
    .where(
      and(
        eq(whatsappCommandExecutions.conversationId, conversationId),
        inArray(whatsappCommandExecutions.status, [
          "awaiting_confirmation",
          "awaiting_clarification",
        ]),
        lt(whatsappCommandExecutions.expiresAt, new Date()),
      ),
    );
}

async function pendingCommand(conversationId: string): Promise<PendingRow | null> {
  await expireStale(conversationId);

  const [row] = await db()
    .select({
      id: whatsappCommandExecutions.id,
      intent: whatsappCommandExecutions.intent,
      entities: whatsappCommandExecutions.entities,
      question: whatsappCommandExecutions.resultSummary,
      status: whatsappCommandExecutions.status,
      targetEntityId: whatsappCommandExecutions.targetEntityId,
    })
    .from(whatsappCommandExecutions)
    .where(
      and(
        eq(whatsappCommandExecutions.conversationId, conversationId),
        inArray(whatsappCommandExecutions.status, [
          "awaiting_confirmation",
          "awaiting_clarification",
        ]),
        // Expired questions are not answerable — a "yes" tomorrow morning must
        // not publish something asked about last night.
        gt(whatsappCommandExecutions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(whatsappCommandExecutions.createdAt))
    .limit(1);
  return row ?? null;
}

async function closePending(id: string, status: "executed" | "cancelled") {
  await db()
    .update(whatsappCommandExecutions)
    .set({ status, confirmedAt: new Date() })
    .where(eq(whatsappCommandExecutions.id, id));
}

/** The form a parked command is waiting on, if it is waiting on one. */
function intakeForm(pending: PendingRow | null): IntakeForm | null {
  if (!pending || pending.status !== "awaiting_clarification") return null;
  const id = (pending.entities as IntakeState | null)?.__intake;
  return id ? formById(id) : null;
}

/**
 * Keeps a partly-read form on the row and restarts its clock.
 *
 * Without this, a form with one unreadable line would be answered with a
 * question and then have nothing to merge the answer into — the employee would
 * have to retype the lot.
 */
async function updatePending(
  id: string,
  entities: Record<string, unknown>,
  question: string,
) {
  await db()
    .update(whatsappCommandExecutions)
    .set({
      entities,
      resultSummary: question,
      expiresAt: new Date(Date.now() + PENDING_COMMAND_TTL_MS),
    })
    .where(eq(whatsappCommandExecutions.id, id));
}

/** §32: one row per interpreted action, whatever became of it. */
async function record(args: {
  messageId: string;
  conversationId: string;
  user: SessionUser;
  fromPhone: string;
  text?: string;
  intent: string;
  confidence?: number | null;
  model: string;
  entities: unknown;
  status:
    | "executed"
    | "rejected"
    | "failed"
    | "awaiting_clarification"
    | "awaiting_confirmation";
  error?: string;
  question?: string | null;
  target?: { entity: string; id: string };
  summary?: string;
  confirmed?: boolean;
  expires?: boolean;
}) {
  await db().insert(whatsappCommandExecutions).values({
    id: newId(),
    messageId: args.messageId,
    conversationId: args.conversationId,
    employeeId: args.user.id,
    senderPhone: args.fromPhone,
    originalText: args.text ?? null,
    intent: args.intent,
    confidence: args.confidence ?? null,
    model: args.model,
    entities: args.entities,
    status: args.status,
    requiresConfirmation: false,
    confirmedAt: args.confirmed ? new Date() : null,
    expiresAt: args.expires
      ? new Date(Date.now() + PENDING_COMMAND_TTL_MS)
      : null,
    targetEntity: args.target?.entity ?? null,
    targetEntityId: args.target?.id ?? null,
    resultSummary: args.summary ?? args.question ?? null,
    error: args.error?.slice(0, 500) ?? null,
    executedAt: args.status === "executed" ? new Date() : null,
  });
}

export { pendingCommand };
