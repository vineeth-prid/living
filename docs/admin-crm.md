# Living Admin & CRM

Internal property administration and real-estate CRM, built into the existing
Living site. Same Next.js app, same Postgres database, same Drizzle schema,
same MinIO bucket — no second backend and no duplicate property store.

## Getting it running

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL and the MinIO block
npm run db:migrate                # additive; see "Migration safety" below
npm run db:seed                   # listings, lead types, sources, sample leads
npm run admin:create -- "Your Name" you@livingbyitr.com
npm run dev                       # sign in at /admin
```

`admin:create` prints a temporary password and is also the recovery path if
everyone is locked out — re-running it on an existing email promotes that
account to administrator and resets its password.

### Environment

| Variable | Needed by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | site + admin | Without it the public site serves seed fixtures and enquiry submission is refused rather than silently dropped. |
| `NEXT_PUBLIC_IMAGE_CDN` | public site | Unchanged. Public read path for media. |
| `MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | admin only | Write path for uploads. The public site never needs these. |
| `MINIO_PORT`, `MINIO_USE_SSL` | admin only | Optional. |

## Roles

**Administrator** — everything: dashboard, reports, employees, settings, audit
log, publishing, final price, lead assignment.

**Employee** — operational CRM only: their own leads (assigned to them or
created by them), properties, media, notes, follow-ups, activities.

Employees cannot reach `/admin/dashboard`, `/admin/reports`,
`/admin/employees` or `/admin/settings`. This is enforced in
`lib/auth/dal.ts`, which every page and server action calls — not by hiding
menu items. Typing the URL lands on `/admin/denied`.

Two grants can be given to individual employees from the employee editor:

- `property.publish` — publish and unpublish listings
- `property.final_price` — see and set the internal final price

## Where the security actually lives

| Concern | Enforced by |
| --- | --- |
| Is this person signed in? | `requireUser()` — hits Postgres each call, so deactivating an employee logs them out immediately |
| Is this person an admin? | `requireAdmin()` in the page; `assertAdmin()` in actions |
| Can they see this lead? | `visibleTo()` — an SQL clause in the WHERE, so an employee guessing a colleague's lead id gets a 404, not data |
| Can they write to this lead? | `loadWritable()` — the same clause on every mutation |
| Can the public see this listing? | `isVisible` in `lib/properties.ts`: `published AND isPublic AND NOT deleted` |
| Can the public see internal fields? | They are never selected. `lib/properties.ts` uses a hand-written column allowlist |

`proxy.ts` (Next 16 renamed `middleware` to `proxy`) only checks whether a
session cookie exists, to bounce signed-out visitors to the login page. It
cannot reach the database and is **not** a security boundary — deleting it
would cost a redirect, nothing more.

### The final price

`properties.finalPrice` is internal. It is excluded from the public projection
entirely, so it cannot reach a page, an RSC payload, metadata, an OG image or
JSON-LD. `getAdminProperty()` strips it at the query for anyone without
`property.final_price`, and both create and update refuse to write it for
those users even if the field is added to the request by hand.

`npm run check:security` asserts this and fails if an internal column is ever
added to the allowlist.

## Publishing

```
draft → ready_for_review → published → reserved → sold / rented → archived
```

- Creating a property never publishes it (Rule 1).
- The website shows a listing only when `workflowStatus = published` **and**
  `isPublic = true` (Rule 2).
- Publishing requires a title, location, price label, asking price (for sales)
  and at least one public photo.
- Moving to sold, rented, off-market or archived pulls the listing off the site
  automatically.
- Archiving is a soft delete. Rows and history are kept (Rule 12).

Published listings appear at `/homes` and `/homes/<slug>` with their own
metadata, canonical URL, OG image and `RealEstateListing` structured data, and
are added to `sitemap.xml`. Publishing revalidates those paths, so a new
listing appears without a redeploy.

## Lead capture

The contact form and every property page's enquiry form create CRM leads
directly. Property enquiries arrive already associated with that listing. Both
are rate-limited per IP, honeypotted, length-capped and schema-validated, and
the submitted property id is checked against the published set rather than
trusted.

Leads arrive **unassigned** — automatic assignment is deliberately not built
(§53 lists it as future work). An admin assigns from the lead page or list.

## Migration safety

`drizzle/0001_*.sql` is additive: 49 new columns on `properties`, plus the new
tables. No column is dropped or retyped, so existing rows and the existing seed
keep working.

It ends with one data migration:

```sql
UPDATE "properties" SET "workflow_status" = 'published', "is_public" = true ...
```

Every listing that existed before the panel was live on the website. Without
this they would all default to `draft` and vanish from livingbyitr.com the
moment the migration ran. It only touches rows present at migration time.

## Checks

```bash
npm run check:security   # 15 assertions: public/internal split, password
                         # hashing, publish gate, duplicate matching, funnel math
npm run check:jsonld     # existing structured-data check
npx tsc --noEmit
npm run lint
```

These need no database. The database-backed items in the brief's §49 —
admin/employee login, session expiry, role gates on live URLs, cross-employee
lead access, media upload and reorder against a real bucket — need a running
Postgres and MinIO and are a manual pass before go-live. The `visibleTo()` and
`loadWritable()` scoping is the thing to probe hardest there: sign in as an
employee and try to open, edit and reassign another employee's lead by id.

## Known ceilings

Marked in code with `ponytail:` comments.

- **Enquiry rate limiting** is an in-process map. It works on one instance;
  behind a load balancer each node counts separately. Move to Postgres or Redis
  if the site is ever scaled out.
- **Reference numbers** (`LIV-0042`, `LEAD-0042`) come from `max + 1`, not a
  sequence. Concurrent creates collide on the unique index and retry rather
  than duplicating. Fine at this volume.
- **The seed fallback** in `lib/properties.ts` serves fixtures when
  `DATABASE_URL` is unset. Delete that branch once Postgres is wired
  everywhere — it can only ever serve seed content, never stale production data.
- **Pipeline columns** cap at 50 cards and say how many are hidden.
- **Notifications** (§36) are not built. The activity and follow-up tables carry
  what a notifier would need — `lead_followups.remindAt` exists and is unused —
  so adding one later doesn't require reshaping the CRM.
