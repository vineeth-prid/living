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
        format: "json",
        options: {
          temperature: Number(process.env.OLLAMA_TEMPERATURE ?? 0),
          num_predict: 512,
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
