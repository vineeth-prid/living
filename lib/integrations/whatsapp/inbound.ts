import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappMessages, whatsappSessions } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { normalisePhone } from "./phone";
import { resolveLidPhone } from "./openwa/lid";
import { resolveSender } from "./identity";
import {
  currentSessionRow,
  upsertContact,
  upsertConversation,
} from "./service";
import type { InboundEvent, InboundMessage } from "./types";
import { handleEmployeeMessage } from "@/lib/crm/whatsapp/employee";
import { handleCustomerMessage } from "@/lib/crm/whatsapp/customer";

// §72. This file only routes. It decides what an event is and who sent it, then
// hands off — it does not parse intents, and it does not write to leads or
// properties. Keeping that boundary is what stops this becoming the one file
// that knows everything.

export async function processInboundEvent(event: InboundEvent): Promise<void> {
  switch (event.event) {
    case "session.status":
      await recordSessionStatus(event);
      return;
    case "message.ack":
      await recordAck(event);
      return;
    case "message.received":
      if (event.message) await routeMessage(event, event.message);
      return;
    default:
      // Subscribed to three events; anything else is recorded by the route and
      // ignored here rather than guessed at.
      return;
  }
}

async function recordSessionStatus(event: InboundEvent) {
  const session = await currentSessionRow();
  const status = event.sessionStatus ?? "unknown";
  await db()
    .update(whatsappSessions)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === "connected" ? { lastConnectedAt: new Date() } : {}),
      ...(status === "disconnected" ? { lastDisconnectedAt: new Date() } : {}),
    })
    .where(eq(whatsappSessions.id, session.id));
}

/** Delivery receipts only move an outbound row forward, never backward. */
async function recordAck(event: InboundEvent) {
  const messageId = (event.raw as { data?: { id?: string } })?.data?.id;
  if (!messageId) return;
  await db()
    .update(whatsappMessages)
    .set({ status: "processed" })
    .where(eq(whatsappMessages.providerMessageId, messageId));
}

async function routeMessage(event: InboundEvent, message: InboundMessage) {
  // A privacy-masked sender ("...@lid") reaches here with no number: the
  // parser refuses to invent one. Ask the gateway now — this runs after the
  // webhook has been acknowledged, so the round trip costs nothing that OpenWA
  // is waiting on.
  const phone = message.senderLid
    ? await resolveLidPhone(message.senderLid)
    : normalisePhone(message.fromPhone);

  if (!phone) {
    if (message.senderLid) {
      // Throwing rather than returning: the route's catch writes the reason
      // onto the webhook event row, so an unidentifiable sender is visible in
      // the table instead of vanishing as a silently skipped message.
      throw new Error(
        `could not resolve masked sender ${message.senderLid} to a phone number`,
      );
    }
    return;
  }

  const sender = await resolveSender(phone.nationalDigits);
  const session = await currentSessionRow();

  const contact = await upsertContact({
    ...phone,
    whatsappId: message.chatId,
    displayName: message.senderName,
    contactType: sender.kind,
    employeeId: sender.kind === "employee" ? sender.user.id : null,
    leadId: sender.kind === "customer" ? sender.leadId : null,
  });

  const conversation = await upsertConversation({
    sessionId: session.id,
    contactId: contact.id,
    chatId: message.chatId,
    employeeId: sender.kind === "employee" ? sender.user.id : null,
    leadId: sender.kind === "customer" ? sender.leadId : null,
  });

  // Stored before it is acted on. If interpretation fails, the message Living
  // received is still on record — "we never got it" should never be the answer.
  const storedId = newId();
  await db()
    .insert(whatsappMessages)
    .values({
      id: storedId,
      conversationId: conversation.id,
      providerMessageId: message.providerMessageId,
      direction: "inbound",
      senderPhone: phone.phoneNumber,
      messageType: message.type,
      text: message.text,
      mediaMetadata: message.media ?? null,
      status: "pending",
      eventId: event.idempotencyKey,
      sentAt: message.sentAt,
    })
    // The provider message id is unique; a replay that slipped past the event
    // check still cannot store the same message twice.
    .onConflictDoNothing({ target: whatsappMessages.providerMessageId });

  await db()
    .update(whatsappSessions)
    .set({ lastInboundAt: new Date() })
    .where(eq(whatsappSessions.id, session.id));

  // §2b. A group is not a command line, and never a private one.
  //
  // Routing is decided by the sender's number. In a one-to-one chat that number
  // is also the whole audience; in a group it is one person in front of an
  // unknown crowd, and the two are not interchangeable:
  //
  //  · an employee talking about a listing — "we should publish the Kakkanad
  //    one" — would have a conversation executed as a CRM write;
  //  · everyone else who spoke would be filed as a lead and sent an
  //    unsolicited reply, which pollutes the CRM and is how a WhatsApp number
  //    gets reported and banned.
  //
  // Denied by default and not configurable here. Supporting groups is not a
  // flag — it needs an allowlist of specific group ids, a separate rule about
  // which commands may run in front of an audience, and replies addressed to
  // the chat rather than the sender. Until that exists, the message is stored
  // and nothing else happens to it.
  if (message.isGroup) {
    await db()
      .update(whatsappMessages)
      .set({ status: "ignored" })
      .where(eq(whatsappMessages.id, storedId));
    return;
  }

  if (!contact.isAllowed) {
    // The message is already stored above — the record of what arrived is
    // worth keeping. Nothing is done with it and nothing is sent back.
    await db()
      .update(whatsappMessages)
      .set({ status: "ignored" })
      .where(eq(whatsappMessages.id, storedId));
    return;
  }

  let status: "processed" | "ignored" | "failed" = "processed";
  let error: string | null = null;

  try {
    if (sender.kind === "employee") {
      await handleEmployeeMessage({
        user: sender.user,
        scope: sender.scope,
        canRunCommands: sender.canRunCommands,
        conversationId: conversation.id,
        messageId: storedId,
        fromPhone: phone.phoneNumber,
        text: message.text,
        media: message.media,
      });
    } else {
      // §30: customers and unknown numbers reach the customer path and nothing
      // else. There is no branch here that could run a CRM command for them.
      await handleCustomerMessage({
        conversationId: conversation.id,
        leadId: sender.kind === "customer" ? sender.leadId : null,
        contactId: contact.id,
        fromPhone: phone.phoneNumber,
        senderName: message.senderName,
        text: message.text,
      });
    }
  } catch (caught) {
    status = "failed";
    error = (caught instanceof Error ? caught.message : String(caught)).slice(0, 500);
    console.error("[whatsapp] handler failed", caught);
  }

  await db()
    .update(whatsappMessages)
    .set({ status, error })
    .where(eq(whatsappMessages.id, storedId));
}
