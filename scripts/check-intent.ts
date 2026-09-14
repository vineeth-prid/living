/**
 * How well the configured model actually reads Living's messages.
 *
 *   OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=qwen2.5:7b-instruct \
 *     npm run check:intent
 *
 * The only honest way to choose a model is to run real messages through it and
 * count, so this counts: intent accuracy, how often the answer lands above the
 * confidence floor that gates execution, and how often the JSON comes back in a
 * shape the schema accepts at all.
 *
 * Run it once per candidate and compare the three numbers. Nothing here touches
 * a database or sends a message — it is the parser in isolation.
 *
 * Note what is NOT measured: every phrasing HELP advertises is matched before
 * the model is consulted (lib/crm/whatsapp/commands.ts), so those are not in
 * this set. What is here is the other half of the job — the sentences, the
 * phrasings nobody predicted — which is the half the model actually owns.
 */
import { parseIntent } from "../lib/ai/crm-intent/parser";
import { hasOllama, ollamaModel } from "../lib/ai/ollama";
import { CONFIDENCE } from "../lib/integrations/whatsapp/config";
import type { Intent } from "../lib/ai/crm-intent/schema";

/**
 * Messages a model has to earn.
 *
 * Real shapes, none of them matched by the deterministic router: paraphrases of
 * the documented commands, and the sentences staff actually type.
 */
const CASES: [string, Intent][] = [
  // Paraphrases — the same command, said differently.
  ["can you pull up Rajesh for me", "GET_LEAD"],
  ["what have I got on today", "GET_MY_FOLLOWUPS"],
  ["which of my leads are hot", "GET_MY_LEADS"],
  ["stick a note on Raj saying he wants a sea view", "ADD_LEAD_NOTE"],
  ["Rajesh is negotiating now", "CHANGE_LEAD_STATUS"],
  ["put Anitha on the Rajesh lead", "ASSIGN_LEAD"],
  ["book a call with Raj tomorrow morning", "ADD_FOLLOWUP"],
  ["Raj's call is done", "COMPLETE_FOLLOWUP"],
  ["push Raj's call to Monday", "RESCHEDULE_FOLLOWUP"],
  ["drop LIV-0027 to 1.6 crore", "UPDATE_PROPERTY_PRICE"],
  ["put LIV-0027 live", "PUBLISH_PROPERTY"],
  ["take LIV-0027 off the site", "UNPUBLISH_PROPERTY"],
  ["I want to list a new villa", "CREATE_PROPERTY_DRAFT"],
  ["new lead, Meera, 9847012345", "CREATE_LEAD"],
  ["Raj is interested in LIV-0027", "ASSOCIATE_PROPERTY_TO_LEAD"],
  ["what can you do", "HELP"],
  // Not instructions — these must come back as CLARIFICATION_REQUIRED rather
  // than as a confident guess at a write.
  ["hi", "CLARIFICATION_REQUIRED"],
  ["thanks, that's great", "CLARIFICATION_REQUIRED"],
  ["ok", "CONFIRM"],
];

async function main() {
  if (!hasOllama()) {
    console.error(
      "Ollama is not configured. Set OLLAMA_BASE_URL and OLLAMA_MODEL, then run again.",
    );
    process.exitCode = 1;
    return;
  }

  const model = ollamaModel();
  console.log(`\nMODEL: ${model}`);
  console.log(`floor to execute: ${CONFIDENCE.execute}   floor to act at all: ${CONFIDENCE.confirm}\n`);
  console.log("  " + "MESSAGE".padEnd(46) + "EXPECTED".padEnd(28) + "GOT".padEnd(28) + "CONF");
  console.log("  " + "-".repeat(110));

  let correct = 0;
  let usable = 0;
  let unparseable = 0;
  let unstated = 0;
  const started = Date.now();

  for (const [text, expected] of CASES) {
    const result = await parseIntent({ text, employeeName: "Anitha" });

    if (!result.ok) {
      unparseable += 1;
      console.log("! " + text.padEnd(46) + expected.padEnd(28) + "(no valid JSON)".padEnd(28) + "—");
      continue;
    }

    const got = result.intent.actions[0]?.intent ?? "(none)";
    const stated = result.intent.confidence;
    if (stated === undefined) unstated += 1;
    // Matches the router: an unstated confidence is actionable, and writes are
    // confirmed instead of being refused.
    const confidence = stated ?? CONFIDENCE.confirm;
    const hit = got === expected;
    const actedOn = confidence >= CONFIDENCE.confirm;
    if (hit) correct += 1;
    if (hit && actedOn) usable += 1;

    console.log(
      `${hit ? (actedOn ? " " : "~") : "!"} ` +
        text.padEnd(46) +
        expected.padEnd(28) +
        got.padEnd(28) +
        (stated === undefined ? "unstated" : stated.toFixed(2)),
    );
  }

  const total = CASES.length;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log("  " + "-".repeat(110));
  console.log(`
  right intent          ${correct}/${total}   (${Math.round((correct / total) * 100)}%)
  right AND actioned    ${usable}/${total}   (${Math.round((usable / total) * 100)}%)  <- what staff actually experience
  unusable JSON         ${unparseable}/${total}
  no confidence given   ${unstated}/${total}   (writes are confirmed rather than refused)
  elapsed               ${seconds}s

  "~" is the expensive failure: the right answer, rejected for low confidence,
  and answered with "I didn't follow that". A model that cannot estimate its own
  confidence loses its correct answers to the floor.

  Below about 80% on the middle number, staff stop trusting the CRM.
`);

  if (usable < total * 0.8) process.exitCode = 1;
}

main();
