/**
 * One canonical form for a phone number.
 *
 * Canonical form is E.164 digits with no leading plus: 919876543210. Living is
 * a Kochi business, so an unqualified ten-digit number is Indian — but that is
 * a default, applied only when the number is unmistakably national, never a
 * blanket assumption. A number that already carries a country code is left
 * alone.
 *
 * `nationalDigits` (the last ten) is the matching key against users.mobile and
 * leads.mobile: the CRM has always compared on the last ten digits
 * (lib/leads.ts normaliseMobile), and a second convention here would mean
 * numbers that match in one place and not the other.
 */

const DEFAULT_COUNTRY_CODE = process.env.PHONE_DEFAULT_COUNTRY_CODE ?? "91";

/** The longest national number anywhere is 15 digits including the code. */
const MAX_E164_DIGITS = 15;
const MIN_DIGITS = 8;

export type NormalisedPhone = {
  /** E.164 without the plus, e.g. "919876543210". */
  phoneNumber: string;
  /** Last ten digits — the CRM's matching key. */
  nationalDigits: string;
};

/**
 * Accepts anything a person or a messaging gateway might hand over:
 * "+91 98765 43210", "09876543210", "9876543210", "919876543210@c.us".
 * Returns null for what cannot be a phone number, rather than a
 * plausible-looking wrong answer.
 */
export function normalisePhone(
  input: string | null | undefined,
): NormalisedPhone | null {
  if (!input) return null;
  // Addresses that are not phone numbers. A "@lid" is WhatsApp's privacy-masked
  // sender id — the digits in front of it look like an E.164 number and are
  // not one, so without this guard a masked sender is silently stored as a
  // fabricated number that matches no employee and cannot be replied to.
  // Resolving a lid to its real number needs the gateway: see
  // lib/integrations/whatsapp/openwa/lid.ts.
  // Lowercased first: gateways are not consistent about the case of these
  // suffixes, and a case-sensitive check is a guard that only usually holds.
  const address = input.toLowerCase();
  if (
    address.includes("@g.us") ||
    address.includes("@broadcast") ||
    address.includes("@lid")
  ) {
    return null;
  }

  // Messaging ids can carry a device suffix: 919876543210:12@c.us.
  const local = input.split("@")[0].split(":")[0];
  let digits = local.replace(/\D/g, "");

  // International prefix dialled rather than typed.
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.length === 10) {
    // A bare national number. This is the only place the default applies.
    digits = `${DEFAULT_COUNTRY_CODE}${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    // Trunk prefix — "0" then the national number.
    digits = `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  }

  if (digits.length < MIN_DIGITS || digits.length > MAX_E164_DIGITS) return null;

  return { phoneNumber: digits, nationalDigits: digits.slice(-10) };
}

/** For display only — never for matching. */
export function formatPhone(phoneNumber: string): string {
  if (phoneNumber.length === 12 && phoneNumber.startsWith("91")) {
    return `+91 ${phoneNumber.slice(2, 7)} ${phoneNumber.slice(7)}`;
  }
  return `+${phoneNumber}`;
}

/** Masked for a screen that shouldn't hand the number over: enough to
 *  recognise, not enough to reuse. */
export function maskPhone(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) return "—";
  return `+${phoneNumber.slice(0, 2)} ••••• ${phoneNumber.slice(-4)}`;
}
