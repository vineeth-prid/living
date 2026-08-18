import type {
  WhatsAppContactType,
  WhatsAppProviderName,
  WhatsAppSessionStatus,
} from "@/lib/db/schema";

// Living's own vocabulary for WhatsApp. Nothing in here is shaped by OpenWA —
// the provider layer translates at the boundary, so the CRM never learns a
// wire format it would have to unlearn when the provider changes (§59).

export type { WhatsAppContactType, WhatsAppProviderName, WhatsAppSessionStatus };

export type SendTextInput = {
  /** E.164 without the plus. The provider builds its own chat id from this. */
  to: string;
  text: string;
};

export type SendMediaInput = SendTextInput & {
  /** A URL the provider can fetch, or base64 — never both. */
  url?: string;
  base64?: string;
  filename?: string;
  caption?: string;
};

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; retryable: boolean };

export type SessionInfo = {
  providerSessionId: string;
  status: WhatsAppSessionStatus;
  phoneNumber: string | null;
  displayName: string | null;
};

export type WebhookRegistration = {
  id: string | null;
  url: string;
  events: string[];
};

/**
 * An inbound event after the provider layer has translated it. `raw` is kept
 * only so the webhook row can store it for debugging; nothing downstream reads
 * it, and nothing downstream should.
 */
export type InboundEvent = {
  provider: WhatsAppProviderName;
  /** Stable across provider retries — the idempotency key. */
  idempotencyKey: string;
  deliveryId: string | null;
  event: string;
  providerSessionId: string | null;
  message: InboundMessage | null;
  /** Present on session.status events. */
  sessionStatus: WhatsAppSessionStatus | null;
  raw: unknown;
};

export type InboundMessage = {
  providerMessageId: string;
  chatId: string;
  /**
   * E.164 without the plus, already normalised — or null when the gateway
   * masked the sender. A masked sender carries `senderLid` instead and the
   * real number has to be fetched before the message can be routed.
   */
  fromPhone: string | null;
  /** WhatsApp's privacy-masked sender id, e.g. "210354630082686@lid". */
  senderLid: string | null;
  senderName: string | null;
  type: string;
  text: string;
  media: InboundMedia | null;
  /** When the sender sent it, not when we received the webhook. */
  sentAt: Date;
};

export type InboundMedia = {
  mimeType: string | null;
  filename: string | null;
  sizeBytes: number | null;
  /** Whichever the provider gave: a fetchable URL or an inline payload. */
  url: string | null;
  base64: string | null;
};

/** What a provider must be able to do for the CRM to use it. */
export interface WhatsAppProvider {
  readonly name: WhatsAppProviderName;
  sendText(input: SendTextInput): Promise<SendResult>;
  sendMedia(input: SendMediaInput): Promise<SendResult>;
  getSessionStatus(): Promise<SessionInfo>;
  /** Idempotent: reuses an existing registration for the same URL (§42). */
  configureWebhook(url: string, events: string[], secret: string): Promise<WebhookRegistration>;
  listWebhooks(): Promise<WebhookRegistration[]>;
  /**
   * Verifies a delivery and translates it. Given the RAW body, because the
   * signature covers exact bytes — re-serialising a parsed object would change
   * key order and break every verification.
   */
  parseWebhook(rawBody: string, headers: Headers): InboundEvent | { rejected: string };
}
