# Broadcasts, the inbox, and customer auto-replies

Three things built on top of the WhatsApp integration described in
[whatsapp.md](./whatsapp.md):

1. **Broadcasts** — one message with one attachment, sent to a chosen set of
   leads, at the gateway's own pace.
2. **The inbox** — every WhatsApp conversation in one place, with a reply box.
3. **Auto-replies** — the local model answering a customer's question from
   Living's own published listings, when it can.

None of it changes anything on the public website, and the CRM does not depend
on any of it. With `OPENWA_ENABLED` unset there is nothing to send with; with
`WHATSAPP_AI_REPLIES` unset the customer path behaves exactly as it did before.

> **A note on what changed.** `whatsapp.md` used to end with "there is no bulk
> sending in this integration and none should be added." That was the right call
> for a CRM command channel and it is no longer the requirement. What makes this
> acceptable rather than a spam cannon is in the data model and the screen
> order, not in a warning comment — see **Why this is not a spam cannon** below.

---

## Where it lives

| Page | Who | What |
| --- | --- | --- |
| `/admin/messaging` | admin | Compose a broadcast, see past ones, the queue, the opt-out list |
| `/admin/messaging/[id]` | admin | Review the recipient list, send, then the per-recipient report |
| `/admin/messaging/inbox` | any staff | Every conversation, filtered by "needs a reply" |
| `/admin/messaging/inbox/[id]` | any staff | One thread, and a reply box |

Broadcasting is admin-only. The inbox is not — answering a customer is the job,
and an employee who cannot see the question cannot answer it. The admin-only
switches on a thread (silence, opt out) are hidden from employees by the page
and re-checked in the action.

## Shape

```
Composer  ──► createBroadcastAction ──► whatsapp_broadcasts
   │                                    whatsapp_broadcast_recipients  (the queue)
   │                                          │
   │                                          │  queued / sending / sent / failed / skipped
   ▼                                          ▼
Report page ──► sendBroadcastAction ──► drainBroadcasts()
                                              │
                   also driven by: the inbound webhook (every delivery)
                                   the "Send next batch" button
                                              ▼
                               service.ts sendMedia / sendText
                                              ▼
                                  OpenWAProvider → OpenWA
```

`whatsapp_broadcast_recipients` **is** the queue. There is no broker and no
scheduler, for the same reason `retryFailedOutbound` has neither: the gateway
allows twenty messages a minute, so a 500-person broadcast is nearly half an
hour of wall clock, and nothing in a web request can hold that open. Each drain
pass sends what it can and leaves the rest queued exactly where it was.

A broadcast therefore survives a deploy, a restart and a gateway outage. It
resumes from the row it stopped at.

## Why this is not a spam cannon

Seven things, and none of them is a warning in a comment.

1. **Two actions, not one.** Creating a broadcast does not send it. The operator
   lands on a report page carrying the real recipient list and has to send from
   there — so the last thing before several hundred messages is a screen showing
   exactly who they go to.
2. **A count before the button.** The Send button in the composer stays locked
   until the audience has actually been counted, and any change to the filter
   clears the count. The count is the only thing that makes a filter mistake
   visible.
3. **A typed confirmation.** The send button wants the recipient number typed
   in. A dialog gets clicked through on reflex; retyping the number means having
   read it.
4. **The list is materialised, never re-derived.** Recipients become rows when
   the broadcast is created. A filter re-run an hour later matches a different
   set of leads, so re-deriving it would mean a paused-and-resumed broadcast
   silently messaging people who were never in the approved audience.
5. **Opt-outs are structural.** `whatsapp_contacts.marketing_opt_out_at`
   excludes someone from every audience, in one query in
   `lib/crm/whatsapp/audience.ts`. The UI cannot forget to apply it because the
   UI does not apply it.
6. **One number, one message.** A unique index on
   `(broadcast_id, phone_number)` means a lead listed twice, or two leads
   sharing a mobile, is one recipient. This is the case that actually reads as
   spam to a person.
7. **A hard ceiling.** `WHATSAPP_MAX_AUDIENCE` (2,000) is refused rather than
   truncated, so a mis-set filter fails loudly instead of quietly starting.

Everything excluded is still written as a `skipped` recipient row with its
reason, so the report adds up.

**Cancelling is terminal and cascades.** Cancelling a broadcast moves its
`queued` and `sending` recipient rows to `skipped` in the same transaction, and
`requeueFailed` refuses to touch a cancelled broadcast. Without both halves,
"cancel, then retry the failures" put the broadcast back to `sending` and
resumed the entire abandoned queue. Pausing deliberately does **not** cascade —
a paused broadcast resumes with its queue intact, and that difference is the
whole reason there are two buttons.

**Retries are capped** at `WHATSAPP_BROADCAST_MAX_ATTEMPTS` (3) in the automatic
loop, not only in the manual retry button. A recipient that exhausts its
attempts is moved to `failed` with "gave up after 3 attempts" on the row, so the
broadcast can complete instead of sitting at `sending` with work that will never
succeed. The rate-limit check happens *before* a recipient is claimed, because
claiming increments the attempt counter — discovering a busy minute afterwards
spent a retry on someone nothing had tried to message. "Sent 391 of 391" when 21 people were dropped on
the way in is a report that hides its own behaviour.

## Opting out

A customer replying **STOP** (also `unsubscribe`, `opt out`, `remove me`, `dnd`,
`do not disturb`, `no more messages`, optionally prefixed with `please`) is
opted out of broadcasts immediately, before the message is even filed against a
lead — that request must not be queued behind a model call that might fail.

It silences **offers, not the conversation.** They can still ask a question
tomorrow and get an answer, and the confirmation says so. "You have been
unsubscribed" reads as "we will not reply to you again", and a lead who stops
writing in is a lost one.

The match is anchored to the whole message. `"don't stop looking for a 3BHK"`
and `"stop by the office tomorrow?"` do **not** opt anyone out — a customer
silenced by mistake is one nobody finds out about until the deal is gone. The
cost of that choice is that `"please stop sending me these offers"` reaches a
human instead; the thread page has a button for it.

This is separate from `whatsapp_contacts.is_allowed`, which is the nuisance
switch and stops Living acting on anything from that number at all. Two
different questions, two columns — one column answering both would make every
broadcast a choice between messaging someone who asked to be left alone and
ignoring a customer who did not.

## The media path

The attachment goes to MinIO through the same `uploadObject` / `validateUpload`
the property uploader uses — one rulebook about what may be stored, so a file
refused on a listing is refused here too. Images, `video/mp4`, `video/webm` and
PDF.

It is sent to recipients as a **URL**, never base64: the gateway fetches it once
per recipient, where base64 would push the whole file through this process and
across the wire again for every person on the list.

That URL is served by `app/media/[...key]`, which serves a broadcast attachment
**anonymously** — the fetch is made by OpenWA on the VPS, not by a signed-in
browser, so a session cookie is not available and a relative path would resolve
against the gateway. It is narrow: the key has to match a `media_key` Living
itself wrote on a broadcast row, so this cannot be used to read an expense
receipt or an internal document. The random suffix `lib/storage.ts` puts in
every key keeps the URL unguessable, and the file is one the operator chose to
send to hundreds of people in any case.

`APP_BASE_URL` must be right for the environment, or the gateway fetches a URL
on the wrong host. This is the single most likely thing to be wrong on a fresh
staging deploy.

### The endpoint per kind

**OpenWA has no generic `send-media` route.** Media goes to a type-specific one,
and `MEDIA_ENDPOINTS` in `lib/integrations/whatsapp/openwa/client.ts` is the only
place those names live:

| Kind | Route | Extra body fields |
| --- | --- | --- |
| `image` | `/messages/send-image` | — |
| `video` | `/messages/send-video` | — |
| `document` | `/messages/send-document` | `filename`, `mimetype` |
| `audio` | not implemented | would need `mimetype` + `ptt` |

The kind comes from `whatsapp_broadcasts.media_kind`, is carried on
`SendMediaInput.kind`, and the MIME type for documents comes from
`media_mime_type` on the same row. A missing kind defaults to `image` with a
warning — matching the `?? "image"` the broadcast engine already applies, since
an unlabelled attachment is overwhelmingly a photo.

Audio is refused rather than guessed: nothing upstream produces the `ptt` flag,
and the composer cannot create an audio file. A document with no content type is
refused too — WhatsApp renders one as an unopenable blob, which is worse than a
send that plainly failed and says why.

If the gateway is upgraded and a path changes, edit that map. The error carries
the path it tried, so a mismatch shows up in the broadcast report rather than
needing anyone to read the file.

> **This was a bug, fixed after the first live test.** The client posted
> everything to `/messages/send-media`, so every media broadcast came back
> `Cannot POST /api/sessions/…/messages/send-media` before the gateway looked at
> it. `kind` was known by the caller, needed by the provider, and declared by
> neither — so TypeScript never saw it being dropped. `check:broadcast` now
> asserts the URL each kind posts to, against a stubbed fetch.

### If an image is accepted but never arrives

A send can come back `201` with a real message id, appear in the account's own
chat history as `type: "image", fromMe: true`, and still never reach the
recipient's phone. **A success response does not mean delivery.** OpenWA answers
as soon as it has accepted the request and built a local message object; the
actual upload to WhatsApp's media servers happens afterwards, inside the browser
page it drives, and a failure there never becomes an HTTP error.

With `WHATSAPP_MEDIA_TRANSPORT=url` (the default) there is one more step in that
blind spot: the gateway has to fetch the file from `APP_BASE_URL` over HTTPS
first. If its container is missing `ca-certificates` — which has happened twice,
because the OpenWA Dockerfile does not install them and every
`--force-recreate` wipes a live patch — that fetch fails silently and the symptom
is exactly this: clean success, no message.

**Check `APP_BASE_URL` first.** It was unset on staging, and `appBaseUrl()`
falls back to the production URL when it is — so every broadcast from the
staging panel told the gateway to fetch its image from `livingbyitr.com`.
Nothing was misconfigured on either machine and nothing said anything, because
the fallback is correct in production. The messaging page now prints the origin
the gateway will fetch from, under the queue, so a wrong one is visible before
anyone sends.

Then try:

```dotenv
WHATSAPP_MEDIA_TRANSPORT=base64
```

That sends the bytes with the request and removes the gateway's fetch from the
picture entirely. If the image arrives with `base64` and not with `url`, the
problem is the gateway reaching us, not the gateway uploading — and the fix is
baking `ca-certificates` into its Dockerfile rather than anything in this
repository. If it fails both ways, the problem is downstream of us: check the
session reached a genuine `ready` state rather than the
"WhatsApp Web ready event was missed; reconciling" fallback, and watch
`docker logs openwa-api` live during a send rather than reading it afterwards.

Files above `WHATSAPP_MAX_INLINE_BYTES` (8 MB) use the URL regardless, with a
line in the log — base64 inflates by a third and travels once per recipient.

**Inline sends must carry a `mimetype`.** OpenWA rejects base64 without one
("mimetype is required when using base64 data") for every kind, not just
documents — with a URL it reads the type from its own fetch, and with inline
bytes there is nothing to read it from. It comes from `media_mime_type`, falling
back to the filename extension; if neither yields one the send is refused here
rather than as a bare 400, so the report says which broadcast and why.

### Timeouts

`OPENWA_TIMEOUT_MS` (10s) bounds status checks and text sends and wants to stay
short, so a dead gateway is noticed quickly. `OPENWA_MEDIA_TIMEOUT_MS` (60s) is
separate, because a media send is the one call that moves megabytes.

That split is **not** a fix for an indefinite hang. A `url` send that times out
at 10s and then again at the full 30s, with the gateway container idle, is not
slow — it is stuck, and the leading suspect is the missing `ca-certificates`
below making an outbound HTTPS fetch hang instead of failing fast. Raising a
clock does not fix a hang; it just takes longer to say so.

### When a media send fails

The recipient row goes to `failed` with the gateway's message, and the report
shows it. There is deliberately **no text-only fallback**: sending the caption
without the photo delivers a different message than the one that was approved,
to people who would have no idea anything was missing. A broadcast that visibly
failed and can be retried is better than one that quietly half-worked.

Note the corollary — a broadcast created with **no attachment at all** takes the
`sendText` path and goes out as plain text. That is correct behaviour, and it is
also the likeliest explanation for a plain-text broadcast arriving when a media
one was intended: check `media_key` on the row before suspecting the media path.

## Scheduling

A broadcast can be armed for a date and time instead of sent immediately. The
composer has a **Schedule it** tab (native date and time inputs); the review page
then offers **Schedule** alongside **Send now**, behind the same typed-count
confirmation — arming for Sunday and sending now carry exactly the same risk of
being the wrong 400 people, so they get the same gate.

Times are **Kochi wall clock**, converted by `lib/time.ts` — the same conversion
follow-ups use. `new Date("2026-10-05T10:00")` is the *server's* 10am, which on a
UTC host is 3:30pm here: a breakfast offer after dinner, and invisible to anyone
testing on an Indian laptop.

An armed broadcast can be rescheduled, disarmed back to a draft (list intact),
sent immediately, or cancelled. `whatsapp_broadcasts.status = 'scheduled'` is the
only status the release query picks up, so an abandoned draft with a date left in
the field can never go out on its own.

### "The cron shouldn't fail"

It can, so this is built on the assumption that it will. Five things:

**1. The tick is catch-up, not incremental.** `releaseDueBroadcasts()` asks
*which broadcasts are due*, never *which became due since the last tick*. One
successful run after an outage of any length releases everything waiting. A
missed tick costs a delay, never a broadcast.

**2. Concurrent triggers cannot double-send.** Releasing is a conditional
`UPDATE … WHERE status = 'scheduled'`, and the condition *is* the lock: of two
callers arriving together, exactly one sees the row as `scheduled` and gets it
back from `RETURNING`. Claiming recipients is `FOR UPDATE SKIP LOCKED`. No
advisory locks, no leader election.

**3. The cron is the primary trigger, not the only one.** Four things tick:

| Trigger | When |
| --- | --- |
| `/api/cron/whatsapp` | the VPS crontab — the intended driver |
| The inbound webhook | every WhatsApp message that arrives |
| Loading `/admin/messaging` | one cheap conditional UPDATE per page view |
| **Send next batch** / **Run the scheduler now** | by hand |

So a business with any WhatsApp traffic at all keeps its own scheduler alive
without knowing it, and an admin who notices something overdue fixes it by
looking at the page.

**4. A dead scheduler is visible.** Every tick upserts `job_runs`, and the
panel's **Queue and scheduler** card says how long ago the last run was. Past
`WHATSAPP_HEARTBEAT_STALE_MINUTES` (30) it turns into a red box naming the
problem. A scheduled broadcast silently never going out is the worst failure
this panel can have, and the difference between finding out there and finding
out from a customer is that box. **Run the scheduler now** is identical to what
the cron calls, so it also proves whether sending works at all.

**5. Too late is not sent.** Past `WHATSAPP_SCHEDULE_GRACE_MINUTES` (180) a due
broadcast is moved to `paused` instead of released, and the report page says it
missed its window. Firing a "this weekend only" offer on Monday morning is worse
than not firing it. Within the window it still goes — an ordinary reboot does
not cost a broadcast.

### The cron entry

```crontab
*/5 * * * * curl -fsS -m 120 -H "X-Cron-Key: $CRON_SECRET" \
  https://livingbyitr.com/api/cron/whatsapp >/dev/null
```

Five minutes is a suggestion; nothing depends on it. A longer interval only makes
broadcasts start later. The route accepts `GET` and `POST`, and the key as either
`X-Cron-Key` or `Authorization: Bearer`, compared in constant time. Without
`CRON_SECRET` set (32+ chars) it refuses everything — fail closed.

It answers **200 even when the work inside failed**, with the detail in the body.
A non-2xx from a cron job is mailed by some daemons, dropped by others and
retried by none, so failures go to `job_runs` where the panel reads them. A bad
key is the one exception and answers 401.

## Draining the queue

Four triggers — see the table above. Each pass sends a bounded batch:

- **Every inbound webhook** releases due broadcasts and drains 5. An inbound
  message proves the gateway is reachable, which makes it the cheapest moment to
  send more — the same reasoning as `retryFailedOutbound`.
- **The cron tick** releases, drains a full batch, and retries failed outbound.
- **Pressing send** drains one full batch in `after()`, so a small broadcast is
  simply finished by the time the page comes back.
- **"Send next batch"** on the messaging page, for a quiet afternoon.

Claiming is `update … where id in (select … for update skip locked)`. The admin
page and a webhook can drain at the same moment; without that, both would read
the same queued rows and message those people twice.

A recipient claimed but not finished sits at `sending`. A process that dies
mid-send therefore leaves the row **visibly stuck** rather than queued — a
queued row would be sent again, and a duplicate WhatsApp message is worse than
one that needs a human to press **Requeue stuck** on the report page. A retry
is capped at three attempts.

## Auto-replies

Off unless `WHATSAPP_AI_REPLIES=true` **and** Ollama is configured.

The customer path tries things in this order, and the model is last:

1. **STOP** — handled before anything else.
2. **Availability**, answered from the database in `availabilityAnswer`. The CRM
   is authoritative; a listing that sold last week must not read as available
   because a model rounded it.
3. **The model**, grounded in published facts.
4. **The templated acknowledgement**, on first contact only — exactly as before.

### What contains it

The containment is structural, not an instruction in a prompt:

- **No tools, no write path.** `assistantAnswer` returns a string, and the only
  thing the caller does with it is send it to the person who just wrote in. A
  message trying to talk the model into changing a lead status has nothing to
  change it with.
- **Facts, not a database.** The query in `lib/crm/whatsapp/assistant.ts` reads
  a fixed set of public columns. `final_price`, `seller_contact` and
  `internal_notes` are not in that select and must never be added to it — a
  prompt cannot leak a column the query did not read.
- **Published listings only.** `is_public = true and workflow_status =
  'published'`. Everything it can say, a stranger could already read on the
  website.
- **An explicit refusal.** It is told to answer with exactly `HANDOFF` when the
  facts do not cover the question, which is far more reliable than trying to
  detect a hallucination afterwards. A handoff falls through to the
  acknowledgement — the normal outcome, not a failure.
- **A reply budget.** `WHATSAPP_AI_REPLY_BUDGET` (6) outbound messages per
  conversation per hour. A loop costs a handful of messages, not a banned
  number.
- **It never throws.** A model that is down, slow or talking nonsense leaves the
  conversation exactly where a model-less Living would have left it.

Every auto-reply is recorded on the lead timeline as
`Auto-reply (<model>): …`, so somebody reading it next week can tell which
replies a person sent.

### What it will not do

Quote a price that is not on the website, promise a viewing or a hold, answer a
legal or tax question, invent a listing, or discuss anything internal. All of
those produce a handoff.

## Deploying

```bash
npm ci
npm run db:migrate          # 0006 broadcasts/recipients/opt-out, 0007 scheduling
npm run check:broadcast     # no database needed
npm run check:schedule      # ditto
npm run build
```

Then set, in `.env.local` on the VPS:

```dotenv
APP_BASE_URL=https://<this environment's host>   # the gateway fetches media from here
WHATSAPP_MAX_AUDIENCE=2000
WHATSAPP_BROADCAST_BATCH=15

# Scheduling. Without CRON_SECRET the cron route refuses everything.
CRON_SECRET=<openssl rand -hex 32>
WHATSAPP_SCHEDULE_GRACE_MINUTES=180
WHATSAPP_HEARTBEAT_STALE_MINUTES=30

# only when the business has decided to turn it on
WHATSAPP_AI_REPLIES=false
WHATSAPP_AI_REPLY_BUDGET=6
OLLAMA_REPLY_TEMPERATURE=0.3
```

MinIO must be configured for attachments. Without it a broadcast can still carry
text, and the composer says so.

Then add the cron entry above, and confirm it on the panel: the **Queue and
scheduler** card should say "Scheduler running, last run just now" within five
minutes. If it still says it has never run, the cron is not reaching the route —
press **Run the scheduler now** to prove sending itself works, then fix the
crontab.

### Rolling back

Both migrations only add tables and nullable columns, so the previous build runs
unchanged against the new schema. Reverting the code is enough; drop the tables
afterwards if you want them gone.

One caveat specific to scheduling: a broadcast left at `status = 'scheduled'`
will not be understood by a build from before 0007, so disarm anything armed
before rolling back — the report page's **Clear the schedule** does it without
losing the recipient list.

## Verified automatically

`npm run check:broadcast` — no database, no MinIO, no gateway:

- an opted-out number is never a recipient, matched on the canonical form rather
  than however the lead typed it
- two leads sharing a mobile are messaged once
- an unusable number is excluded rather than attempted
- opting out beats being a duplicate, so the report and the send agree
- the summary buckets add up to the total
- an empty audience is empty, not everybody
- STOP opts out; a sentence containing "stop" does not
- the opt-out reply says offers stop, not the conversation
- "Customers" means `closed_won`, not an invented table
- broadcast media gets an absolute URL with no doubled slash
- every status the engine writes is one the column allows
- an image posts to `send-image`, a video to `send-video`, a document to
  `send-document` with its filename and mimetype — asserted against a stubbed
  fetch, so the URL is checked rather than assumed
- a document with no content type, an audio send, and a send with no media at
  all are each refused before a request is made
- inline media goes as `base64` with no `url` alongside it
- `broadcastRecipients` filters by the broadcast id it was given — asserted
  against the function's own source, so the missing-`where` bug cannot return
- the retry cap exists, is sane, and is the same constant the manual retry uses
- cancelling cascades to recipient rows in a transaction; pausing does not
- `requeueFailed` refuses a cancelled broadcast
- the rate-limit check comes before the claim, not after

## Not in this repository

Some of what broke live is on the VPS, in the OpenWA deployment, and no change
here can fix it:

- **`whatsapp-web.js` media crash.** A WhatsApp Web build around 2026-09-17
  broke outgoing media in the library OpenWA runs on
  (`Data passed to getter must include an id property`). The fix is a one-line
  backport patcher, already merged upstream in OpenWA's own repo as
  `scripts/patch-wwebjs-media-id.js`. It is currently live-patched inside the
  running container only, which means the next `--force-recreate` silently
  undoes it. It needs committing and wiring into `scripts/postinstall.js` and
  the Dockerfile the same way the two existing patchers are.
- **`ca-certificates` and `openssl` missing from the Dockerfile's production
  stage.** Breaks outbound HTTPS from the container on every rebuild, which is
  what the `url` media transport depends on. Belongs in the same `apt-get
  install` block as `curl` and `procps`.

Both are deployment-side. The `base64` transport above is the mitigation
available from this side while they are outstanding.

`npm run check:schedule` — the scheduling rules, also without a database:

- 10am in the composer is 10am in Kochi, not on the server
- a time typed back out of the panel is the time that was entered
- a date before 5:30am does not slip to the previous UTC day
- an unreadable date is rejected rather than treated as "now"
- a blank time means 10am, not midnight
- the grace window boundary, in both directions
- a broadcast paused by hand is not reported as a missed schedule
- no other status is ever reported as missed
- the staleness alarm is slacker than any sane cron interval

## Still to verify against the live instance

The queue itself needs a real Postgres and a real gateway. Manual pass:

1. Create a broadcast with one image to a hand-picked audience of two numbers
   you control. Check the report page lists both before sending.
2. Send. Confirm **both** receive one message, with the image and the caption
   together — not a photo followed by a separate text. Then repeat with an MP4
   and with a PDF: those take different OpenWA endpoints, and the route names in
   `MEDIA_ENDPOINTS` have been verified for images but not yet for the other two
   against this gateway build. A wrong one shows up as
   `Cannot POST …/messages/send-video` in the report.
3. Reply **STOP** from one of them. Confirm the confirmation arrives, the number
   appears under **Opted out**, and a second broadcast to the same audience
   shows it as `Opted out` rather than queueing it.
4. Pause a larger broadcast mid-flight, confirm queued rows keep their place,
   resume, and confirm nobody receives it twice.
4b. **Cancel** a larger broadcast after one or two have gone out. Confirm no
    further messages arrive, that the remaining rows read `skipped — Broadcast
    cancelled`, and that pressing **Retry failed** afterwards does nothing.
4c. Create a broadcast with exactly **one** recipient and confirm the review
    page says one person, not a number inflated by other broadcasts.
5. With the gateway stopped, send a broadcast: rows should go to `failed` with a
   retryable reason and **Retry failed** should drain them once it is back.
6. Reply to a thread from the inbox and confirm it arrives and lands in the
   conversation timeline.
7. With `WHATSAPP_AI_REPLIES=true`, ask a published listing's price from an
   unknown number, then ask something internal ("what will the owner accept?")
   and confirm the second produces a handoff rather than an answer.

Scheduling, which is the part with a real cron in it:

8. Arm a broadcast for three minutes from now, to one number you control. Leave
   the panel. Confirm it arrives without anyone touching anything, and that the
   report shows the scheduled time alongside the sent time.
9. Stop the cron. Arm another for two minutes from now, wait five, and confirm
   the panel's scheduler card turns red and the broadcast shows as **overdue**.
   Then load `/admin/messaging` and confirm that alone releases it — that is the
   backup trigger doing its job.
10. Set `WHATSAPP_SCHEDULE_GRACE_MINUTES=1`, arm one for two minutes from now,
    wait five, tick, and confirm it is **paused** and reported as having missed
    its window rather than sent. Put the setting back.
11. Hit `/api/cron/whatsapp` with no key and with a wrong key — both 401. With
    the right key, confirm the JSON body reports what it did.
12. Run two ticks at the same moment against one armed broadcast
    (`curl … & curl … &`) and confirm from the recipient rows that nobody was
    messaged twice.

## Ban risk

Unchanged and now more relevant: OpenWA is an unofficial gateway and bulk
patterns are exactly what gets a number restricted. `WHATSAPP_MAX_PER_MINUTE`
applies to broadcasts like everything else and should stay low. Use a dedicated
number, keep email working as the fallback, and prefer a smaller, better-chosen
audience over everyone on file — which is what the presets are for.
