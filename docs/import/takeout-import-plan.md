# Import plan: Takeout, browsers, messengers, Airbnb, calendars

Status: 2026-10-22. Goal: bytebunker as the long-term history log of everything, as far back as data exists.
my-hub keeps serving current, changing data (contacts, calendars, live sync); bytebunker stores the immutable
history and does not promise up-to-date answers for other clients.

## Decisions (2026-10-22)

- my-hub is the source of truth for persons and for current calendar events; bytebunker links to it (see
  "my-hub integration"). bytebunker holds the history and dedupes old exports against my-hub data.
- Messages (WhatsApp, Airbnb) are stored with full text.
- Browser history: every visit, minus redirects, reloads and framed loads.
- Google Maps saved-list CSVs (no dates) are skipped.
- Spotify Extended Streaming History is part of this round (real module instead of the execute-code script).
- Work builds on `feat/ingest-pipeline-test-harness` (batched writes, content routing, tier-1/tier-2 harness).

## Conventions every importer follows

- One extension per source (`apps/backend/src/extension/extensions/<name>`), id in `local-extension.constant.ts`,
  module in `extension.module.ts`. Raw export shapes live in `packages/event-schema/src/extension/<name>`.
- One pipeline module per file format. Input is the file asset from `common-pipeline-triggers:local-file-trigger`;
  output is `activities`, which a blueprint feeds into `core:store-activity`. Blueprint = trigger glob → transform
  module → store-activity.
- Parsing is a pure util (`util/*.parser.ts`) with a spec and a small synthetic fixture. Never commit real export
  data; fixtures are hand-written lookalikes.
- Every activity has a deterministic source key (`<source>:<kind>:<native id>`) as first stable key, plus a hashed
  content key where the same event can arrive from two sources.
- Every node label an importer emits must be registered in `activity-graph/schema/graph-schema.constant.ts`
  (neode throws on unknown labels). Top-level properties holding an AS object must use a key from
  `relationshipInfoMap` (`actor`, `object`, `target`, `origin`, `location`, `generator`); anything else must be a
  primitive or plain JSON.
- Takeout HTML exists in German (2025 export) and English (2019/2021 exports); parsers handle both.
- Timestamps without zone: Takeout HTML carries MEZ/MESZ or CET/CEST, browsers store UTC epochs, WhatsApp writes
  device-local wall time (read in a configurable zone, default Europe/Berlin).

## Shared vocabulary (registered labels)

| Activity | Used for | Object |
|---|---|---|
| `Event` | Calendar occurrences, Airbnb stays | `location: Place` |
| `Search` (new) | Google/YouTube/Maps/Airbnb searches | `location: Place` if the search had one |
| `View` | Page visits, YouTube views, viewed places | `object: Page/Video/Place` |
| `Create` (new) | Messages sent/received, reviews written/received | `object: Note`, `target: Person` |
| `Add` (new) | Saved place, bookmark created | `object: Place/Page` |
| `Listen`, `Arrive`, `Move` | existing | |

New object labels: `Note` (message/review text), `Page` (web page). People from other sources become `Person`
nodes keyed by their handle (`email:<address>`, `airbnb:account:<id>`, `whatsapp:<export>:<name>`); they link to
my-hub persons through shared stable keys (see "my-hub integration").

## Workstreams

### 1. ICS calendars — done

- `ics-calendar/util/ics-document.parser.ts`: tolerant parser for whole files (many UIDs, many VCALENDARs).
  VEVENT/VTODO/VJOURNAL/VFREEBUSY/VAVAILABILITY, VALARM, attachments, attendees with all RFC 5545 params,
  RFC 7986 (COLOR, IMAGE, CONFERENCE, NAME, REFRESH-INTERVAL), RFC 9073 structured locations, RFC 9074 alarm
  props. Vendor extensions decoded: X-ALT-DESC, X-MICROSOFT-CDO-*, Teams/Google/Zoom/Webex/Jitsi links,
  X-APPLE-STRUCTURED-LOCATION, X-APPLE-TRAVEL-*, X-MOZ-*, X-MYHUB-DETAILS. Anything else kept verbatim (jCal).
- `ics-timezone.util.ts`: IANA, vendor-prefixed TZIDs, Windows ids and display names, VTIMEZONE fallback.
- `ics-occurrence.util.ts`: recurrence expansion with EXDATE, RDATE, overrides (also UTC RECURRENCE-ID on zoned
  series), cancelled instances, horizon and per-series cap.
- Pipeline emits one `Event` per occurrence with the full component under `ics`.
- Follow-ups: VTODO (completed tasks) and VJOURNAL as activities; attendees as Person nodes.

### 2. Airbnb — in progress

One module `airbnb:transform-airbnb-export` takes any file from `Airbnb_data_request_*/json/` and detects the kind:
`reservations.json` → `Event` stays; `search_history.json` → `Search`; `messages.json` → `Create`+`Note`
per message; `reviews.json` → `Create`+`Note` review. Not imported: wishlists (no timestamps), experiences (no
dates), payments, ID verification, telemetry, activity log.

### 3. Google "My Activity" + YouTube search history

Generic parser for the Takeout activity HTML (`.outer-cell` blocks; header = product, body = verb + link(s) +
timestamp, caption = products/locations/details). Files: `Meine Aktivitäten/<Produkt>/MeineAktivitäten.html`,
`My Activity/<Product>/MyActivity.html`, `Maps/Suchverlauf.html`, YouTube `Verlauf/Suchverlauf.html` and
`history/search-history.html`. Verb tables DE+EN map to: searched → `Search`; visited/viewed/watched → `View`;
used/installed/other → `View` with an `action` string. Location captions → Place with coordinates. Also add
English timestamp support to the existing YouTube watch history parser. Sizes: Search ~50k, Maps ~14.5k,
Play Store ~25 MB, News, Image Search, Assistant, Android, Shopping, Lens, Translate, ...

### 4. Browser history and bookmarks — done

Extension `browser-history`, three modules:

- `transform-browser-database`: Firefox `places.sqlite` (visits + bookmarks) and Chrome/Chromium `History`, read
  with `node:sqlite` from a temp copy. Users import `places.sqlite` with Firefox closed or a `sqlite3 .backup`
  snapshot (the `-wal` never reaches the module). Options `profileName`, `browser`, `includeBookmarks`,
  `fromDate`/`toDate` (split a big profile until chunked outputs land).
- `transform-chrome-takeout-history`: `Chrome/Verlauf.json` / `BrowserHistory.json`.
- `transform-bookmarks-html`: Netscape bookmark HTML (`Lesezeichen.html`, `Bookmarks.html`, `Leseliste.html`).

Visits → `View` + `BrowserVisit` of `Page` (`page:<normalised url>`), key `browser:visit:<url>:<ms>` (Firefox Sync
stores received visits at ms precision). Noise dropped: redirect hops (only the chain end is kept), reloads,
framed loads, browser-internal URLs (`file:` kept). Bookmarks → `Add` + `Bookmark`, key
`browser:bookmark:<url>:<ms>` plus `browser:bookmark:firefox:<guid>`. Numbers in `docs/import/firefox-overview.md`.

### 5. WhatsApp chat export

Parser for `WhatsApp Chat with <name>.txt` (or the zip). Locale-tolerant header detection: US
`M/D/YY, H:MM - `, DE `DD.MM.YY, HH:MM - `, iOS `[DD.MM.YY, HH:MM:SS] `, 12h AM/PM. Handles multi-line messages,
system lines, `<Media omitted>`/`<Medien ausgeschlossen>`, `(file attached)`/`(Datei angehängt)`, deleted and
edited markers, U+200E marks. Messages → `Create`+`Note`, sender → Person by export-scoped name, the owner
detected by option (`ownerName`). Sample export: 8,148 messages, 2 senders, 2025-10 → 2026-10.

### 6. Google Maps saved places and reviews

`Maps (Meine Orte)/Gespeicherte Orte.json` (GeoJSON with dates) → `Add` of Place; `Bewertungen.json` → `Create`
review with rating; `Gespeichert/*.csv` lists (title, note, URL, comment; no dates), labeled places, commute
settings.

### 7. Spotify Extended Streaming History

`spotify` extension replacing the execute-code blueprint: audio, podcast episodes, audiobook chapters, video.
`ts` is the end of playback (start = ts − ms_played); identity `spotify:play:<ts>:<uri>`; per-row errors are
skipped and counted; IP addresses are not stored.

### 8. my-hub integration

Person nodes seeded from my-hub with all identity keys (`person:myhub:<id>`, `person:email:`, `person:phone:`,
`person:handle:<platform>:<id>`), a standalone object write path (`bytebunker-core:store-objects`), and the my-hub
calendar feed as an ICS source. Details in the section added by that workstream.

## my-hub integration

### Source of truth

| Data | Owner | bytebunker's role |
|---|---|---|
| Persons (names, emails, phones, messenger handles) | my-hub | Mirrors them as `Person:MyHubPerson` nodes; never writes back |
| Current calendars (own CalDAV store, CalDAV-synced Google calendars, hub-created events) | my-hub | Imports snapshots as history |
| History (past events, messages, visits, listens, ...) | bytebunker | System of record; old `.ics` backups dedupe with my-hub events by UID |

bytebunker only ever sends GET requests to my-hub. Never point a dev or worktree instance at the production hub
(`*.syscy.de`) unless the user configured a token for reading from it.

### my-hub API

Auth: one global API key, `Authorization: Bearer <apiKey>` (my-hub `ApiKeyGuard`); optional Cloudflare Access
headers `CF-Access-Client-Id`/`-Secret`. Webcal feeds are public routes with a per-calendar `?token=`. CalDAV
(`/dav`, Basic auth with device app passwords) has no collection GET, so a client would need `REPORT`; not used.

| Endpoint | Use here |
|---|---|
| `GET /persons` | Not used: max 200 per page, no IMPP and contact handles, placeholders always excluded, no change filter |
| `GET /phone/handles` | Not used: handles come with the person export |
| `GET /webcal/:slug?token=`, `/webcal/combined` | Possible via `feedUrl`, but UIDs are rewritten (see below) |
| `GET /export/persons?limit&offset&updatedSince&includePlaceholders` | New. Persons ordered by id with emails, phones (`normalizedValue` = E.164), IMPP URIs and linked contact handles |
| `GET /export/calendars` | New. Store calendars (STORED, DERIVED) with slug and type |
| `GET /export/calendars/:slug/ics` | New. All objects of a store calendar as one VCALENDAR, exactly as stored (original UIDs, attendees) |

The `/export` endpoints live in my-hub `apps/backend/src/export/` on branch `feat/bytebunker-person-export`
(worktree `~/dev/my-hub-wt-bytebunker-export`, not pushed). my-hub has no change feed: `updatedSince` matches the
person row's `updatedAt` or a linked handle's `updatedAt`; email/phone/IMPP rows have no timestamps, and deletes and
merges leave no trace. So incremental syncs need a periodic full sync.

### Key scheme

`personStableKeys()` (`activity-graph/util/person-stable-key.util.ts`) builds every key; the persister reuses a node
when any key matches.

| my-hub data | Stable key |
|---|---|
| person id | `person:myhub:<id>` |
| email | `person:email:<lower-cased address>` |
| phone (E.164 from my-hub, else normalised with default country 49) | `person:phone:+49...` |
| IMPP `xmpp:`/`skype:`/`sip:`/... | `person:handle:<scheme>:<id>` (`jabber` → `xmpp`, `callto` → `skype`); `tel:`, `sms:`, `whatsapp:` numbers also as phone keys |
| contact handle number (call log, SMS, WhatsApp JID) | `person:phone:<E.164>` |
| WhatsApp handle display name | `person:handle:whatsapp-name:<name>` (what the WhatsApp chat importer emits) |
| `name:<x>` handle key of another messenger | `person:handle:<platform>-name:<x>` |
| other messenger keys (`key:`, `conv:`) | `person:handle:<platform>:<key>` |

Importers emit the same keys for the people they see: calendar attendees by email, Airbnb hosts by
`{ platform: 'airbnb' }`, WhatsApp chat partners by `{ platform: 'whatsapp-name' }`.

### Sync flow (implemented)

Config: `myHub.baseUrl` and `myHub.token` in `env.yml` (or `MY_HUB__BASE_URL`, `MY_HUB__TOKEN`); optional, the
modules fail with a clear message without it. Blueprints: `tools/ingest-harness/blueprints/my-hub-persons.blueprint.json`
and `my-hub-calendar.blueprint.json` (install through the blueprint API; not part of the takeout harness corpus).

1. Persons: `my-hub:my-hub-sync-trigger@1` → (`success` → `dependentModules`) `my-hub:sync-persons@1` →
   `bytebunker-core:store-objects@1`. Placeholders are skipped unless `includePlaceholders`; hidden persons are kept
   unless `includeHidden: false`. Props: `name` (displayName), `givenName`, `familyName`, `nickname`, `birthday`,
   `organization`, `jobTitle`, `myHubId`, `myHubUpdatedAt`; empty fields are sent as null so a value cleared in
   my-hub disappears from the node too.
2. Calendars: trigger → `my-hub:fetch-calendar-feed@1` (`calendarSlug`, or `feedUrl`) → stored as a content-addressed
   asset → `ics-calendar:parse-ics-file@1` (`recurrenceHorizon: P0D`, only past instances of series) →
   `bytebunker-core:store-activity@1`. One fetch node per calendar; several parse outputs can feed one store node.
3. Running: `POST /my-hub/sync[?dryRun=true]` starts every blueprint containing the sync trigger;
   `POST /pipeline-execution` with `{ blueprintId, triggerNodeId, triggerNodeInputData: { triggeredAt } }` starts
   one. A schedule plugs in by calling `MyHubSyncTriggerService.trigger(em)` on an interval (the planned "live
   connectors as triggers"); blueprints need no change.

`store-objects` uses `ActivityGraphPersisterService.upsertObjects(em, objects, { dryRun, provenance, onProgress })`,
an additive path next to `createActivityGraph`:

- Per chunk (`ACTIVITY_GRAPH_CHUNK_SIZE`) it loads the Postgres stable-key index for all keys of the chunk.
- An object resolves to the node of its first already-indexed key (index or earlier in the same call), else a new
  node (`@id` if given, else a UUIDv7). Labels come from `@type` + `@secondaryTypes` via the same neode model lookup
  as activities (unknown types throw).
- Unlike activities, existing nodes are updated: one `UNWIND` statement per label set with the same `MERGE` on
  `ASObject {id}` + `SET n += props` + added labels as the activity path, provenance on create only.
- Keys the node did not have are indexed to it (a person that gained an email is found by it from then on). A key
  already indexed to another node stays there and is counted in `conflictingKeyCount`.
- Returns `createdCount`, `updatedCount`, `conflictingKeyCount`, `dryRun`; dry runs resolve and count but write
  nothing.

### Calendar UIDs and dedup

ICS identity is `ics:<UID>` or `ics:<UID>:<recurrenceKey>`, so dedup with older `.ics` files works only where
my-hub serves the UID the source gave the event:

| my-hub calendar | UID served by `/export/.../ics` | Dedup with older exports |
|---|---|---|
| STORED, synced from Google/other CalDAV | Original UID (store keeps the raw resource) | Yes |
| STORED, event created in my-hub | Random UUID from my-hub | Nothing older to match; later my-hub exports match |
| DERIVED (dance school, uni sport, Nimbus, Google iCal extractor) | `uuidv5(<extractor>:<sourceId>)` | No: a Google Takeout `.ics` of an extractor-fed calendar would duplicate |
| Birthdays/anniversaries (DERIVED) | `birthday:person:<id>` / `anniversary:relationship:<id>`, yearly series | Derived from persons; do not import |
| Webcal feed (`/webcal/:slug`) | Projected id `caldav:<calendarId>:<uid>` (or a legacy stable id) | No; use the export endpoint instead |

Further limits: the activity path is first-import-wins (an existing `ics:` key drops the incoming event), so later
edits in my-hub (moved, renamed) do not reach already imported events, and single future events are imported
once with their state at that time. Events deleted in my-hub stay in bytebunker as history.

### Attendees and organizers as persons (proposal, not implemented)

Today attendees/organizer are JSON props on the `Event`, and the persister only supports one object per
relationship key. Smallest change:

- Schema: add `attendee: { type: ATTENDED_BY, direction: OUT }` and `organizer: { type: ORGANIZED_BY, direction: OUT }`
  to `relationshipInfoMap` and the two labels to `RelationshipLabelEnum`.
- Persister: in `processActivitiesToNodes`, accept an array of AS objects on a relationship key (today it is
  JSON-stringified). Resolve each item with `resolveObjectNodeId`, add `key[]=<labels>` to the shape key, and write
  them with a subquery so row cardinality stays one per activity:
  `CALL { WITH activity, row UNWIND row.many.attendee AS item MERGE (p:ASObject {id: item.id}) SET p += item.props, p:Person MERGE (activity)-[r:ATTENDED_BY]->(p) SET r += item.edge }`
  with `edge` carrying PARTSTAT/ROLE.
- ICS parser: emit `attendee: Person[]` with `stableKeys: personStableKeys({ emails: [email] })` and `name`; keep the
  `attendees` JSON for details. The owner's own address should be a key of the owner node first, or every event
  creates a Person for the owner.

This touches the shape Cypher owned by the persister thread, so it is left to that thread.

### Planned

- Scheduled sync (see "Running"); incremental `updatedSince` runs plus a nightly full sync.
- Merges: my-hub deletes the secondary person on merge without a tombstone. The next sync puts the secondary's keys
  on the primary; they still point at the secondary's node and show up as `conflictingKeyCount`. Needs a merge log
  in my-hub (`GET /export/person-merges?since`) and a node merge here (re-point relationships, union keys), or the
  persister's planned split into identity keys (`person:myhub:`) and matching keys.
- Splits (unmerge) and deletes: keys stay on the old node; a full sync could mark `MyHubPerson` nodes that my-hub no
  longer returns (`myHubDeletedAt`).
- Owner: my-hub's owner person is a separate node from bytebunker's owner actor; export `ownerPersonId` and attach
  its keys to the owner node.
- Property precedence: activity writes `SET +=` the props of required objects, so a Person emitted by an importer
  (Airbnb host name, WhatsApp display name) overwrites `name` on a `MyHubPerson` node. The persister should keep
  my-hub props authoritative (importer person props only on create, or not on `MyHubPerson` nodes).
- my-hub consuming bytebunker history: look up the node by `person:myhub:<id>` and read its activities (last
  contact from WhatsApp, past events with a person) through bytebunker's search API.

## Not in this round

Google Fit (1.8 GB), Google Contacts vCards (my-hub owns persons), Google Pay, Play Store purchases, Chrome
takeout settings, raw Location History records.

## Known issues found on the way

- Airbnb activity log shows 84 `airlock_suggested:account_login` entries and logins from Shanghai IPs (2021).
