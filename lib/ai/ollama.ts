// Minimal Ollama client. There was no AI integration in this codebase before
// this, so this is it: one POST to /api/chat, JSON mode, no dependency.
//
// The model is an interpreter and nothing else (§15/§34). It never sees a
// connection string, never produces SQL, and its output is validated against a
// Zod schema before anything reads a field off it.

export type OllamaMessage = { role: "system" | "user" | "assistant"; content: string };

export function hasOllama() {
  return Boolean(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_MODEL);
}

export function ollamaModel() {
  return process.env.OLLAMA_MODEL ?? "";
}

export class OllamaError extends Error {}

/**
 * Asks for a JSON object and returns the raw text of it. Parsing and validation
 * are the caller's job — a model that returns valid JSON of the wrong shape is
 * still wrong, and only the schema knows that.
 */
export async function chatJson(messages: OllamaMessage[]): Promise<string> {
  return chat(messages, { json: true, maxTokens: 512 });
}

/**
 * Prose, for a reply a customer will read (lib/crm/whatsapp/assistant.ts).
 *
 * Separate from `chatJson` only in `format` and the sampling: an answer in a
 * chat wants a little warmth, where intent parsing wants the same answer every
 * time. Both go through the one request function below — two copies of the
 * timeout, the abort handling and the error translation is how one of them ends
 * up without a timeout.
 */
export async function chatText(
  messages: OllamaMessage[],
  { maxTokens = 220 }: { maxTokens?: number } = {},
): Promise<string> {
  return chat(messages, { json: false, maxTokens });
}

async function chat(
  messages: OllamaMessage[],
  { json, maxTokens }: { json: boolean; maxTokens: number },
): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  const model = process.env.OLLAMA_MODEL;
  if (!baseUrl || !model) {
    throw new OllamaError(
      "Ollama is not configured. Set OLLAMA_BASE_URL and OLLAMA_MODEL.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Number(process.env.OLLAMA_TIMEOUT_MS ?? 30_000),
  );

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        // Structured output. Temperature 0 because this is parsing, not
        // writing — the same message must yield the same intent twice running.
        ...(json ? { format: "json" } : {}),
        options: {
          temperature: json
            ? Number(process.env.OLLAMA_TEMPERATURE ?? 0)
            : Number(process.env.OLLAMA_REPLY_TEMPERATURE ?? 0.3),
          num_predict: maxTokens,
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new OllamaError(
        `Ollama returned ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    }

    const body = (await response.json()) as { message?: { content?: string } };
    const content = body.message?.content;
    if (!content) throw new OllamaError("Ollama returned no content.");
    return content;
  } catch (error) {
    if (error instanceof OllamaError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OllamaError("Ollama timed out.");
    }
    throw new OllamaError(
      `Ollama could not be reached: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
