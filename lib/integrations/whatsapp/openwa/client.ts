import { openWAConfig, type OpenWAConfig } from "../config";

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

export type OpenWASendResult = {
  id?: string;
  messageId?: string;
  timestamp?: number;
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

  sendText(chatId: string, text: string, config = openWAConfig()) {
    return request<OpenWASendResult>(
      config,
      "POST",
      `/api/sessions/${encodeURIComponent(config.sessionId)}/messages/send-text`,
      { chatId, text },
      { retry: false },
    );
  },

  sendMedia(
    payload: {
      chatId: string;
      url?: string;
      base64?: string;
      filename?: string;
      caption?: string;
    },
    config = openWAConfig(),
  ) {
    return request<OpenWASendResult>(
      config,
      "POST",
      `/api/sessions/${encodeURIComponent(config.sessionId)}/messages/send-media`,
      payload,
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
