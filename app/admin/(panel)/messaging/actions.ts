"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappContacts, whatsappConversations } from "@/lib/db/schema";
import {
  assertAdmin,
  fail,
  requireUser,
  succeed,
  type ActionResult,
} from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { isWhatsAppEnabled } from "@/lib/integrations/whatsapp/config";
import { sendText } from "@/lib/integrations/whatsapp/service";
import { uploadObject, validateUpload, hasStorage } from "@/lib/storage";
import type { LeadFilters } from "@/lib/leads.admin";
import {
  AUDIENCE_PRESETS,
  MAX_AUDIENCE,
  audienceCandidates,
  candidatesByIds,
  setMarketingOptOut,
  summarise,
  type AudiencePreset,
  type Candidate,
} from "@/lib/crm/whatsapp/audience";
import {
  createBroadcast,
  drainBroadcasts,
  requeueFailed,
  requeueStuck,
  setBroadcastStatus,
  startBroadcast,
} from "@/lib/crm/whatsapp/broadcast";

// §B6. Admin-only, every one of them. A bulk send is the single most damaging
// thing this panel can do — a wrong audience cannot be unsent, and the number
// it goes out on is the business's own — so none of it is delegated to a
// permission flag. Every action re-derives the actor from the session cookie;
// nothing reads a role, a lead id or a recipient out of the form (§40).

const PANEL = "/admin/messaging";

async function adminActor() {
  const user = await requireUser();
  assertAdmin(user);
  return user;
}

// --- audience preview -----------------------------------------------------

export type Preview = {
  summary: ReturnType<typeof summarise>;
  /** A sample for the operator to eyeball. Never the whole list. */
  sample: Candidate[];
  label: string;
};

/**
 * Who the current selection would reach, before anything is created.
 *
 * The one guard that matters on this screen. A filter that quietly matched
 * every lead in the database is only obvious if the count is on screen before
 * the button is pressed, so the composer refuses to submit without one.
 */
export async function previewAudience(
  preset: AudiencePreset,
  filters: LeadFilters,
): Promise<ActionResult<Preview>> {
  const user = await adminActor();

  const base = AUDIENCE_PRESETS[preset]?.filters ?? {};
  const candidates = await audienceCandidates(user, { ...base, ...clean(filters) });

  return succeed({
    summary: summarise(candidates),
    sample: candidates.slice(0, 25),
    label: AUDIENCE_PRESETS[preset]?.label ?? "Custom",
  });
}

/** The same preview for a hand-picked list. */
export async function previewPicked(
  leadIds: string[],
): Promise<ActionResult<Preview>> {
  const user = await adminActor();
  const candidates = await candidatesByIds(user, leadIds);
  return succeed({
    summary: summarise(candidates),
    sample: candidates.slice(0, 25),
    label: "Hand-picked",
  });
}

/** Leads matching a search, for the manual picker. */
export async function searchLeads(
  query: string,
): Promise<ActionResult<Candidate[]>> {
  const user = await adminActor();
  const trimmed = query.trim();
  if (trimmed.length < 2) return succeed([]);

  const candidates = await audienceCandidates(
    user,
    { q: trimmed },
    { limit: 40 },
  );
  return succeed(candidates);
}

// --- creating and sending -------------------------------------------------

/**
 * Builds the broadcast. Does not send it (§B7).
 *
 * Creating and sending are two actions on purpose. The operator gets a report
 * page with the real recipient list on it and has to press send there — so the
 * last thing before several hundred messages go out is a screen showing
 * exactly who they go to, not a form showing what was typed.
 */
export async function createBroadcastAction(
  _prev: ActionResult<{ id: string; message: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; message: string }>> {
  const actor = await adminActor();

  if (!isWhatsAppEnabled()) {
    return fail("WhatsApp is not configured, so nothing can be sent.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const preset = String(formData.get("preset") ?? "all") as AudiencePreset;
  const mode = String(formData.get("mode") ?? "filter");

  if (!name) return fail("Give it a name, so it can be found later.");
  if (!body) return fail("A broadcast needs something to say.");
  if (body.length > 4_000) {
    return fail("That is longer than WhatsApp will send in one message.");
  }

  // --- the audience, resolved server-side from ids, never trusted as a list
  const candidates =
    mode === "picked"
      ? await candidatesByIds(
          actor,
          formData
            .getAll("leadIds")
            .map(String)
            .filter(Boolean),
        )
      : await audienceCandidates(actor, {
          ...(AUDIENCE_PRESETS[preset]?.filters ?? {}),
          ...clean(readFilters(formData)),
        });

  const counts = summarise(candidates);
  if (counts.sendable === 0) {
    return fail(
      counts.total === 0
        ? "That selection matches nobody."
        : `All ${counts.total} matches are excluded — opted out, duplicates, or no usable number.`,
    );
  }
  if (counts.sendable > MAX_AUDIENCE) {
    return fail(`That is more than the ${MAX_AUDIENCE} this allows in one go.`);
  }

  // --- the attachment, optional
  const file = formData.get("media");
  let media: Parameters<typeof createBroadcast>[0]["media"] = null;

  if (file instanceof File && file.size > 0) {
    if (!hasStorage()) {
      return fail("MinIO is not configured, so media cannot be attached.");
    }
    const kind = mediaKindFor(file.type);
    if (!kind) {
      return fail(
        `${file.type || "That file type"} cannot be sent — attach an image, a video or a PDF.`,
      );
    }
    // The same validation the property uploader runs. One rulebook about what
    // may be stored, so a file refused on a listing is refused here too.
    const invalid = validateUpload(file, kind);
    if (invalid) return fail(invalid);

    const storageKey = await uploadObject(file, "whatsapp/broadcasts");
    media = {
      storageKey,
      mimeType: file.type,
      filename: file.name,
      kind,
    };
  }

  const { id, queued, skipped } = await createBroadcast(
    {
      name,
      body,
      media,
      audience:
        mode === "picked"
          ? { mode: "picked", count: counts.sendable }
          : { mode: "filter", preset, filters: clean(readFilters(formData)) },
      createdById: actor.id,
    },
    candidates,
  );

  await audit({
    actorId: actor.id,
    action: "whatsapp.broadcast_created",
    entity: "whatsapp_broadcast",
    entityId: id,
    after: { name, queued, skipped, hasMedia: Boolean(media) },
  });

  revalidatePath(PANEL);
  return succeed({
    id,
    message: `Ready: ${queued} to send${skipped > 0 ? `, ${skipped} skipped` : ""}.`,
  });
}

/** §B7. The send itself, from the report page, once the list has been seen. */
export async function sendBroadcastAction(
  id: string,
): Promise<ActionResult<{ message: string }>> {
  const actor = await adminActor();

  const problem = await startBroadcast(id);
  if (problem) return fail(problem);

  await audit({
    actorId: actor.id,
    action: "whatsapp.broadcast_started",
    entity: "whatsapp_broadcast",
    entityId: id,
  });

  // First batch now, so a small broadcast is simply finished by the time the
  // page comes back. The rest drains from here and from the inbound webhook —
  // nothing holds this request open for the twenty-a-minute the gateway allows.
  after(async () => {
    try {
      await drainBroadcasts();
    } catch (error) {
      console.error("[whatsapp] broadcast drain failed", error);
    }
  });

  revalidatePath(PANEL);
  revalidatePath(`${PANEL}/${id}`);
  return succeed({ message: "Sending. The queue drains in the background." });
}

/** Pause, resume or cancel from the report page. */
export async function setBroadcastStatusAction(
  id: string,
  status: "paused" | "cancelled" | "sending",
): Promise<ActionResult<{ message: string }>> {
  const actor = await adminActor();

  const problem = await setBroadcastStatus(id, status);
  if (problem) return fail(problem);

  await audit({
    actorId: actor.id,
    action: `whatsapp.broadcast_${status}`,
    entity: "whatsapp_broadcast",
    entityId: id,
  });

  if (status === "sending") {
    after(async () => {
      try {
        await drainBroadcasts();
      } catch (error) {
        console.error("[whatsapp] broadcast drain failed", error);
      }
    });
  }

  revalidatePath(PANEL);
  revalidatePath(`${PANEL}/${id}`);
  return succeed({
    message:
      status === "cancelled"
        ? "Cancelled. Anything already sent stays sent."
        : status === "paused"
          ? "Paused. Queued recipients keep their place."
          : "Resumed.",
  });
}

/**
 * §B8. Sends the next batch by hand.
 *
 * The queue drains on its own whenever a message arrives, which on a quiet
 * afternoon is never. This is the button for that afternoon — and it is why
 * there is no cron job to keep running.
 */
export async function drainNow(): Promise<ActionResult<{ message: string }>> {
  await adminActor();
  const { attempted, sent, failed } = await drainBroadcasts();

  revalidatePath(PANEL);
  return succeed({
    message:
      attempted === 0
        ? "Nothing queued."
        : `Attempted ${attempted}: ${sent} sent${failed > 0 ? `, ${failed} not` : ""}.`,
  });
}

export async function requeueAction(
  id: string,
  which: "failed" | "stuck",
): Promise<ActionResult<{ message: string }>> {
  await adminActor();
  const count = which === "failed" ? await requeueFailed(id) : await requeueStuck(id);

  revalidatePath(`${PANEL}/${id}`);
  return succeed({
    message: count === 0 ? "Nothing to requeue." : `${count} back on the queue.`,
  });
}

// --- opt-outs -------------------------------------------------------------

/** §B4. Honouring, or undoing, a request to stop receiving broadcasts. */
export async function setOptOutAction(
  phoneNumber: string,
  optedOut: boolean,
): Promise<ActionResult<{ message: string }>> {
  const actor = await adminActor();
  await setMarketingOptOut(phoneNumber, optedOut);

  await audit({
    actorId: actor.id,
    action: optedOut ? "whatsapp.opt_out" : "whatsapp.opt_in",
    entity: "whatsapp_contact",
    // The number itself, not an id: an opt-out can exist before Living has a
    // contact row, and the audit has to say who it was about either way.
    after: { phoneNumber, optedOut },
  });

  revalidatePath(PANEL);
  revalidatePath(`${PANEL}/inbox`);
  return succeed({
    message: optedOut ? "Opted out of broadcasts." : "Opted back in.",
  });
}

// --- the inbox ------------------------------------------------------------

/**
 * §B10. A reply typed by a member of staff, into a conversation that exists.
 *
 * Only into an existing thread, and the number comes from that thread's contact
 * row rather than from the form. That is what keeps the inbox an inbox: there
 * is no field here that could address a stranger, so it cannot quietly become
 * the one-field bulk sender the test-message panel was careful not to be.
 *
 * Employees may reply, not only admins — answering a customer is the job.
 */
export async function replyInThread(
  _prev: ActionResult<{ message: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ message: string }>> {
  const actor = await requireUser();

  const conversationId = String(formData.get("conversationId") ?? "");
  const text = String(formData.get("text") ?? "").trim();

  if (!text) return fail("Nothing to send.");
  if (text.length > 4_000) return fail("That is too long for one message.");

  const [thread] = await db()
    .select({
      id: whatsappConversations.id,
      phoneNumber: whatsappContacts.phoneNumber,
      isAllowed: whatsappContacts.isAllowed,
    })
    .from(whatsappConversations)
    .innerJoin(
      whatsappContacts,
      eq(whatsappContacts.id, whatsappConversations.contactId),
    )
    .where(eq(whatsappConversations.id, conversationId))
    .limit(1);

  if (!thread) return fail("That conversation no longer exists.");
  if (!thread.isAllowed) {
    return fail("That number is silenced. Un-silence it before replying.");
  }

  const result = await sendText({
    to: thread.phoneNumber,
    text,
    conversationId: thread.id,
  });

  await audit({
    actorId: actor.id,
    action: "whatsapp.manual_reply",
    entity: "whatsapp_conversation",
    entityId: thread.id,
    after: { ok: result.ok, length: text.length },
  });

  revalidatePath(`${PANEL}/inbox/${conversationId}`);
  // §40: a send that failed says so, rather than clearing the box and looking
  // like it worked.
  return result.ok
    ? succeed({ message: "Sent." })
    : fail(`Could not send: ${result.error}`);
}

/** Silence or un-silence a number — the nuisance switch, not an opt-out. */
export async function setContactAllowed(
  contactId: string,
  isAllowed: boolean,
): Promise<ActionResult<{ message: string }>> {
  const actor = await adminActor();

  const [updated] = await db()
    .update(whatsappContacts)
    .set({ isAllowed, updatedAt: new Date() })
    .where(eq(whatsappContacts.id, contactId))
    .returning({ id: whatsappContacts.id });
  if (!updated) return fail("That contact no longer exists.");

  await audit({
    actorId: actor.id,
    action: isAllowed ? "whatsapp.contact_unsilenced" : "whatsapp.contact_silenced",
    entity: "whatsapp_contact",
    entityId: contactId,
  });

  revalidatePath(`${PANEL}/inbox`);
  return succeed({ message: isAllowed ? "Un-silenced." : "Silenced." });
}

// --- helpers --------------------------------------------------------------

/** image | video | document, from the browser's content type. */
function mediaKindFor(
  mimeType: string,
): "image" | "video" | "document" | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "document";
  return null;
}

/** Only the filters the composer offers, and only when actually set. */
function readFilters(formData: FormData): LeadFilters {
  return {
    status: str(formData.get("status")),
    priority: str(formData.get("priority")),
    assignedToId: str(formData.get("assignedToId")),
    sourceKey: str(formData.get("sourceKey")),
    city: str(formData.get("city")),
    createdFrom: str(formData.get("createdFrom")),
    createdTo: str(formData.get("createdTo")),
  };
}

const str = (value: FormDataEntryValue | null): string | undefined => {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : undefined;
};

/**
 * Drops empty values so a blank select does not narrow anything.
 *
 * `"" as LeadStatus` would otherwise reach filterClause as a real status and
 * match nothing at all — a composer that silently selected nobody.
 */
function clean(filters: LeadFilters): LeadFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== undefined && value !== "" && value !== null,
    ),
  ) as LeadFilters;
}

