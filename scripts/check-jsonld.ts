// Guards the JSON-LD script-injection escaping. Run: npm run check:jsonld
import assert from "node:assert/strict";
import { toJsonLd } from "../lib/jsonld";

// The attack: a CRM-editable field closes the script tag and injects markup.
const hostile = {
  name: "The Arbour</script><img src=x onerror=alert(1)>",
  description: "a < b and 1<2",
};

const out = toJsonLd(hostile);

assert.ok(!out.includes("</script>"), "must not emit a literal closing script tag");
assert.ok(!out.includes("<"), "must not emit any raw < character");
assert.ok(out.includes("\\u003c"), "< must be escaped as \\u003c");

// Escaping must be lossless — the browser parses < straight back to "<".
assert.deepEqual(JSON.parse(out), hostile, "round-trip must preserve the data");

// Ordinary payloads are untouched apart from the escape.
assert.equal(toJsonLd({ a: 1 }), '{"a":1}');

console.log("check-jsonld: 5 assertions passed");
