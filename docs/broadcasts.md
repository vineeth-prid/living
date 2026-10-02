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
reason, so the report adds up. "Sent 391 of 391" when 21 people were dropped on
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
   together — not a photo followed by a separate text.
3. Reply **STOP** from one of them. Confirm the confirmation arrives, the number
   appears under **Opted out**, and a second broadcast to the same audience
   shows it as `Opted out` rather than queueing it.
4. Pause a larger broadcast mid-flight, confirm queued rows keep their place,
   resume, and confirm nobody receives it twice.
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
