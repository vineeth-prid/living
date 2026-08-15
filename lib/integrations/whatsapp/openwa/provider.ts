import { openWAConfig } from "../config";
import { chatIdFor } from "../phone";
import type {
  InboundEvent,
  SendMediaInput,
  SendResult,
  SendTextInput,
  SessionInfo,
  WebhookRegistration,
  WhatsAppProvider,
  WhatsAppSessionStatus,
} from "../types";
import { OpenWAError, openWA, type OpenWASession } from "./client";
import { parseOpenWAWebhook } from "./webhook";

// Translates between Living's vocabulary and OpenWA's. This class is the only
// implementation detail that changes when Living moves to Meta's Cloud API.

function statusFrom(session: OpenWASession): WhatsAppSessionStatus {
  if (session.connected === true) return "connected";
  const value = (session.status ?? session.state ?? "").toLowerCase();
  if (["connected", "authenticated", "ready", "open", "working"].includes(value)) {
    return "connected";
  }
  if (["connecting", "qr", "pairing", "starting", "scan_qr_code"].includes(value)) {
    return "connecting";
  }
  if (["disconnected", "closed", "logged_out", "stopped", "failed"].includes(value)) {
    return "disconnected";
  }
  return "unknown";
}

/** Every send funnels through here so failures come back typed, never thrown. */
async function attempt(
  send: () => Promise<{ id?: string; messageId?: string }>,
): Promise<SendResult> {
  try {
    const result = await send();
    return { ok: true, providerMessageId: result?.messageId ?? result?.id ?? null };
  } catch (error) {
    if (error instanceof OpenWAError) {
      return { ok: false, error: error.message, retryable: error.retryable };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      retryable: false,
    };
  }
}

export class OpenWAProvider implements WhatsAppProvider {
  readonly name = "openwa" as const;

  sendText(input: SendTextInput): Promise<SendResult> {
    return attempt(() => openWA.sendText(chatIdFor(input.to), input.text));
  }

  sendMedia(input: SendMediaInput): Promise<SendResult> {
    return attempt(() =>
      openWA.sendMedia({
        chatId: chatIdFor(input.to),
        url: input.url,
        base64: input.base64,
        filename: input.filename,
        caption: input.caption ?? input.text,
      }),
    );
  }

  async getSessionStatus(): Promise<SessionInfo> {
    const config = openWAConfig();
    const session = await openWA.getSession(config);
    return {
      providerSessionId: session.id ?? config.sessionId,
      status: statusFrom(session),
      phoneNumber:
        session.phoneNumber ??
        session.me?.phoneNumber ??
        session.me?.id?.split("@")[0] ??
        null,
      displayName: session.name ?? session.me?.pushname ?? null,
    };
  }

  async listWebhooks(): Promise<WebhookRegistration[]> {
    const hooks = await openWA.listWebhooks();
    return (hooks ?? []).map((hook) => ({
      id: hook.id ?? null,
      url: hook.url ?? "",
      events: hook.events ?? [],
    }));
  }

  /**
   * §42: idempotent. A registration already pointing at the same URL is
   * returned as-is rather than duplicated — otherwise every deploy would add
   * another hook and every message would arrive n times.
   */
  async configureWebhook(
    url: string,
    events: string[],
    secret: string,
  ): Promise<WebhookRegistration> {
    const existing = await this.listWebhooks();
    const match = existing.find((hook) => hook.url === url);
    if (match) return match;

    const created = await openWA.createWebhook({ url, events, secret });
    return {
      id: created.id ?? null,
      url: created.url ?? url,
      events: created.events ?? events,
    };
  }

  parseWebhook(rawBody: string, headers: Headers): InboundEvent | { rejected: string } {
    const config = openWAConfig();
    return parseOpenWAWebhook(
      rawBody,
      headers,
      config.webhookSecret,
      config.sessionId,
    );
  }
}
