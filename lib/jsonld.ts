// Serialise a JSON-LD object for embedding in <script type="application/ld+json">.
//
// JSON.stringify does not escape "<", so any string value containing the
// sequence "</script>" would close the tag early and the remainder would be
// parsed as HTML. < is a valid JSON escape for "<", so the payload stays
// byte-for-byte equivalent JSON while becoming inert inside a script element.
//
// This matters because property data now comes from Postgres and will be
// editable from the CRM — the values are no longer all author-controlled.
export function toJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
