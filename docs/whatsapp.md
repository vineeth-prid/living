# WhatsApp (OpenWA) integration

Two-way WhatsApp for the CRM: staff run commands conversationally, customer
messages become leads. Internal only — nothing on the public website changed.

The CRM does not depend on this. With `OPENWA_ENABLED` unset the whole
integration is inert and every other feature works exactly as before.

## Shape

```
WhatsApp → OpenWA → POST /api/integrations/openwa/webhook
                        │  verify HMAC, claim idempotency key, 200
                        ▼  (after the response is flushed)
                    inbound.ts            route by sender
                    ├── employee.ts       Ollama → intent → registry → handlers
                    └── customer.ts       lead or activity, never a command
                        ▼
                    service.ts → WhatsAppProvider → OpenWAProvider → OpenWA
```

`lib/integrations/whatsapp/openwa/` is the only place that knows OpenWA's wire
format. Lead, property and follow-up code never imports it.

## What it needs

**No new npm packages.** The whole integration is built on what was already
here plus Node built-ins — the Ollama client is one `fetch`, the CSV and HMAC
work is `node:crypto`. `npm ci` installs nothing new.

External services, in order of how badly it breaks without them:

| Service | Needed for | Without it |
|---|---|---|
| **PostgreSQL** | everything | already required by the CRM |
| **OpenWA** | sending and receiving | integration reports itself disabled; CRM unaffected |
| **Ollama** | interpreting employee messages | commands are refused with "I couldn't understand that request right now"; customer capture still works |
| **MinIO** | photos and documents | media commands fail cleanly; property records are untouched |

The app must be reachable from OpenWA at a public HTTPS URL — the webhook is
OpenWA calling Living, not the other way round.

## Deploying

Nothing here is destructive, and every step is reversible by unsetting
`OPENWA_ENABLED`.

### 1. Merge and install

```bash
git merge feature/whatsapp-crm
npm ci
```

### 2. Migrate

```bash
npm run db:migrate
```

Migration `0004` adds six `whatsapp_*` tables and five columns to `users`.
It drops nothing and rewrites nothing — existing rows are untouched.

### 3. Make sure the WhatsApp lead source exists

Customer enquiries are attributed to it, and `leads.source_key` is a foreign
key. `npm run db:seed` is safe to re-run (it skips leads whose mobile is
already present), but on a database that was never seeded it also inserts four
demo leads. To add only the row:

```sql
INSERT INTO lead_sources (key, label, sort_order, is_active)
VALUES ('whatsapp', 'WhatsApp', 40, true)
ON CONFLICT (key) DO NOTHING;
```

If it is missing, enquiries are still captured — they just arrive with no
source, and a warning is logged.

### 4. Pair the WhatsApp number on the VPS

In OpenWA's own dashboard: create a session, start it, scan the QR with the
dedicated Living number. Living never creates or starts a session; it reads the
one it is told about. Note the session UUID, and mint an API key with at least
the `operator` role.

Use a number that is not someone's personal WhatsApp. This is an unofficial
gateway and restriction is a real possibility.

### 5. Configure

Generate a webhook secret — `openssl rand -hex 32` — and fill in the
`OPENWA_*` block from `.env.example`. Set `OPENWA_ENABLED=true` last, then
restart. Nothing may carry a `NEXT_PUBLIC_` prefix: that is what keeps the key
and the secret out of the browser, and a check fails the build if a client
component ever reads one.

The integration only switches on when `OPENWA_ENABLED`, `OPENWA_BASE_URL`,
`OPENWA_API_KEY` and `OPENWA_SESSION_ID` are all present. Any one missing and
it stays off.

### 6. Point Ollama at a model

Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL`. Any instruction-following model that
honours `format: json` works; temperature is pinned to 0 because this is
parsing, not writing. Leave it unset to run the customer half only.

### 7. Wire the webhook

**Admin → Settings → Integrations → WhatsApp**, then **Test connection** and
**Configure webhook**. The second is idempotent — it reuses a registration
already pointing at the same URL rather than adding another, so re-running it
after a deploy will not double every message.

The health panel reports the four failures separately: unreachable, key
rejected, session not found, session found but not connected. They need four
different fixes.

### 8. Grant access, one person at a time

Same page, **Employee access** — or the WhatsApp card on any employee's own
page. Two switches, deliberately separate:

- **WhatsApp** — Living may message them (lead assignments, follow-up notices)
- **CRM commands** — they may drive the CRM from their phone

Being an employee grants neither. A number that merely appears in `users.mobile`
can do nothing until an admin turns it on here.

### 9. Prove it end to end

**Send a test message** from the admin page, then from an enabled phone send
`help`, then `show my follow-ups`. Then run the database-backed checks, which
skip silently without a `DATABASE_URL` and are the first thing that will
exercise the new tables:

```bash
npm run check:whatsapp:db
```

### Rolling back

Set `OPENWA_ENABLED=false` and restart. The webhook returns 503, outbound
sending reports itself disabled, and the CRM carries on exactly as before. The
tables can stay; they cost nothing when empty.

## Safety rules this implements

- The model never touches the database. It returns an intent and entities that
  are validated against a Zod schema, then checked against a command registry
  that decides permission and risk. An intent with no registry entry cannot run.
- Names are never treated as identifiers. `resolve.ts` returns *exactly one* or
  refuses; two leads called Raj produce a question, never a write.
- High-risk actions (publish, unpublish, price change, reassign) always ask
  first, whatever the model's confidence. Pending confirmations live in
  `whatsapp_command_executions` and expire.
- Customers and unknown numbers reach `customer.ts` only. There is no branch
  that can run a CRM command for them.
- `finalPrice`, `sellerContact` and `internalNotes` are not selected by any
  WhatsApp read path, so no formatting mistake can print them.
- Every interpreted message writes a `whatsapp_command_executions` row —
  executed, refused, or waiting — and CRM changes also write the normal
  `lead_activities` / `audit_logs` entries.

## Verified automatically

`npm run check:whatsapp` — 87 assertions covering signature verification
(valid, tampered, missing, wrong secret, no secret), malformed payloads, missing
idempotency keys, echo and group-chat suppression, phone normalisation across
every spelling plus foreign numbers, AI output validation (bad intent, bad
confidence, missing field, non-JSON, unbounded action lists), multi-action
messages (§19), every command in the brief having a registry entry (§17), the
registry's permission rules, timezone-correct follow-up times, and the health
probe degrading rather than throwing (§67), the per-employee scope narrowing
but never granting (§13), echo suppression across all three spellings of
`fromMe`, and media read from OpenWA's documented column names.

`npm run check:whatsapp:db` — 22 further assertions against a real database:
inactive and non-enabled employees refused, unknown numbers refused, an
employee unable to resolve another employee's lead, and the internal price
fields absent from every WhatsApp projection. Skips without DATABASE_URL.

## What the thread is about

`whatsapp_conversations.property_id` is the thread's current subject, and
`attachWhatsAppMedia` falls back to it when a photo arrives with no
reference. It is written in `record()` — the one funnel every command outcome
passes through — whenever a command's target is a property.

That covers draft creation, price changes, publishing and plain lookups, so a
photo sent straight after any of them attaches on its own. Before this it was
only ever written on the customer side, so an employee who had just created a
draft was asked for a reference that had been shown once, several messages
earlier.

Two related rules for wording:

- **A message that asks a question must not contain an example reference.**
  `LIV-0027` in the media prompt was typed back as the answer, resolved to
  nothing, and left the thread unanchored — where the classifier read a bare
  reference as `ADD_FOLLOWUP`. Describe the shape (`LIV-XXXX`) instead. A
  check asserts no question carries a `LIV-<digits>`.
- **A file with nothing to attach it to parks a question**, via
  `needsProperty` on the handler result, so the next message is still an
  answer to "which property?" rather than a fresh sentence for the
  classifier to guess at.

## Template intake

Multi-field commands ask once, with a form, instead of one question per
message.

The loop this replaces put every individual answer through the 25-intent
classifier, so a single typo ("Redeidential") derailed the whole sequence.
It also under-collected against `propertySchema`: it never asked for
`listingType`, `status` or `commercialKind`, and hardcoded all three
regardless of what was true.

The flow for a property:

1. "Add a new property" — Living asks the one question everything branches
   on: residential or commercial.
2. The matching form goes out, one line per field.
3. The employee fills it in and sends it back as one message.
4. Living parses it, validates through `propertySchema` — the same schema the
   web form uses — and creates the draft.

`lib/crm/whatsapp/intake.ts` holds the engine and the forms. Parsing is
label-anchored and **never calls the model**: that is what stops a typo in a
value being reinterpreted as a different intent. `employee.ts` routes a form
reply above `parseIntent` for the same reason.

What it tolerates: blank lines, lines returned with the hint still on them,
mistyped labels ("Bult-up area"), enum values spelled wrong, prose either
side, and a bare answer with no label at all on a one-field form. Values are
normalised deterministically — "85 lakh", "1.8 Cr", "90L", "1,85,00,000",
"12 cents" — so no model round trip is involved in reading them.

A value that cannot be read fails as one named field, and Living asks for
just that line. Required fields left blank are re-asked the same way: never a
full resend.

A message that already carries everything skips the form entirely, so
"Add lead Raj 9876543210" is still one message in, one lead out.

State lives on the parked `whatsapp_command_executions` row as `__intake`
(which form) and `__formSent` (so a re-ask can be partial), underscored like
the `batch` envelope a confirmation carries.

`CREATE_LEAD` uses the same mechanism. Anything with more than a couple of
required fields belongs here rather than in a question loop.

## Blank fields from the model

A model answering in `format: "json"` against a fixed shape fills in every
documented key. When it has no value for one, what comes back is `""` or
`null` — not an absent key. Zod's `.optional()` accepts absent-or-undefined
and nothing else, so `""` is a length violation and the whole response is
discarded, correct intent and all.

This cost every employee command a "question: Too small" failure until
`schema.ts` started normalising. It is a property of the shape, not of the
model: llama3.2:3b and qwen3:8b produced the identical `"question": ""` on the
same message, both having classified the intent correctly.

`dropBlanks` in `lib/ai/crm-intent/schema.ts` strips `""`, whitespace-only
strings and `null` before validation, at the object level rather than per
field — every optional field in that file has the same shape, and a field added
later would otherwise reintroduce it. The prompt also now states the convention
outright, so the schema is a guarantee rather than the only line of defence.

Normalising removes a spelling of "absent"; it does not loosen anything. An
unknown intent, an out-of-range confidence, an empty action list, more than
five actions and an over-long question are all still refused.

## Privacy-masked senders (@lid)

Some sessions mask every inbound sender as `210354630082686@lid` instead of a
phone number. This is a property of the session, not a per-user privacy setting
— on the staging session it was every message from every number.

The digits in front of `@lid` are a pseudo-id. They are not a phone number, but
they are fifteen digits, which is a legal E.164 length, so a naive parse
produces a plausible-looking fabrication. That fabrication is worse than a
failure: employee matching joins on the real number, so an admin-enabled phone
was silently routed down the anonymous-customer path,
`whatsapp_command_executions` stayed empty because no command ever got the
chance to run, and replies were addressed to a number that does not exist.

Handling, in three places:

- `lib/phone.ts` refuses `@lid` outright, alongside `@g.us` and `@broadcast`.
  Nothing anywhere can turn a mask into a number by accident.
- `openwa/webhook.ts` carries the mask forward as `senderLid` and leaves
  `fromPhone` null. It does **not** look the number up: that function runs
  before the webhook is acknowledged, and a gateway round trip on that path is
  what becomes a timeout and a redelivery.
- `openwa/lid.ts` does the lookup during routing, which runs after the
  response is flushed. Results are cached per process for six hours, since the
  same sender arrives on every message they send.

The lookup is `GET /api/sessions/:sessionId/contacts/:contactId`, and it takes
the `@lid` value as `contactId`. **The real number comes back in `id`** —
`"919035367324@c.us"` — **not in `number`**, which still holds the mask. Reading
`number` returns the same garbage the lookup exists to replace.

If a mask cannot be resolved, routing throws rather than falling back. The
route's catch writes the reason onto the `whatsapp_webhook_events` row, so an
unidentifiable sender is visible in the table instead of disappearing as a
skipped message. Query for it with:

```sql
select received_at, error from whatsapp_webhook_events
where status = 'failed' and error like '%masked sender%'
order by received_at desc;
```

If a payload states the number outright — `senderPhone`, `senderNumber`, or
`metadata.senderPhone` — that wins and no lookup happens.

## Still to verify against the live instance

- **Media payload field names.** OpenWA's database design documents the message
  columns — `waMessageId`, `chatId`, `from`, `to`, `body`, `type`, `direction`,
  `timestamp`, `metadata`, `mediaPath`, `mediaMimetype` — and states that media
  and engine details live in the `metadata` JSON rather than in columns of their
  own. `openwa/webhook.ts` reads all of those plus the nested spellings, and
  degrades to null for anything else. Send one photo and check the `payload`
  column of `whatsapp_webhook_events` to confirm which of them the webhook
  actually carries, then narrow `toMedia()`.
- **Media URL shape.** `mediaPath` is a storage key, not necessarily a URL. A
  relative one is resolved against `OPENWA_BASE_URL`; if the gateway serves
  media from a dedicated endpoint instead, point `resolveMediaPath()` at it.
- **Signature body.** OpenWA signs `JSON.stringify(payload)`; Living verifies
  against the raw request bytes. These are the same thing unless a proxy
  re-encodes the body in transit. If verification fails on a genuine delivery,
  check for a proxy before touching the comparison.

## Not built yet

Only one thing, and it needs the VPS rather than more code:

- **§62 end-to-end.** All five flows need a live gateway, a live model and a
  live database. Manual pass: send *help*, then *show my follow-ups*, then
  *add follow-up for <lead> tomorrow at 10*, then *create a residential land
  property in OMR, 12 cents, asking 1.8 crore*, then *add photos to LIV-xxxx*
  followed by the images, then *publish LIV-xxxx* and confirm.

The §61 database cases now run as `npm run check:whatsapp:db` — it skips with a
message when DATABASE_URL is unset and executes against Postgres when it is not.

## Health

**Admin → Settings → Integrations** shows every service Living talks to and
whether it is answering. `GET /api/health` returns the same, admin only — a
public one is a free map of which dependencies are down.

Unconfigured reports OK. This application runs deliberately without SMTP,
object storage, an interpreter or WhatsApp; "down" means configured and not
answering.

## Retention

`whatsapp_webhook_events.payload` holds the raw delivery for debugging. Prune it
on a schedule once the integration is stable; there is no scheduler in this app,
so this is a cron on the VPS:

```sql
delete from whatsapp_webhook_events where received_at < now() - interval '30 days';
```

## Ban risk

OpenWA is an unofficial gateway; account restriction cannot be ruled out. Use a
dedicated number, keep `WHATSAPP_MAX_PER_MINUTE` low, and keep email working as
the fallback — `lib/notify.ts` is untouched and still the primary notification
channel. There is no bulk sending in this integration and none should be added.
