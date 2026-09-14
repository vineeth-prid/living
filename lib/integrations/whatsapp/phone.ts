// Phone normalisation now lives in lib/phone.ts — the property owner block on
// the admin form needs the same canonical form, and it has nothing to do with
// WhatsApp. Two copies would drift, and a number that normalised one way here
// and another way there is a contact that silently fails to match.
//
// Re-exported rather than rewritten at every call site: the provider layer
// genuinely does need these, and the chat-id builder below is the one part that
// is WhatsApp's own.

export {
  formatPhone,
  maskPhone,
  normalisePhone,
  type NormalisedPhone,
} from "@/lib/phone";

/** The provider's addressing form for a one-to-one chat. */
export const chatIdFor = (phoneNumber: string) => `${phoneNumber}@c.us`;
