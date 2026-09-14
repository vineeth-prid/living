/**
 * Every command HELP advertises, run through the router.
 *
 *   npm run check:commands
 *
 * A report rather than a gate: it prints what each documented phrasing resolves
 * to, which entities come out, and whether the registry would let it run. The
 * pass/fail assertions live in check-whatsapp.ts; this is the thing to read
 * when someone says "the CRM does not understand me", because it shows the
 * whole surface at once instead of one message at a time.
 *
 * No database, no Ollama, no network — it exercises the deterministic router,
 * which is the layer that has to work whether or not a model is reachable.
 */
import { COMMANDS, missingFields } from "../lib/crm/whatsapp/registry";
import { matchCommand } from "../lib/crm/whatsapp/commands";
import { t } from "../lib/crm/whatsapp/templates";
import type { Intent } from "../lib/ai/crm-intent/schema";

/** The phrasings HELP prints, plus the ones reported from staging. */
const PHRASINGS: [string, Intent][] = [
  ["Show my follow-ups today", "GET_MY_FOLLOWUPS"],
  ["Show my leads", "GET_MY_LEADS"],
  ["Show my hot leads", "GET_MY_LEADS"],
  ["Show me Raj", "GET_LEAD"],
  ["Show me Rajesh Pillai", "GET_LEAD"],
  ["Get property LIV-0027", "GET_PROPERTY"],
  ["LIV-0010", "GET_PROPERTY"],
  ["Who am I", "GET_PROFILE"],
  ["Help", "HELP"],
  ["System status", "GET_SYSTEM_STATUS"],
  ["Add lead Raj 9876543210", "CREATE_LEAD"],
  ["add lead Rajesh Pillai +91 98765 43210", "CREATE_LEAD"],
  ["Set Raj's city to Kochi", "UPDATE_LEAD"],
  ["Add note to Raj: interested in OMR", "ADD_LEAD_NOTE"],
  ["Raj called about LIV-0027", "ADD_LEAD_ACTIVITY"],
  ["Move Raj to negotiation", "CHANGE_LEAD_STATUS"],
  ["Assign Raj to Anitha", "ASSIGN_LEAD"],
  ["Link LIV-0027 to Raj", "ASSOCIATE_PROPERTY_TO_LEAD"],
  ["Add follow-up for Raj tomorrow at 10am", "ADD_FOLLOWUP"],
  ["Add follow up for Rajesh Pillai WhatsApp at 10am", "ADD_FOLLOWUP"],
  ["Mark Raj's follow-up done", "COMPLETE_FOLLOWUP"],
  ["Move Raj's follow-up to tomorrow 4pm", "RESCHEDULE_FOLLOWUP"],
  ["Add a new property", "CREATE_PROPERTY_DRAFT"],
  ["Set LIV-0027 possession to Ready to move", "UPDATE_PROPERTY"],
  ["Change LIV-0027 asking price to 1.75 crore", "UPDATE_PROPERTY_PRICE"],
  ["Change LIV-0010 asking price to 1Cr", "UPDATE_PROPERTY_PRICE"],
  ["Add photos to LIV-0027", "ADD_PROPERTY_MEDIA"],
  ["add photos to liv 10", "ADD_PROPERTY_MEDIA"],
  ["Publish LIV-0010", "PUBLISH_PROPERTY"],
  ["Unpublish LIV-0027", "UNPUBLISH_PROPERTY"],
];

/** Messages that must stay the model's, because they are not commands. */
const SENTENCES = [
  "Raj called this morning, wants a villa under 90L",
  "what's the status of the Kakkanad villa",
  "can you check if Rajesh replied yet",
  "the client wants to see three places on Saturday",
  "Move Raj to Kochi",
  "hi",
];

function main() {
  let routed = 0;
  let wrong = 0;

  console.log("COMMAND ROUTING — every phrasing HELP advertises\n");
  console.log(
    "  " +
      "MESSAGE".padEnd(50) +
      "RESOLVES TO".padEnd(28) +
      "STILL NEEDS",
  );
  console.log("  " + "-".repeat(96));

  for (const [text, expected] of PHRASINGS) {
    const found = matchCommand(text);
    const intent = found?.intent ?? "(model decides)";
    const needs = found ? missingFields(found.intent, found.entities) : [];
    const ok = found?.intent === expected;
    if (found) routed += 1;
    if (found && !ok) wrong += 1;

    const flag = ok ? " " : found ? "!" : "~";
    console.log(
      `${flag} ` +
        text.padEnd(50) +
        intent.padEnd(28) +
        (needs.length ? needs.map((f) => t.missingField(f, intent)).join(" ") : "—"),
    );
  }

  console.log("\n  " + "-".repeat(96));
  console.log(`  ${routed}/${PHRASINGS.length} routed without a model, ${wrong} to the wrong command.`);

  console.log("\nSENTENCES — these must stay with the model\n");
  let leaked = 0;
  for (const text of SENTENCES) {
    const found = matchCommand(text);
    if (found) leaked += 1;
    console.log(`${found ? "!" : " "} ` + text.padEnd(50) + (found?.intent ?? "(model decides)"));
  }
  console.log(`\n  ${leaked} false match${leaked === 1 ? "" : "es"}.`);

  const advertised = Object.entries(COMMANDS).filter(([, spec]) => spec.help);
  const covered = new Set(PHRASINGS.map(([, intent]) => intent));
  const gaps = advertised.filter(([intent]) => !covered.has(intent as Intent));
  console.log(
    `\n  ${advertised.length} commands in HELP, ${advertised.length - gaps.length} covered here` +
      (gaps.length ? `, missing: ${gaps.map(([i]) => i).join(", ")}` : "."),
  );

  if (wrong || leaked || gaps.length) process.exitCode = 1;
}

main();
