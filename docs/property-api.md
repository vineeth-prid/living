# Living Property API

**Status: proposed. None of these endpoints exist yet.**

This is the contract to build and to build against, written so both sides can
agree on it before either writes code. Nothing here is live; `/api/public/...`
returns 404 today. Where a decision is still open it says so rather than
inventing an answer.

Audience: the developer integrating Living's published listings into another
system, and whoever implements this end.

---

## 1. What this exposes

Listings that are **published on livingbyitr.com**, and nothing else.

A property reaches this API only when both of these are true, which is the same
rule the website itself uses:

- `workflowStatus = "published"`
- `isPublic = true`
- not archived (`deletedAt` is null)

Unpublishing a listing removes it from the API immediately. Drafts, reserved,
sold and archived listings are never returned — not as hidden records, not with
a flag. They are simply not there.

### What is deliberately never exposed

These fields exist in Living's database and are **not** available through this
API at any access level. They are excluded by construction — the query does not
select them — and a test (`npm run check:security`) fails the build if any of
them reaches a public projection.

| Field | Why |
| --- | --- |
| `finalPrice` | The negotiated price. Commercially sensitive. |
| `sellerName`, `sellerContact`, `sellerWhatsapp`, `sellerAltContact`, `sellerEmail` | Owner's personal contact details. |
| `sellerWhatsappOptIn` | Consent flag, meaningless outside Living. |
| `internalNotes` | Staff notes, written on the assumption nobody else reads them. |
| `addressLine`, `surveyNumber`, `boundaryNotes` | Exact location and title detail. Public only at Living's discretion, per listing. |
| `createdById`, `updatedById` | Staff identities. |
| `workflowStatus`, `deletedAt` | Internal lifecycle. |
| Lead / enquiry data | Not part of this API at all. |

Please do not ask for these to be "just added" — the exclusion is enforced by a
test, and lifting it is a deliberate decision with a privacy consequence, not a
config change.

---

## 2. Authentication

**Decision needed.** Recommended: a bearer token issued to each consuming
system.

```http
GET /api/public/properties HTTP/1.1
Host: livingbyitr.com
Authorization: Bearer <api-key>
```

- One key per consuming system, so a key can be revoked without affecting
  anyone else.
- Keys are issued by Living. There is no self-service registration.
- Over HTTPS only. A key sent over plain HTTP is treated as compromised.

**Alternative, if the data is to be genuinely open:** no auth at all. Everything
this API returns is already visible on the public website, so an unauthenticated
API leaks nothing new. The argument for a key is not secrecy — it is rate
limiting, revocation, and knowing who is calling. Living to decide.

---

## 3. List properties

```
GET /api/public/properties
```

### Query parameters

All optional. Unknown parameters are ignored rather than rejected, so adding one
later cannot break an existing integration.

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | integer ≥ 1 | `1` | Out of range clamps to the last page. Junk (`abc`, `-4`, `0`) resolves to page 1 rather than erroring. |
| `perPage` | integer 1–100 | `24` | Above 100 is capped, not rejected. |
| `city` | string | — | Case-insensitive exact match. `?city=Ernakulam` |
| `locality` | string | — | Case-insensitive exact match. |
| `q` | string | — | Free text across name, locality, city and summary. |
| `kind` | `residential` \| `commercial` | — | |
| `category` | `land` \| `building` | — | Derived, see §6. |
| `status` | `Ready to move` \| `Under construction` \| `New launch` | — | Possession label, URL-encoded. |
| `minPrice` | integer (rupees) | — | Inclusive. `?minPrice=5000000` |
| `maxPrice` | integer (rupees) | — | Inclusive. |
| `minBeds` | integer | — | Inclusive. |
| `minBaths` | integer | — | Inclusive. |
| `updatedSince` | ISO-8601 timestamp | — | **For incremental sync — see §7.** |
| `sort` | `order` \| `price` \| `-price` \| `updated` \| `-updated` \| `name` | `order` | `order` is Living's own curation order. A `-` prefix is descending. |

Filters combine with AND. Repeating a parameter uses the first value.

### Response

```json
{
  "data": [ /* array of Property, see §5 */ ],
  "meta": {
    "page": 1,
    "perPage": 24,
    "total": 137,
    "totalPages": 6,
    "hasMore": true
  }
}
```

`total` is the count after filters, not the whole catalogue.

### Example

```
GET /api/public/properties?city=Ernakulam&category=land&minPrice=2500000&sort=-updated&perPage=50
```

---

## 4. Property detail

```
GET /api/public/properties/{id}
```

`{id}` is the property's `id` — a URL-safe slug such as
`the-arbour-kakkanad`, the same segment livingbyitr.com uses at
`/homes/the-arbour-kakkanad`.

`reference` (`LIV-0010`) is **also** accepted, because it is what staff quote
and what the WhatsApp CRM uses. Both resolve to the same record.

### Response

```json
{ "data": { /* one Property, see §5 */ } }
```

`404` if the id is unknown **or** the listing is not currently published. The
two are deliberately indistinguishable: telling a caller that an unpublished
listing exists is itself a disclosure.

---

## 5. The Property object

All 34 fields, exactly as the website receives them.

### Identity

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable slug. Also the public URL segment. |
| `reference` | string \| null | `LIV-0010`. Human-quotable. Null on older seeded rows. |
| `name` | string | Listing title. |
| `updatedAt` | ISO-8601 string | Last change. Drives `updatedSince`. |
| `sortOrder` | integer | Living's curation order; lower is earlier. |

### Location

| Field | Type | Notes |
| --- | --- | --- |
| `city` | string | e.g. `Ernakulam` |
| `locality` | string | e.g. `Kakkanad` |

Street address, survey number and boundary notes are **not** included (§1).

### Classification

| Field | Type | Notes |
| --- | --- | --- |
| `type` | string | Free text as written by staff: `"3 & 4 BHK residences"`. Display only — do not parse. |
| `kind` | `residential` \| `commercial` | |
| `commercialKind` | string \| null | `office`, `retail`, `warehouse`, `land`, `building`, `other`. Only meaningful when `kind` is `commercial`. |
| `hasBuilding` | boolean | `false` means a plot with no structure. See §6. |
| `status` | string | Possession: `Ready to move`, `Under construction`, `New launch`. |

### Price

| Field | Type | Notes |
| --- | --- | --- |
| `priceValue` | integer | **Rupees, whole.** `18500000` = ₹1.85 Cr. The number to sort and filter on. |
| `priceLabel` | string | Pre-rendered display string. May be `"On request"`. Prefer formatting `priceValue` yourself — see §8. |

`priceValue` is the **public asking price**. The negotiated `finalPrice` is never
exposed.

### Land attributes

Present for plots; null or absent for most apartments.

| Field | Type | Notes |
| --- | --- | --- |
| `landArea` | number \| null | Numeric amount only. |
| `landAreaUnit` | `cent` \| `acre` \| `sqft` \| `sqm` \| null | **Always read with `landArea`.** An area without its unit is meaningless. |
| `roadAccess` | string \| null | Free text: `"20 ft tar road"`. |
| `facing` | string \| null | Free text: `"East"`. |

### Building attributes

| Field | Type | Notes |
| --- | --- | --- |
| `builtUpArea` | number \| null | Numeric amount only. |
| `builtUpAreaUnit` | `cent` \| `acre` \| `sqft` \| `sqm` \| null | Read with `builtUpArea`. |
| `area` | string | Legacy pre-rendered string, e.g. `"1,840 sqft"`. Older rows have this and no `builtUpArea`. Fall back to it. |
| `beds` | integer | `0` means "not applicable", not "unknown". |
| `baths` | integer | As above. |
| `units` | integer \| null | Flats or shops in a building — **not** bedrooms. |
| `balconies` | integer \| null | |
| `propertyAge` | string \| null | Free text: `"5 years"`. |

### Content

| Field | Type | Notes |
| --- | --- | --- |
| `summary` | string | One or two sentences. Card copy. |
| `description` | string \| null | Long form. May contain newlines. |
| `amenities` | string[] | Free text, e.g. `["Sky lounge", "EV charging"]`. |
| `details` | `{label, value}[]` | Arbitrary spec rows staff typed. Display as given; the labels are not a fixed vocabulary. |
| `gallery` | string[] | Image URLs. **See §9 — this needs a decision.** |
| `instagramUrl` | string \| null | A reel or post for the listing. |
| `seoTitle` | string \| null | Living's own SEO text. |
| `seoDescription` | string \| null | As above. Both are for Living's pages; you probably want your own. |

### Example

```json
{
  "data": {
    "id": "the-arbour-kakkanad",
    "reference": "LIV-0001",
    "name": "The Arbour",
    "city": "Ernakulam",
    "locality": "Kakkanad",
    "type": "3 & 4 BHK residences",
    "kind": "residential",
    "commercialKind": null,
    "hasBuilding": true,
    "status": "Ready to move",
    "priceValue": 18500000,
    "priceLabel": "₹1.85 Cr",
    "landArea": null,
    "landAreaUnit": null,
    "roadAccess": null,
    "facing": null,
    "builtUpArea": null,
    "builtUpAreaUnit": null,
    "area": "1,840 sqft",
    "beds": 3,
    "baths": 3,
    "units": null,
    "balconies": null,
    "propertyAge": null,
    "summary": "An elevated home in Kakkanad, wrapped in daylight and quiet greenery.",
    "description": null,
    "amenities": ["Sky lounge", "Infinity edge pool", "EV charging"],
    "details": [
      { "label": "Configuration", "value": "3 & 4 BHK" },
      { "label": "Facing", "value": "East / North-east" }
    ],
    "gallery": [
      "https://media.livingbyitr.com/living-images-prod/images/hero-kochi-home.jpg"
    ],
    "instagramUrl": null,
    "seoTitle": null,
    "seoDescription": null,
    "sortOrder": 0,
    "updatedAt": "2026-09-11T08:30:00.000Z"
  }
}
```

---

## 6. Land or building — how to tell

Do **not** parse the `type` string. It is free text an agent typed, and
`"3 & 4 BHK residences"` is as likely as `"Plot"`.

Living's own rule, in order:

1. `commercialKind === "land"` → **land**
2. `hasBuilding === false` → **land**
3. `hasBuilding === true` → **building**
4. otherwise → **unknown**; show only the fields that have values

This is implemented in `lib/property-attributes.ts` as `getPropertyCategory()`
and is what the website uses, so following it keeps both systems consistent.

**Render only what is populated.** A field that is null, absent, empty or
whitespace should produce no row at all — not a dash, not "N/A". Note that `0`
is a real value for counts and should be treated as "not applicable" rather than
missing.

---

## 7. Keeping in sync

Two options. They are not exclusive.

### Polling (simple, recommended to start)

Call the list endpoint with `updatedSince` set to the timestamp of your last
successful sync:

```
GET /api/public/properties?updatedSince=2026-09-11T08:30:00Z&perPage=100&sort=updated
```

Store the highest `updatedAt` you received and use it next time. Every 5–15
minutes is ample; listings do not change often.

**The catch:** this tells you what changed, but not what was *removed*.
A listing that is unpublished simply stops appearing, and `updatedSince` will
never mention it. Either do a full reconcile periodically (fetch all ids, delete
anything you hold that is no longer listed), or use webhooks below.

### Webhooks (push on publish)

This matches how the requirement was first described — "when I publish here it
should be pushed to the other system". **Not built; needs a decision.**

Living POSTs to a URL the consuming system provides:

```json
{
  "event": "property.published",
  "timestamp": "2026-09-11T08:30:00.000Z",
  "idempotencyKey": "evt_01J9…",
  "data": { /* the full Property object */ }
}
```

Events: `property.published`, `property.updated`, `property.unpublished`.
For `property.unpublished`, `data` carries only `{ id, reference }` — the
listing is no longer public, so its content is no longer sent.

**Signature.** Living already signs its inbound webhooks this way, so the same
scheme is proposed here rather than a second one:

```
X-Living-Signature: sha256=<hex HMAC-SHA256 of the raw request body>
```

Verify against the shared secret using a **timing-safe** comparison, and verify
**before parsing** the body. Reject anything that does not match.

**Delivery.** Retried with backoff on any non-2xx. Respond `200` as soon as you
have stored the event; do the work afterwards. Retries mean the same event can
arrive twice — deduplicate on `idempotencyKey`.

---

## 8. Formatting prices the same way

Living displays Indian short form, and matching it avoids the two systems
quoting visibly different numbers for the same listing:

| `priceValue` | Displayed |
| --- | --- |
| `15000000` | ₹1.5 Cr |
| `2600000` | ₹26 L |
| `12500000` | ₹1.25 Cr |
| `20000000` | ₹2 Cr |
| `7500000` | ₹75 L |

Rules: ≥ 1,00,00,000 → crore; ≥ 1,00,000 → lakh; below that, Indian digit
grouping. At most two decimals, trailing zeros trimmed. Zero, null and negative
render as nothing at all — never "₹0".

Reference implementation: `formatIndianPropertyPrice()` in `lib/money.ts`.

### Per-cent rate, for land

Living shows plots as `₹1.5 Cr` with `₹12.5 L / Cent` beneath. If you want the
same:

```
perCentRate = priceValue / landAreaInCent
```

Converting to cent: `cent × 1`, `acre × 100`, `sqft ÷ 435.6`, `sqm ÷ 40.4685642`.

**Show nothing** if the property is not land, if `landArea` or `landAreaUnit` is
missing, or if either is zero. Never render `₹0 / Cent`, `₹NaN` or
`₹undefined`.

---

## 9. Images — open question

**This needs deciding before the API is built.**

Today `gallery` can contain two different shapes:

1. `https://media.livingbyitr.com/living-images-prod/images/foo.jpg` — absolute,
   fine for anyone.
2. `/media/<key>` — **relative**, and only resolvable against livingbyitr.com.

Shape 2 is what admin-uploaded photos use. It is a same-origin proxy that reads
from private object storage with the server's credentials, and it is anonymous
for images flagged public — so the bytes are reachable, but only if the path is
made absolute.

**Recommendation:** the API should return every `gallery` entry as an absolute
`https://` URL, normalising shape 2 on the way out. A consuming system cannot be
expected to know to prefix a host.

Also to decide:
- **Hotlink or copy?** Hotlinking means Living's image changes propagate for
  free, and Living's downtime becomes yours. Copying inverts both.
- **Sizes.** Only originals exist today. If the other system wants thumbnails,
  say so now — Living already runs an image optimizer that could expose them.

---

## 10. Errors

Conventional status codes with a JSON body:

```json
{ "error": { "code": "not_found", "message": "No published property with that id." } }
```

| Status | When |
| --- | --- |
| `200` | Fine. An empty `data` array is still a `200`. |
| `400` | A parameter was malformed in a way that could not be safely ignored. |
| `401` | Missing or invalid API key. |
| `404` | Unknown id, or the listing is not currently published. |
| `429` | Rate limited. Honour `Retry-After`. |
| `5xx` | Living's problem. Retry with backoff. |

A filter that matches nothing is **not** an error — it is `200` with
`"data": []`.

---

## 11. Notes for whoever implements this

- **Reuse the existing projection.** `getProperties()` in `lib/properties.ts`
  already selects the exact public column allowlist, and `check-security.ts`
  asserts no internal column has crept in. Build the API on that, not on a fresh
  query — a second hand-written column list is how the two drift and something
  private leaks.
- **Pagination already exists.** `lib/pagination.ts` has the clamping semantics
  described in §3, with tests. Reuse rather than reimplement.
- **Filtering belongs in SQL.** The current `getProperties()` loads everything
  and the page slices it, which is fine for a few dozen listings and wrong for
  an API with `perPage=100`. Push filters and pagination into the query.
- **Cache.** These responses change rarely. `Cache-Control: public, max-age=300`
  on the list, longer on detail, is reasonable and costs nothing.
- **Rate limit per key**, so one consumer cannot affect another.

---

## 12. Other documentation

Also in this repository, if useful to share:

| Document | Covers |
| --- | --- |
| `docs/admin-crm.md` | The admin panel: properties, leads, the publish workflow and what each state means. Useful background on where these listings come from. |
| `docs/whatsapp.md` | The WhatsApp CRM — commands, model configuration, security model. Not relevant to this integration. |
| `AGENTS.md` | Repository conventions. |

`npm run check:security` is the test that enforces §1, and is worth pointing at
if anyone asks how the private/public split is guaranteed rather than intended.

---

## 13. Open questions

To settle before implementation:

1. **Auth**: API key, or open (§2)?
2. **Push or pull**: webhooks, polling, or both (§7)?
3. **Images**: absolute URLs — confirmed? Hotlink or copy? Thumbnails needed (§9)?
4. **Volume**: how many listings, and how often does the other system sync?
   Decides whether pagination defaults and rate limits are right.
5. **Reference or id**: which does the other system want as its primary key? Both
   are stable; `reference` is nicer for humans, `id` is guaranteed non-null.
6. **Historic data**: does the other system need listings that were published
   and later withdrawn, or only what is live now?
