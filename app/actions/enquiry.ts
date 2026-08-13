"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createLead } from "@/lib/leads";
import { publicPropertyExists } from "@/lib/properties";
import { hasDatabase } from "@/lib/db";

// Public, unauthenticated entry point into the CRM (§31, §32). Everything
// arriving here is untrusted: it is validated, length-capped, rate-limited, and
// the property id is checked against the published set rather than believed.

const enquirySchema = z.object({
  name: z.string().trim().min(2, "Please tell us your name.").max(120),
  mobile: z
    .string()
    .trim()
    .regex(/^[+0-9][0-9 ()-]{6,19}$/, "Please enter a valid phone number."),
  email: z
    .string()
    .trim()
    .max(200)
    .email("Please enter a valid email.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  message: z.string().trim().max(2000).optional(),
  interest: z.string().trim().max(120).optional(),
  propertyId: z.string().trim().max(200).optional(),
  // Attribution, read from the page rather than typed by the visitor.
  landingPage: z.string().trim().max(500).optional(),
  referrerUrl: z.string().trim().max(500).optional(),
  utmSource: z.string().trim().max(120).optional(),
  utmMedium: z.string().trim().max(120).optional(),
  utmCampaign: z.string().trim().max(120).optional(),
  // Honeypot: a real person never fills a hidden field.
  company: z.string().max(0).optional(),
});

export type EnquiryState = {
  ok?: boolean;
  error?: string;
  reference?: string;
};

// ponytail: in-memory fixed window, one node. It stops a form being hammered
// from a single address, which is all it claims to do. Move to Postgres or
// Redis if the site ever runs more than one instance — per-process counters
// drift apart behind a load balancer.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    // Opportunistic cleanup so the map can't grow without bound.
    if (attempts.size > 5000) {
      for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export async function submitEnquiry(
  _prev: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const parsed = enquirySchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const input = parsed.data;

  // Silently accept honeypot hits: telling a bot it was caught teaches it.
  if (input.company) return { ok: true };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return { error: "That's a few too many messages. Please call us instead." };
  }

  if (!hasDatabase()) {
    // Without Postgres there is nowhere to put the lead. Say so rather than
    // showing a success screen for a message that went nowhere.
    console.error("[enquiry] DATABASE_URL unset — enquiry not stored");
    return {
      error: "We couldn't submit that just now. Please call or WhatsApp us.",
    };
  }

  // Never trust a submitted property id: it must resolve to a listing that is
  // actually published, or the association is dropped.
  const propertyId =
    input.propertyId && (await publicPropertyExists(input.propertyId))
      ? input.propertyId
      : undefined;

  try {
    const { reference } = await createLead({
      name: input.name,
      mobile: input.mobile,
      email: input.email ?? null,
      initialMessage: input.message ?? null,
      requirementType: input.interest ?? null,
      sourceKey: propertyId ? "property_page" : "website",
      landingPage: input.landingPage ?? null,
      referrerUrl: input.referrerUrl ?? null,
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
      propertyIds: propertyId ? [propertyId] : [],
    });

    return { ok: true, reference };
  } catch (error) {
    console.error("[enquiry] failed to create lead", error);
    return {
      error: "We couldn't submit that just now. Please call or WhatsApp us.",
    };
  }
}
