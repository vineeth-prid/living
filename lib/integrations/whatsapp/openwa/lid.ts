// Resolving WhatsApp's privacy-masked sender ids.
//
// On some sessions every inbound message arrives with the sender masked as
// "210354630082686@lid" instead of a phone number. The digits in front of the
// suffix are a pseudo-id, not a number: they parse as a plausible E.164 string
// and belong to nobody. Storing one breaks employee matching (the join is on
// the real number), routes an admin's message down the anonymous-customer
// path, and makes every reply undeliverable.
//
// The gateway can map it back, with one trap: the real number comes back in
// the response's `id` field ("919035367324@c.us"), while `number` still holds
// the masked pseudo-number. Reading `number` returns exactly the garbage this
// module exists to avoid.

import { normalisePhone, type NormalisedPhone } from "@/lib/phone";
import { openWA } from "./client";

const LID_SUFFIX = "@lid";

export const isLidId = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.trim().toLowerCase().endsWith(LID_SUFFIX);

// One lid maps to one number for as long as the contact exists, and the same
// sender arrives on every message they send — so without a cache this is an
// extra gateway round trip per message.
//
// ponytail: process-local cache. Run more than one app instance and each keeps
// its own; move the lookup to a whatsapp_contacts read if that ever matters.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { phone: NormalisedPhone; at: number }>();

function cached(lid: string): NormalisedPhone | null {
  const hit = cache.get(lid);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(lid);
    return null;
  }
  return hit.phone;
}

function remember(lid: string, phone: NormalisedPhone) {
  // Oldest-first eviction; insertion order is what Map iteration gives us.
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(lid, { phone, at: Date.now() });
}

/** Test seam — the check script has no gateway to talk to. */
export function __resetLidCache() {
  cache.clear();
}

/**
 * Masked id → real phone, or null if the gateway cannot say.
 *
 * Null is a refusal, not a fallback: the caller must not carry on with the
 * masked digits. Inventing a number here is the bug this replaces.
 */
export async function resolveLidPhone(
  lid: string,
): Promise<NormalisedPhone | null> {
  const key = lid.trim();
  if (!key) return null;

  const hit = cached(key);
  if (hit) return hit;

  let contact;
  try {
    contact = await openWA.getContact(key);
  } catch (error) {
    console.warn(
      `[whatsapp] could not resolve masked sender ${key}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }

  // `id` only. `number` still carries the mask.
  const phone = normalisePhone(contact?.id);
  if (!phone) {
    console.warn(
      `[whatsapp] contact lookup for ${key} returned no usable id (got ${JSON.stringify(contact?.id ?? null)})`,
    );
    return null;
  }

  remember(key, phone);
  return phone;
}
