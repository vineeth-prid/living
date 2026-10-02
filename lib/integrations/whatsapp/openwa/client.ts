import { openWAConfig, type OpenWAConfig } from "../config";
import type { MediaSendKind } from "../types";

// The only file in the codebase that knows OpenWA's HTTP shape. Everything
// above it speaks Living's types (§3).
//
// OpenWA is an unofficial gateway on someone else's VPS: it will be down, slow
// and occasionally wrong. Every call here is bounded by a timeout and either
// retried or not on purpose — never retried forever (§49).

export class OpenWAError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** Whether trying again could plausibly work. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OpenWAError";
  }
}

/** 408/429 and 5xx are worth another go; 4xx means the request itself is wrong. */
const isRetryableStatus = (status: number) =>
  status === 408 || status === 429 || status >= 500;

/**
 * `path` is appended to the base URL. Bodies and responses are JSON.
 *
 * Only idempotent verbs are retried by default: replaying a POST that already
 * reached OpenWA would send the message twice, and a duplicate WhatsApp message
 * is worse than a failed one.
 */
async function request<T>(
  config: OpenWAConfig,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  { retry = method === "GET" } = {},
): Promise<T> {
  const attempts = retry ? Math.max(1, config.maxRetries) : 1;
  let lastError: OpenWAError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await once<T>(config, method, path, body);
    } catch (error) {
      const failure =
        error instanceof OpenWAError
          ? error
          : new OpenWAError(String(error), null, true);
      lastError = failure;
      if (!failure.retryable || attempt === attempts) break;
      // Exponential backoff with a ceiling — 400ms, 800ms, 1600ms…
      await sleep(Math.min(400 * 2 ** (attempt - 1), 5_000));
    }
  }

  throw lastError ?? new OpenWAError("Request failed.", null, false);
}

async function once<T>(
  config: OpenWAConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        // Header-only auth. OpenWA does not accept a query-parameter key, and
        // a key in a URL ends up in access logs anyway.
        "X-API-Key": config.apiKey,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();

    if (!response.ok) {
      // NestJS error shape: { statusCode, message, error }. The message is
      // safe to surface; the key is never in it.
      let detail = text.slice(0, 300);
      try {
        const parsed = JSON.parse(text) as { message?: string | string[] };
        if (parsed.message) {
          detail = Array.isArray(parsed.message)
            ? parsed.message.join("; ")
            : parsed.message;
        }
      } catch {
        // Not JSON — a proxy error page. The truncated body is the best clue.
      }
      throw new OpenWAError(
        `OpenWA ${method} ${path} failed (${response.status}): ${detail}`,
        response.status,
        isRetryableStatus(response.status),
      );
    }

    return (text ? JSON.parse(text) : null) as T;
  } catch (error) {
    if (error instanceof OpenWAError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenWAError(
        `OpenWA ${method} ${path} timed out after ${config.timeoutMs}ms.`,
        null,
        true,
      );
    }
    // DNS failure, refused connection, TLS problem.
    throw new OpenWAError(
      `OpenWA ${method} ${path} could not be reached: ${
        error instanceof Error ? error.message : String(error)
      }`,
      null,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- wire types -----------------------------------------------------------
// Kept loose on purpose. OpenWA is a moving target and these are read
// defensively: a field that arrives with a different name degrades to null
// rather than throwing halfway through processing a real message.

export type OpenWASession = {
  id?: string;
  name?: string;
  status?: string;
  state?: string;
  connected?: boolean;
  phoneNumber?: string;
  me?: { id?: string; pushname?: string; phoneNumber?: string };
};

export type OpenWAWebhook = {
  id?: string;
  url?: string;
  events?: string[];
  isActive?: boolean;
};

/**
 * A contact as the gateway returns it.
 *
 * `id` is the addressable WhatsApp id — "919035367324@c.us" — and it is the
 * only field that carries the real number for a privacy-masked sender.
 * `number` keeps showing the masked pseudo-number, so reading it back gives
 * you the same fabricated digits you were trying to resolve.
 */
export type OpenWAContact = {
  id?: string;
  number?: string;
  name?: string;
  pushname?: string;
};

export type OpenWASendResult = {
  id?: string;
  messageId?: string;
  timestamp?: number;
};

/**
 * OpenWA's media routes, one per kind.
 *
 * The single source of truth for these names. If the gateway is upgraded and a
 * path changes, this is the line to edit — and `sendMedia` below puts the path
 * it tried into the error, so a mismatch shows up in the broadcast report
 * rather than needing anyone to read this file.
 *
 * `audio` is deliberately absent: it needs a mimetype and a ptt flag that
 * nothing upstream produces, and the composer cannot create one.
 */
const MEDIA_ENDPOINTS: Partial<Record<MediaSendKind, string>> = {
  image: "/messages/send-image",
  video: "/messages/send-video",
  document: "/messages/send-document",
};

export const openWA = {
  config: openWAConfig,

  getSession(config = openWAConfig()) {
    return request<OpenWASession>(
      config,
      "GET",
      `/api/sessions/${encodeURIComponent(config.sessionId)}`,
    );
  },

  /** Accepts a plain number, a "@c.us" id, or a "@lid" masked id. */
  getContact(contactId: string, config = openWAConfig()) {
    return request<OpenWAContact>(
      config,
      "GET",
      `/api/sessions/${encodeURIComponent(config.sessionId)}/contacts/${encodeURIComponent(contactId)}`,
    );
  },

  sendText(chatId: string, text: string, config = openWAConfig()) {
    return request<OpenWASendResult>(
      config,
      "POST",
      `/api/sessions/${encodeURIComponent(config.sessionId)}/messages/send-text`,
      { chatId, text },
      { retry: false },
    );
  },

  /**
   * Media goes to a type-specific endpoint, decided here.
   *
   * There is no generic `send-media` route on OpenWA — this used to post to one
   * anyway, and every media message came back
   * `Cannot POST /api/sessions/…/messages/send-media` before the gateway even
   * looked at it. The route existed only in this file's imagination, and nothing
   * exercised it until broadcasts shipped.
   *
   * The names are in one map so correcting one is a one-line change, and the
   * error below names the path it tried — a wrong guess should be diagnosable
   * from the stored error alone rather than needing someone to read this file.
   */
  sendMedia(
    payload: {
      chatId: string;
      kind?: MediaSendKind;
      mimeType?: string;
      url?: string;
      base64?: string;
      filename?: string;
      caption?: string;
    },
    config = openWAConfig(),
  ) {
    // Matching the `?? "image"` the broadcast engine already applies: a missing
    // kind is overwhelmingly a photo, and a photo sent as a photo is a better
    // failure than a 400 for an absent field.
    const kind = payload.kind ?? "image";
    if (!payload.kind) {
      console.warn(
        `[openwa] media send with no kind, assuming image (chat ${payload.chatId})`,
      );
    }

    const path = MEDIA_ENDPOINTS[kind];
    if (!path) {
      // Not reachable from the composer, which accepts only images, video and
      // PDF. Refused rather than guessed: an audio send needs a mimetype and a
      // ptt flag, and inventing either would produce a message that arrives
      // looking broken instead of one that plainly did not send.
      throw new OpenWAError(
        `Sending ${kind} is not supported yet — add its endpoint and required fields to MEDIA_ENDPOINTS first.`,
        null,
        false,
      );
    }

    if (!payload.url && !payload.base64) {
      // The service checks this too, but the guard belongs here as well: this is
      // the layer that knows OpenWA needs one or the other, and a request with
      // neither comes back as a bare 400 that says nothing useful.
      throw new OpenWAError(
        "No media to send — a URL or an inline payload is required.",
        null,
        false,
      );
    }

    if (kind === "document" && !payload.mimeType) {
      // WhatsApp renders a document with no content type as an unopenable blob.
      // Better to fail here, where the report says why.
      throw new OpenWAError(
        "A document needs its content type, and none reached the provider.",
        null,
        false,
      );
    }

    // Only the fields that have a value. A strict validator on the gateway
    // rejects an explicit null where it accepts an absent key.
    const body: Record<string, unknown> = { chatId: payload.chatId };
    if (payload.url) body.url = payload.url;
    if (payload.base64) body.base64 = payload.base64;
    if (payload.caption) body.caption = payload.caption;
    if (kind === "document") {
      body.filename = payload.filename ?? "document";
      body.mimetype = payload.mimeType;
    }

    return request<OpenWASendResult>(
      config,
      "POST",
      `/api/sessions/${encodeURIComponent(config.sessionId)}${path}`,
      body,
      { retry: false },
    );
  },

  listWebhooks(config = openWAConfig()) {
    return request<OpenWAWebhook[]>(
      config,
      "GET",
      `/api/sessions/${encodeURIComponent(config.sessionId)}/webhooks`,
    );
  },

  createWebhook(
    payload: { url: string; events: string[]; secret: string },
    config = openWAConfig(),
  ) {
    return request<OpenWAWebhook>(
      config,
      "POST",
      `/api/sessions/${encodeURIComponent(config.sessionId)}/webhooks`,
      payload,
      { retry: false },
    );
  },
};
