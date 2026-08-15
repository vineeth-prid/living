import { CRM_TIMEZONE } from "@/lib/integrations/whatsapp/config";
import { chatJson, hasOllama, ollamaModel } from "../ollama";
import { systemPrompt, userPrompt } from "./prompts";
import { parseIntentJson, type ParsedIntent } from "./schema";

export type IntentResult =
  | { ok: true; intent: ParsedIntent; model: string }
  | { ok: false; error: string; model: string };

/** Today, in Living's timezone rather than the server's. */
export function crmToday(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: CRM_TIMEZONE,
    weekday: "long",
  }).format(now);
  return { date, weekday };
}

/**
 * One message in, one validated intent out.
 *
 * Failure is a normal outcome here — Ollama being down, a model returning
 * prose, a shape that does not validate. All of them come back as `ok: false`
 * so the caller can say "I didn't understand that" rather than crashing a
 * webhook.
 */
export async function parseIntent(input: {
  text: string;
  employeeName: string;
  /** The question the CRM is currently waiting on, if any (§57). */
  pending?: string;
  now?: Date;
}): Promise<IntentResult> {
  const model = ollamaModel();
  if (!hasOllama()) {
    return { ok: false, error: "Ollama is not configured.", model };
  }

  const { date, weekday } = crmToday(input.now);

  let raw: string;
  try {
    raw = await chatJson([
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: userPrompt({
          text: input.text,
          employeeName: input.employeeName,
          today: date,
          weekday,
          pending: input.pending,
        }),
      },
    ]);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      model,
    };
  }

  const parsed = parseIntentJson(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error, model };
  return { ok: true, intent: parsed, model };
}
