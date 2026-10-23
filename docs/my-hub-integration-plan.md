# my-hub integration — plan

_2026-10-23. Builds on "my-hub integration" in `docs/import/takeout-import-plan.md` (what exists today) and the
my-hub code as of `78151c63`. my-hub paths below are relative to `~/dev/my-hub/apps/backend/src`. The brief for
the agent doing the my-hub side is `docs/my-hub-handoff.md`._

## Goal

my-hub stays where data is curated and lived with (people, relationships, calendar, journal, fitness). bytebunker
keeps the complete history. Changes in my-hub should reach bytebunker within seconds, nothing curated in my-hub
should ever be lost because my-hub deleted or merged it, and my-hub should be able to read history and derived data
(trips, last contact, places) back from bytebunker.

## Today

- bytebunker: `my-hub` extension with person sync (`sync-persons` → `store-objects`) and calendar snapshots
  (`fetch-calendar-feed` → `parse-ics-file`). Manual trigger `POST /my-hub/sync`. Persons keyed by
  `personStableKeys()` (`person:myhub:<id>`, email, phone, handles).
- my-hub: `/export/persons`, `/export/calendars`, `/export/calendars/:slug/ics` on unmerged branch
  `feat/bytebunker-person-export` (1 commit, 115 behind main).
- Gaps that block "almost live":
  - No person change feed: `updatedSince` misses email/phone/IMPP edits, and merges and deletes are hard deletes
    with no trace. Offset paging is unstable while rows change.
  - Calendar is a whole-ICS snapshot per calendar, and bytebunker's activity path is first-import-wins, so moved or
    renamed events never update.
  - Friends data (relationships, facts, life events, notes, calls, conversations) is not exported at all and is
    hard deleted in my-hub.
  - One global API key gives bytebunker full read *and write* access to my-hub.

What my-hub already has that we can build on:

| my-hub piece | Use |
|---|---|
| `dav_change` (global `seq`, `deleted` tombstones, `NOTIFY dav_change`) | Ready-made change feed for calendar objects, tasks and contact cards |
| `CalendarStoreEvents.subscribe` (post-commit, per object put/delete) | Push hook for calendar changes |
| MikroORM `onFlush` subscribers (pattern in `plugin/contacts/contact-change.tracker.ts`) | Generic outbox writer for every other entity |
| DB job queue (`job/`, retries, leases) | Reliable webhook delivery to bytebunker |
| `PersonMergeService` + `PersonMergeParticipant` registry | Place to record merges |
| MCP OAuth scopes (`mcp/oauth/`) | Model for a scoped, read-only token |

## Architecture: change feed + push hint + reconciliation

```
my-hub                                                   bytebunker
──────                                                   ──────────
onFlush subscriber ─┐
merge / delete ─────┼─► export_change (seq) ─┐
dav_change (seq) ───┘                        │
                                             ├─ GET /export/changes?after=<seq>   ◄── pull (cursor in bytebunker setting)
job queue ── POST /my-hub/hook {seq} ────────┼──────────────────────────────────►  debounced trigger (2 s)
                                             └─ GET /export/<type>?cursor=        ◄── nightly full reconcile
```

1. **Pull is the truth, push is only a hint.** bytebunker keeps a `lastSeq` cursor and reads
   `GET /export/changes?after=<seq>&limit=500`. Each row: `seq`, `entityType`, `entityId`, `op`
   (`upsert` | `delete` | `merge`), `mergedIntoId`, `changedAt`, and the current entity payload for `upsert` (so one
   request per batch, no N+1). Missing a hint loses nothing; the next pull catches up.
2. **Push hint.** On commit, my-hub enqueues a job that POSTs `{ seq }` to bytebunker `POST /my-hub/hook` (HMAC
   signature, shared secret). bytebunker debounces hints for ~2 s and starts one sync execution. Retries come from
   my-hub's job queue; bytebunker answers immediately and does the work in BullMQ. Latency: a few seconds.
3. **Fallback schedule.** The existing schedule trigger pulls every 15 min regardless, in case hooks are down.
4. **Nightly reconcile.** Keyset-paged snapshots (`GET /export/persons?cursor=<updatedAt,id>`) compare the full set;
   anything bytebunker has but my-hub no longer returns gets `myHubDeletedAt`. Catches raw-SQL writes that bypass the
   ORM and any feed bug.

### Same host, different containers (decided)

Both apps run on `titan` in separate Coolify stacks (bytebunker on `coolify`, my-hub on `my-hub-network`). Pull +
hint stays the design; both calls go over a shared external Docker network `bytebunker-link` that both backends
join, so traffic never leaves the host and no public route is needed. my-hub calls
`http://bytebunker-backend:12100/my-hub/hook` (HMAC-signed, `X-Hub-Timestamp` + `X-Hub-Signature`), bytebunker pulls
`http://<my-hub-backend>:11000/export/changes` with a scoped `export:read` token. Public URLs remain the fallback if
the apps are split across hosts.

Considered and rejected: a read-only Postgres role on my-hub's DB plus `LISTEN dav_change`. Lower latency and less
code, but bytebunker would depend on my-hub's table layout and migrations, and it stops working once the hosts split.

Why not the other alternatives:
- SSE `/live/stream`: no ids, no payload, no replay, and persons publish nothing. Fine for UIs, not for sync.
- CalDAV `sync-collection` for calendars: works, but needs a DAV client in bytebunker and covers only calendars.
  `dav_change` gives the same tombstones through the same feed as everything else.
- Webhook with full payload (no pull): lost or reordered deliveries corrupt state; the cursor makes it idempotent.

### my-hub changes

1. `export_change` table: `seq bigserial`, `entity_type`, `entity_id`, `op`, `merged_into_id`, `changed_at`.
   Written in the same transaction as the change:
   - `onFlush` subscriber for every exported entity type. Child rows (`person_email`, `person_phone`,
     `person_impp`, `contact_handle`) record a change on their **parent person**, which fixes the `updatedSince`
     gap.
   - `PersonMergeService.mergePersons`: one `merge` row (`entityId` = secondary, `mergedIntoId` = primary), plus
     `upsert` rows for everything the participants re-pointed (raw SQL re-points bypass `onFlush`).
   - `PersonService.remove` and friends-module deletes: `delete` rows.
2. `GET /export/changes?after&limit&types` merging `export_change` and `dav_change` into one ordered stream (two
   cursors encoded in one opaque token, since the sequences are separate). Calendar rows carry the raw `.ics` of the
   object.
3. Keyset-paged snapshot endpoints per type for the reconcile.
4. `GET /export/vocabulary`: relationship types with `reverse`/`group`/`canonical`, fact enums, the DB taxonomy
   (life event, activity, gift types), handle platforms, date precision. bytebunker stores them as strings and reads
   labels from here; no shared npm package across two repos.
5. **Scoped token**: `export_token` rows with scopes `export:read` / `export:media`, accepted only on `/export/*`
   (a guard next to `ApiKeyGuard`, which must reject them). bytebunker stops holding the admin key.
6. Webhook job: `bytebunker.hookUrl` + `hookSecret` in config; off in worktrees.
7. Retention: keep `export_change` rows for 30 days. A cursor older than that gets `410 Gone` → bytebunker runs a full
   reconcile and resets its cursor (same idea as DAV's `valid-sync-token`).

### bytebunker changes

1. `my-hub` extension:
   - `POST /my-hub/hook` (HMAC check, debounce, starts the sync blueprint).
   - `my-hub:pull-changes` module: reads the feed from `lastSeq`, groups rows by entity type, emits one output per
     type, stores the new cursor **after** the store nodes succeed (at-least-once; every write is idempotent by
     stable key).
   - One mapping module per entity type (below), feeding `store-objects` / `store-activity`.
   - Reconcile module for the nightly run.
2. Persister:
   - **Mutable activities from my-hub.** The activity path is first-import-wins today. Add an `upsert` mode, used by
     my-hub modules only: existing activity nodes get `SET n += props`, and edges of required objects are
     re-pointed. Export importers stay first-import-wins.
   - **Node merge**: `mergeNodes(secondaryId, primaryId)` re-points every relationship, unions labels and stable keys
     (Postgres index rows move to the primary), keeps the secondary as a tombstone node `MergedInto` → primary so
     old references resolve. Used for `op: merge`.
   - **Property precedence**: on `MyHubPerson` nodes, only my-hub writes props; importer-emitted persons add keys and
     edges but set props only on create. Generalise as a per-node `authority` prop (`my-hub`), checked in the shape
     Cypher.
   - **Deletes**: never remove history. Set `myHubDeletedAt`; queries hide it by default.
   - **Merges** (decided): the merged-away node stays as a tombstone with label `MergedInto` and an edge to the
     survivor, so old references and keys still resolve.
   - **Sensitivity** (decided): every node gets a `sensitivity` prop, `normal` | `private` | `secret`, taken from
     the my-hub payload (sensitive facts → `secret`, notes, journal, message text → `private`). The search API and
     frontend hide `private` and `secret` unless the request asks for them (`includeSensitive`); the timeline shows a
     toggle. Nothing is filtered at import time: everything is copied.
3. **History of curated data** — something my-hub cannot offer: every `upsert` that changes props also records the
   previous values (an `Update` activity `GENERATED_BY` the sync, `object` = the node, `formerProps` JSON). A deleted
   note, an ended relationship or a renamed person stays visible in the timeline.

## What to copy, what to leave

### A. Curated in my-hub, mirrored here (my-hub wins, near-live)

| my-hub data | bytebunker graph | Notes |
|---|---|---|
| `person` + emails, phones, IMPP, `contact_handle` | `Person:MyHubPerson`, keys via `personStableKeys()` | Exists; move to the feed. Add the owner: export `ownerPersonId`, attach keys to bytebunker's owner actor |
| `relationship` | `(Person)-[:RELATED_TO {type, startedOn, endedOn, precision, ended, endReason}]->(Person)` | Canonical direction as in my-hub; `reverse` from the vocabulary. Not an activity: a relation with a validity range |
| `life_event` | `LifeEvent` activity (`type`, `title`), actor = the person | `happenedAt` is a date; precision prop |
| friends `activity` (shared plans, meetups) | `Event`-like activity with `INVOLVES` each participant | Links to calendar events where my-hub has the link |
| `phone_call` (manual) | `Call` activity, key `myhub:phone_call:<externalId or id>` | |
| `contact_signal` (Android call/message log) | `Call` / `Message` activities per signal, key `myhub:signal:<clientId>` | Real history my-hub already collects; complements WhatsApp exports |
| `conversation` + messages | `Note` objects with `Create` activities | Same shape as the WhatsApp importer |
| `person_note`, `person_fact` | `Note` / `Fact` objects `ABOUT` the person | All copied; `isSensitive` facts → `sensitivity = secret`, notes → `private` |
| `gift` | `Gift` object, `Give`/`Receive` activity when `giftedAt` is set | |
| current calendar (`calendar_object`, STORED + DERIVED except birthdays) | `Event` activities via the existing ICS parser, keys `ics:<UID>[:<rid>]` | Now with upsert; tombstones set `myHubDeletedAt` |
| `entity_link` (event ↔ person, place, photo, journal) | Edges `ATTENDED_BY`, `AT`, `HAS_PHOTO` | Gives attendees as persons without parsing ATTENDEE |
| `journal_moment` | `Note` object + `Create` activity at `loggedAt`, mood/tags props, `INVOLVES` people, place from geo | Journiv is the store; my-hub's cache is the clean read path |
| fitness sessions, sets, body metrics | `Exercise` activity per session, sets as JSON; `Measure` activity per body metric | Settles "Fit ownership": my-hub live, bytebunker history. Google Fit export fills the years before |
| trips (`trip_planner_trip`, `itinerary`) after they end | `Travel` activity with the planned places | Compare with bytebunker's derived trips |
| `cook_session` | `Cook` activity `INVOLVES` the recipe | Low priority |

### B. External services my-hub mirrors (decided: all through my-hub)

my-hub is bytebunker's only live source for these; my-hub's importers are extended to keep everything (handoff
WP4–WP8).

| Data | Plan |
|---|---|
| Spotify | Only through my-hub. my-hub adds a `/me/player` sampler (ms played, device, skips, episodes) and gap detection; today it loses plays after a 50-track outage, never sees episodes, and stores no duration or device. Live plays get key `spotify:live:<playedAt>:<uri>`; a dedupe module links a later Extended Streaming History row (same URI, end time within ±30 s) to the live node instead of creating a second one. Reported gaps are filled by the next export |
| Email | Metadata plus extracted plain text (`textContent`) as `Message` activities, persons by email key, searchable. The full mail is not copied: bytebunker loads HTML on view from `GET /export/email/:messageId/html` or links `webLink` / my-hub's mail page |
| Immich | my-hub's mirror (`immich_asset`, `immich_person` with hub person links), no direct Immich connector and no extra thumbnail copy. bytebunker stores `thumbnailUrl` / `previewUrl` and proxies them from my-hub (`export:media` scope); my-hub already keeps a 400 px AVIF sidecar per asset |
| Weather | my-hub's own recent observations for its configured location (it keeps them instead of pruning after 24 h). The history comes from bytebunker's own historic weather enrichment below |
| Phone feed | Calls, message signals and, new, message text captured from Android notifications (`contact_message`, `sensitivity = private`, hidden in the hub UI) |
| Bring shopping | Skip |

### Historic weather (bytebunker enrichment)

Goal: weather at the place the owner was, per hour, for every day with location history (2014 →). Sources (from
knowledge, check terms before building):

| Source | Coverage | Resolution | Licence / limits | Use |
|---|---|---|---|---|
| Open-Meteo Historical Weather API (ERA5, ERA5-Land, ECMWF IFS) | Worldwide, 1940 → ~5 days ago | Hourly, ~9–25 km grid | CC BY 4.0; free non-commercial, about 10k calls/day | Default for every place |
| Bright Sky (DWD open data) | Germany, 2010 → today, station observations | Hourly | Free, DWD open data licence | Germany: real observations, better than reanalysis |
| DWD Climate Data Center (CDC) | Germany, stations, decades | Hourly / 10 min | Open data | Bulk alternative to Bright Sky |
| Meteostat | Worldwide stations | Hourly / daily | CC BY-NC 4.0; bulk dumps free | Station data outside Germany |
| NOAA ISD / GHCN-Daily | Worldwide stations | Hourly (ISD), daily (GHCN) | Public domain | Fallback, bulk |
| Visual Crossing | Worldwide | Hourly | 1,000 records/day free | Not needed |

Plan:
- `enrichment:historic-weather` module: for each `DailySummary` day and the canonical places visited that day (or
  the hourly position from `Move`/`Arrive`), batch one Open-Meteo archive request per place cluster and date range
  (the API takes date ranges, so a whole trip is one call). Germany uses Bright Sky first, Open-Meteo second.
- Graph: `WeatherObservation` objects (hourly: temperature, precipitation, weather code, wind, cloud cover) `AT` a
  `CanonicalPlace`, linked from the `DailySummary`; daily min/max/sum props on the summary itself. Keys
  `weather:<source>:<lat2>:<lon2>:<hour>` (coordinates rounded to the grid), so re-runs and overlapping places dedupe.
- Scheduled nightly after the places chain, resumable like the geocoding refiners, with a request budget per run.
- my-hub's own observations (above) feed the same node type with source `my-hub` for the recent days.

### C. Not copied

Settings, notifications, morning briefs, devices, data health, service links, OAuth/connection secrets, search and AI
logs, reminders (future-facing config), duplicate suggestions, taxonomy rows (only via `/export/vocabulary`).

### D. Back from bytebunker to my-hub

A read API (REST plus an MCP provider, mirroring my-hub's own `/mcp`), keyed by `person:myhub:<id>`:
- per person: last contact on every channel (WhatsApp, calls, email, events), shared events and trips, timeline;
- per day: daily summary, places, travel, music ("on this day" for the morning brief and journal);
- places: canonical place names and visits, so my-hub's Mapbox place refs can show visit history.

my-hub's stay-in-touch and relationship-signal jobs would get much better input from this than from their own data.

## Reusable my-hub structures

| my-hub | Reuse in bytebunker |
|---|---|
| `RelationshipType` + `RELATIONSHIP_TYPES` (`friends/relationship/relationship.enums.ts`) | Edge `type` values and reverse labels, via `/export/vocabulary` |
| `DatePrecision` (`shared/date/date-precision.enum.ts`) | Precision prop on dates of life events, relationships, deaths |
| Fact enums (`friends/fact/fact.enums.ts`) | `Fact` node props |
| `HandlePlatform`, `SignalKind`, `SignalDirection` (`plugin/phone/phone.enums.ts`) | Already mirrored in person keys; reuse for `Call`/`Message` activity props |
| `plugin:entity_type:external_id` stable ids | bytebunker key `myhub:<stableId>` for every my-hub row that has one |
| `entity_link` kinds, roles, ref format (`shared/links/`) | Direct mapping to graph edges |
| `PlaceSchema` (`packages/trip-core/src/schema/place.ts`), Mapbox ids | Key Mapbox-resolved places `place:mapbox:<id>`; bytebunker's Mapbox refinement emits the same key so both sides meet |
| iCal store (raw `.ics` per object) | Existing `ics-calendar` parser, unchanged |
| zod ingest schema (`plugin/phone/phone-ingest.service.ts`) | Template for validating feed payloads in bytebunker |

## Phases

| # | Work | Where | Depends on |
|---|---|---|---|
| 0 | Rebase `feat/bytebunker-person-export` onto main, scoped `export:read` token, deploy | my-hub | — |
| 1 | `export_change` outbox, merge/delete rows, `/export/changes` (persons + `dav_change`), retention + 410 | my-hub | 0 |
| 2 | Pull module + cursor, schedule fallback, `mergeNodes`, `myHubDeletedAt`, person precedence | bytebunker | 1 |
| 3 | Hint job → `POST /my-hub/hook` over `bytebunker-link`, HMAC, debounce | both | 2 |
| 4 | Calendar through `dav_change` in the same feed, activity upsert mode, `entity_link` edges | both | 2 |
| 5 | Friends data: relationships, life events, activities, calls, signals, conversations, notes, facts, gifts | both | 2 |
| 6 | Change history (`Update` activities with former props) | bytebunker | 2 |
| 7 | Spotify (sampler, gaps, live/export dedupe), journal, fitness, ended trips | both | 5 |
| 7b | Email text + HTML on view, Immich mirror + thumbnail proxy, phone message text, weather observations, sensitivity in search/frontend | both | 5 |
| 7c | Historic weather enrichment (Open-Meteo archive, Bright Sky) | bytebunker | — |
| 8 | Read API + MCP for my-hub; first consumers: last contact, "on this day" | bytebunker, then my-hub | 5 |

Phases 1–3 give live persons end to end and are the base for everything else. Phase 8 can start in parallel once
persons link (it reads what export importers already wrote).

## Decisions (2026-10-23)

- Sensitive data: copy everything; mark `sensitivity` and hide `private`/`secret` by default.
- Phone feed: import call/message log including message text (captured by my-hub from notifications).
- Spotify: only through my-hub.
- Transport: pull feed + signed hint over a shared internal Docker network (above).
- Merges: keep a `MergedInto` tombstone node.

## Open questions

1. Should my-hub get a minimal mail page so `hubUrl` works, or is the Outlook `webLink` enough?
2. Historic weather: hourly for every day, or hourly only on travel days and daily elsewhere (fewer nodes)?
