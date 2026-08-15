import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappWebhookEvents } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { isWhatsAppEnabled } from "@/lib/integrations/whatsapp/config";
import {
  retryFailedOutbound,
  whatsappProvider,
} from "@/lib/integrations/whatsapp/service";
import { processInboundEvent } from "@/lib/integrations/whatsapp/inbound";

// §4/§5/§6. The only untrusted entrance to the CRM.
//
// Order matters and is not negotiable: verify the signature before parsing,
// claim the idempotency key before doing any work, and answer quickly. AI
// interpretation and CRM writes happen after the response goes out (§4) —
// OpenWA retries anything slow, and a retry that overtakes the first delivery
// is exactly what the idempotency claim is there to stop.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isWhatsAppEnabled()) {
    // Nothing is configured, so nothing can be verified. Refusing is the only
    // safe answer — an unconfigured endpoint that accepts posts is an open door.
    return new Response("WhatsApp integration is disabled.", { status: 503 });
  }

  // The raw body, before any parsing: the signature covers these exact bytes.
  const rawBody = await request.text();
  const parsed = whatsappProvider().parseWebhook(rawBody, request.headers);

  if ("rejected" in parsed) {
    // Deliberately terse. Telling a caller which part of their forgery was
    // wrong helps them forge the next one.
    console.warn("[whatsapp] webhook rejected:", parsed.rejected);
    return new Response("Rejected", { status: 401 });
  }

  // Claim the key. The unique index does the deduplication, so two concurrent
  // deliveries of the same event cannot both win — one insert simply returns
  // nothing (§6).
  const eventRowId = newId();
  const [claimed] = await db()
    .insert(whatsappWebhookEvents)
    .values({
      id: eventRowId,
      provider: parsed.provider,
      idempotencyKey: parsed.idempotencyKey,
      deliveryId: parsed.deliveryId,
      event: parsed.event,
      providerSessionId: parsed.providerSessionId,
      providerMessageId: parsed.message?.providerMessageId ?? null,
      status: "received",
      payload: parsed.raw,
    })
    .onConflictDoNothing({
      target: [
        whatsappWebhookEvents.provider,
        whatsappWebhookEvents.idempotencyKey,
      ],
    })
    .returning({ id: whatsappWebhookEvents.id });

  if (!claimed) {
    // Already handled. A duplicate is a success, not an error — answering
    // anything else makes OpenWA retry it again.
    return Response.json({ ok: true, duplicate: true });
  }

  // Acknowledge now, work afterwards. `after` runs once the response is
  // flushed, so a slow model or a slow CRM write never turns into a webhook
  // timeout and a redelivery.
  after(async () => {
    try {
      await processInboundEvent(parsed);
      // §48. An inbound message proves the gateway is reachable again, which
      // makes it the cheapest moment to drain anything that failed while it
      // wasn't. No scheduler needed, and no queue to run.
      await retryFailedOutbound(5);
      await db()
        .update(whatsappWebhookEvents)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(whatsappWebhookEvents.id, eventRowId));
    } catch (error) {
      // The event row is the record that this arrived and failed; without it a
      // dropped message is invisible.
      console.error("[whatsapp] processing failed", error);
      await db()
        .update(whatsappWebhookEvents)
        .set({
          status: "failed",
          processedAt: new Date(),
          error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        })
        .where(eq(whatsappWebhookEvents.id, eventRowId));
    }
  });

  return Response.json({ ok: true });
}

/** OpenWA's dashboard pings the URL when a webhook is saved. */
export function GET() {
  return Response.json({ ok: true, endpoint: "openwa-webhook" });
}
