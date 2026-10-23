# Hand-off: my-hub as a live source for bytebunker

_2026-10-23. Brief for an agent working in the **my-hub** repo (`~/dev/my-hub`). Paths are relative to
`apps/backend/src` unless they start with `apps/`._

## Context

bytebunker is the owner's personal history warehouse: a separate NestJS app that keeps a graph (Neo4j) of
everything that happened, imported from data exports and live sources. my-hub stays the place where data is curated
and used day to day. Decisions taken by the owner:

- my-hub is the source of truth for persons, relationships, the current calendar, the journal and fitness.
  bytebunker mirrors them and keeps their history, including things my-hub deletes or merges.
- my-hub is bytebunker's **only** live source for Spotify, email, Immich photos, weather and the phone feed
  (calls, messages). my-hub's importers must therefore store everything the upstream APIs give, not just what the
  hub UI needs.
- bytebunker only ever **reads** from my-hub. my-hub never reads bytebunker's database and bytebunker never writes
  to my-hub.
- Everything is copied, including sensitive facts, private notes and journal text. my-hub must send the
  sensitivity flags it has; bytebunker hides sensitive data by default.

Both apps run on the same host (`titan`, Coolify), in separate containers and networks: bytebunker's backend is on
the `coolify` network, my-hub's stack on `my-hub-network`.

## Rules

- Do not call or configure anything on `*.syscy.de` from a worktree or test. Worktrees keep the export webhook off.
- Do not change the existing UI behaviour of any module unless a work package says so.
- Every new endpoint lives under `/export/*` and is read-only.
- Follow `AGENTS.md`: MikroORM migrations by hand, `TimestampEntity`, stable ids `plugin:entity_type:external_id`.

## Starting point

Branch `feat/bytebunker-person-export` (worktree `~/dev/my-hub-wt-bytebunker-export`, commit `43c693a6`, not pushed)
adds `export/` with `GET /export/persons`, `GET /export/calendars`, `GET /export/calendars/:slug/ics`. It is 115
commits behind `main`. Rebase it first; check that `CalendarStoreService.listCalendars/findCalendar/listObjects` and
`combineCalendars` (`backup/backup-ics.util.ts`) still match `main`. Keep its DTO (`ExportedPersonDto`); the feed
below reuses it as the person payload.

## Transport (decided)

Same host, different containers. Recommended and decided:

1. **Pull is the truth.** bytebunker reads a cursor feed `GET /export/changes?after=<cursor>` with a scoped token.
2. **Push is a hint.** After a commit that produced feed rows, my-hub sends a small signed webhook
   `{ "cursor": "<latest>" }` to bytebunker. bytebunker debounces and pulls. A lost hint costs nothing; bytebunker
   also pulls every 15 minutes.
3. Both calls go over an **internal Docker network**, not the public internet: attach my-hub's backend container to
   an external network `bytebunker-link` (also joined by bytebunker's backend). URLs are then
   `http://<my-hub-backend-container>:11000` and `http://bytebunker-backend:12100`. Public URLs stay as a fallback
   if the apps are ever split across hosts.

Considered and rejected: bytebunker reading my-hub's Postgres directly (read-only role, `LISTEN dav_change`). It is
faster to build but couples bytebunker to my-hub's table layout and migrations, and breaks once the apps move
apart. The HTTP contract below keeps the schemas independent.

## WP1 — Scoped export token

Today `ApiKeyGuard` (`shared/auth/api-key.guard.ts`) accepts one global admin key for every route.

- Add an `export_token` entity: `id`, `name`, `tokenHash` (scrypt or sha256 of a 32-byte random token), `scopes
  text[]` (`export:read`, later `export:media`), `lastUsedAt`, `revokedAt`.
- Add `ExportTokenGuard` on the `export` controllers. It accepts an export token with the matching scope **or** the
  admin key. Export tokens are rejected on every other route: `ApiKeyGuard` must not accept them.
- Token management: a CLI or settings action that prints the token once, plus revoke.
- Config: none. Tokens live in the DB.

Acceptance: an export token gets 200 on `/export/*` and 401 elsewhere; a revoked token gets 401; `lastUsedAt` updates.
Tests: guard unit tests (scope match, revoked, admin key, wrong route).

## WP2 — Change feed (`export_change` outbox)

### Table

```sql
CREATE TABLE export_change (
  seq           bigserial PRIMARY KEY,
  entity_type   text        NOT NULL,   -- 'person', 'relationship', 'spotify_play', ... (list in WP9)
  entity_id     text        NOT NULL,   -- my-hub id as text
  op            text        NOT NULL,   -- 'upsert' | 'delete' | 'merge'
  merged_into_id text,                  -- for op = 'merge': surviving entity id
  changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON export_change (changed_at);
```

### Writers

- A MikroORM `EventSubscriber` with `onFlush` (pattern: `plugin/contacts/contact-change.tracker.ts`) records one row
  per changed entity of an exported type, in the same transaction.
- **Child rows record their parent.** Changes to `person_email`, `person_phone`, `person_impp`, `person_address`,
  `person_url`, `person_date`, `contact_handle` write `('person', <personId>, 'upsert')`. This fixes the
  `updatedSince` gap of the export branch.
- `PersonMergeService.mergePersons` (`person/person-merge.service.ts`): one row `('person', secondaryId, 'merge',
  merged_into_id = primaryId)`, plus `upsert` rows for the primary and for every entity the merge participants
  re-pointed with raw SQL (raw SQL bypasses `onFlush`). Write the merge row in each `PersonMergeParticipant`'s
  transaction, not after it.
- Hard deletes (`PersonService.remove`, every friends-module delete, email deletes in sync): `delete` rows. `onFlush`
  sees removals; `nativeDelete` calls need an explicit write.
- Unmerge (`POST persons/:id/unmerge`): `upsert` rows for both persons.
- Collapse duplicates per flush: one row per (type, id, op).

### Endpoint

`GET /export/changes?after=<cursor>&limit=500&types=person,relationship`

- The cursor is opaque to the client: base64 of `{ "e": <export_change.seq>, "d": <dav_change.seq> }`, so calendar
  objects, tasks and contact cards from the existing `dav_change` table come through the same stream. `after`
  omitted = from the start of retention.
- Rows are ordered by `changed_at`, then by source, then by seq; both sequences only grow.
- Payloads are inlined so the client needs no follow-up request: the current entity (same shape as the snapshot
  endpoints) for `upsert`, the raw `.ics` for calendar objects.
- `nextCursor` always points past the last returned row; `hasMore` tells whether to call again.
- **Retention**: keep rows 30 days (purge job next to the existing cron jobs). A cursor older than the oldest row →
  `410 Gone` with `{ "error": "cursor_expired" }`; the client then runs a full snapshot and restarts from
  `GET /export/changes/head` (returns the current cursor).

Example response:

```json
{
  "items": [
    { "seq": "e:1042", "entityType": "person", "entityId": "17", "op": "upsert", "changedAt": "2026-10-23T10:01:12Z",
      "data": { "id": 17, "displayName": "Anna Example", "emails": ["anna@example.org"], "phones": [{ "value": "0151 …", "normalizedValue": "+49151…" }],
                "handles": [{ "platform": "whatsapp", "key": "key:…", "displayName": "Anna", "number": "+49151…" }],
                "sensitivity": "normal", "updatedAt": "2026-10-23T10:01:12Z" } },
    { "seq": "e:1043", "entityType": "person", "entityId": "23", "op": "merge", "mergedIntoId": "17", "changedAt": "2026-10-23T10:02:00Z" },
    { "seq": "d:88120", "entityType": "calendar_object", "entityId": "4711", "op": "upsert", "changedAt": "2026-10-23T10:03:00Z",
      "data": { "calendarSlug": "personal", "uid": "abc@google.com", "ics": "BEGIN:VCALENDAR…END:VCALENDAR" } },
    { "seq": "d:88121", "entityType": "calendar_object", "entityId": "4712", "op": "delete", "changedAt": "2026-10-23T10:03:05Z",
      "data": { "calendarSlug": "personal", "uid": "old@google.com" } }
  ],
  "nextCursor": "eyJlIjoxMDQzLCJkIjo4ODEyMX0",
  "hasMore": false
}
```

### Snapshots and vocabulary

- `GET /export/<type>?cursor=<updatedAt,id>&limit=500` per exported type: keyset paging on `(updated_at, id)`
  (add an index per table), replacing the offset paging of the branch. Used for the first load and the nightly
  reconcile.
- `GET /export/vocabulary`: `RelationshipType` with `RELATIONSHIP_TYPES` metadata (`friends/relationship/
  relationship.enums.ts`), `DatePrecision`, fact enums (`friends/fact/fact.enums.ts`), the `taxonomy_type` rows
  (life event, activity, gift), phone enums (`plugin/phone/phone.enums.ts`), `PersonKind`, `Gender`.
- `GET /export/owner`: `ownerPersonId` (from `AppConfig`) and its export payload.

Acceptance: editing only a person's email produces a person row; a merge produces one merge row and upserts for the
primary; deleting a note produces a delete row; a calendar edit through CalDAV appears in the same feed; an expired
cursor returns 410. Tests: subscriber unit tests per writer, endpoint e2e with two sources interleaved, retention.

## WP3 — Hint webhook

- On commit of a flush that wrote feed rows (and on `NOTIFY dav_change`), enqueue a `bytebunker-hint` job in the DB
  job queue (`job/`), coalesced: at most one pending hint job, `scheduledAt = now + 1 s`.
- The processor POSTs to `config.bytebunker.hookUrl` with body `{ "cursor": "<head cursor>", "sentAt": "…" }` and
  headers:
  - `X-Hub-Timestamp: <unix seconds>`
  - `X-Hub-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + rawBody)>`
  The receiver rejects timestamps older than 5 minutes. Retries: 5 attempts with backoff, then drop. The next hint or
  bytebunker's 15-minute pull catches up.
- Config: `bytebunker.hookUrl`, `bytebunker.hookSecret`, `bytebunker.hookEnabled` (default `false`). Worktrees and
  tests keep it off (`t3.json`, `docs/WORKTREES.md`).
- Docker: document in `docs/` how to attach the backend to the external network `bytebunker-link` in Coolify.

Acceptance: 20 edits within a second send one hint; a wrong secret fails verification in the provided test helper;
disabled config sends nothing. Tests: processor with a mocked HTTP server, signature helper.

## WP4 — Spotify: capture everything, export it

The current sync (`plugin/spotify/spotify-sync.service.ts`, `syncListeningHistory`, every 15 minutes) loses data:

- It calls `/me/player/recently-played?limit=50&after=<lastHistorySyncedAt>` and then sets the cursor to
  `DateTime.now()` instead of the newest `played_at` it received (the code comment says otherwise). A track that
  ends between the request and the flush is skipped.
- `recently-played` returns at most the last 50 tracks. If the job is down for a few hours, the gap is lost for
  good, and nothing reports it.
- Podcast episodes and audiobooks never appear in `recently-played`.
- Stored per play: `track`, `playedAt`, `contextType`, `contextUri`. Dropped: device, shuffle and repeat state,
  played duration, skips, the raw item.
- `spotify_play_history.played_at` is unique on its own; two devices can legitimately collide.

Changes:

1. **Playback sampler.** A job polling `/me/player` (reuse `getCurrentlyPlaying`'s cache and rate limiter in
   `spotify-api-client.service.ts`) every 15–30 s while something plays, every 2–5 min when idle. It writes
   `spotify_playback_segment` rows: `itemUri`, `itemType` (track, episode, audiobook chapter), `deviceId`,
   `deviceName`, `deviceType`, `contextUri`, `shuffle`, `repeat`, `startedAt`, `endedAt`, `progressStartMs`,
   `progressEndMs`, `msPlayed` (summed observed progress), `endReason` (`next_item`, `paused`, `stopped`, `unknown`),
   `skipped` (ended before 30 s or before 80 % with a new item), `raw` jsonb (last sample).
2. **Recently-played stays as the authority for tracks.** Keep the job, but:
   - cursor = max `played_at` received;
   - store the raw item (`raw` jsonb) and `context`;
   - unique on `(played_at, track_uri)`;
   - link each play to the segment of the same URI that ended within ±30 s of `played_at` (`segmentId`), which
     gives `msPlayed`, device and skip for it.
3. **Episodes** come only from the sampler (plus optionally `/me/episodes` and show progress); store them with
   `spotify_episode` metadata (show, duration).
4. **Gap detection.** If the oldest item of a `recently-played` response is newer than the stored cursor and the
   response had 50 items, record a `spotify_history_gap (from, to)` row and raise a data-health suggestion. The gap
   is filled later by the owner's Extended Streaming History export on the bytebunker side.
5. **Export.** Feed types `spotify_play` (one row per play or segment, joined data: track or episode metadata with
   URIs, artists, album, `durationMs`, `playedAt`, `msPlayed`, device, context, shuffle, skipped, source
   `recently_played|sampler|both`) and `spotify_history_gap`.

How bytebunker deduplicates against later exports (no work in my-hub, but keep these fields): the export key is
end time + URI + `ms_played`. Live plays get their own key `spotify:live:<playedAt>:<uri>`; when an export arrives, a
bytebunker module links each export row to the live play with the same URI and an end time within ±30 s, and keeps
one node. So `playedAt` must be the end time Spotify reports, URIs must be full `spotify:track:…`/`spotify:episode:…`
URIs, and `msPlayed` should be the observed value, not the track duration.

Acceptance: a play is never lost while the job runs; an outage longer than 50 tracks produces a gap row; episodes
appear; every exported play has a full URI, `playedAt` and `msPlayed` where known. Tests: cursor logic, segment
stitching from a scripted sequence of `/me/player` samples (pause, skip, device switch), gap detection.

## WP5 — Email: text export with deep link

`email_message` (`plugin/email/entities/email-message.entity.ts`) already stores `bodyMarkdown` and lazy `bodyHtml`.
There is no mail page in the hub frontend, but `webLink` (Outlook web link) is stored.

- Feed type `email_message`: `messageId`, `graphId`, `folder`, `subject`, `from`, `to`, `cc`, `bcc`, `sentAt`,
  `receivedAt`, `isRead`, `isFlagged`, `hasAttachments`, attachment names and sizes, `textContent` (plain text derived
  from `bodyMarkdown`, quoted replies and signatures stripped where `email-html.util.ts` can tell, capped at 100 kB),
  `webLink`, and `hubUrl` (see below). No HTML, no attachment bodies.
- `GET /export/email/:messageId/html` (scope `export:read`) returns the stored HTML so bytebunker can show the full
  mail without copying it.
- Optional: a minimal `/(app)/mail/[id]` page in the frontend so `hubUrl` opens in the hub; until then `hubUrl` is
  null and bytebunker links `webLink`.
- Deletes in the sync (`email-sync.service.ts` counts `deleted`) write `delete` rows; bytebunker keeps the history.

Acceptance: a new mail appears in the feed within one sync; HTML is retrievable by `messageId`. Tests: text
extraction on fixtures (HTML, quoted reply, signature).

## WP6 — Immich: export the mirror, serve thumbnails

my-hub already caches Immich metadata (`immich_asset`, `immich_person`, `immich_memory`) and keeps a local
400 px AVIF thumbnail per asset as an `asset` sidecar (`asset/processor/thumbnail-job.processor.ts`,
`sidecar_label = 'thumbnail'`, linked by `immich_asset.asset_key`). `GET /assets/:key?sidecar=thumbnail` is a
`@Public()` route (`asset/asset.controller.ts`); `GET /immich/assets/:id/preview` streams Immich's preview for cached
assets. bytebunker will not copy thumbnails; it stores the URLs.

- Feed type `immich_asset`: `immichAssetId`, `stableId`, `type`, `fileCreatedAt`, `localDateTime`, timezone, GPS,
  city/country if cached, `isFavorite`, `isArchived`, `checksum`, people (`immichPersonId` and linked `personId`),
  `thumbnailUrl` (`/assets/<assetKey>?sidecar=thumbnail`, relative), `previewUrl`
  (`/immich/assets/<id>/preview`), and the Immich web URL for the original.
- Feed type `immich_person`: `immichPersonId`, `name`, `personId` (hub person), `isHidden`. This lets bytebunker
  resolve faces to `person:myhub:<id>`.
- Media scope: `GET /export/media/immich/:id/thumbnail` and `/preview`, guarded by `export:media`, so bytebunker's
  frontend can proxy them without relying on the public asset route. If asset keys are guessable, also note it for
  the owner: `/assets/:key` is public.

Acceptance: every cached asset is in the snapshot with a working thumbnail URL; face-to-person links are exported.
Tests: DTO mapping, media guard.

## WP7 — Weather

`weather/` stores forecasts for one fixed location (settings `weather.latitude/longitude`) from Open-Meteo or Bright
Sky (`weather/providers/`). Hourly rows are pruned after 24 h; daily rows stay a year and hold the **last forecast**,
not observations (`weather-sync.service.ts`, `pruneStaleRows`).

- Before pruning, snapshot the hourly rows of the past 24 h into `weather_observation_hourly` (location, provider,
  all fields, `isForecast = true` if the provider gives no observation). Bright Sky's `/weather` endpoint returns DWD
  observations for past hours: prefer it for the snapshot when the location is in Germany.
- Feed types `weather_hourly_observation` and `weather_daily` (with location and provider).

bytebunker adds historic weather for every place the owner has been on its own; my-hub only provides its own
recent data. Acceptance: no hour of the configured location is lost after the change. Tests: prune keeps snapshots.

## WP8 — Phone feed: message content

The Android plugin (`apps/native/src-tauri/plugins/myhub-android/android/src/main/java/de/syscy/myhub/plugin/`) has
`MessengerListenerService` and `MessengerNotificationParser`, which record who wrote when and **deliberately drop
the message text** ("metadata only"). Signals reach the backend through `POST phone/ingest`
(`plugin/phone/phone-ingest.service.ts`), bursted into one `contact_signal` per sender and 30 minutes.

- Owner decision: capture message text too, store it, do not show it in the hub UI by default, export it.
- Parser: from `MessagingStyle` messages, keep `text` (and `dataMimeType`/`dataUri` as a marker only), with sender and
  timestamp. Dedupe repeated notifications of the same message (key: conversation + sender + timestamp + text hash).
  Group summary notifications and "N new messages" placeholders are skipped. A setting (`Settings.messageTextEnabled`,
  off by default) gates it on the phone.
- Backend: a new `contact_message` table (`clientId` unique, `handle`, `person`, `platform`, `conversationKey`,
  `conversationTitle`, `isGroup`, `direction`, `occurredAt`, `text`, `textHash`), separate from the bursted
  `contact_signal` rows, with `sensitivity = 'private'`. The ingest zod schema gets an optional `text`.
- Known limits to document: only messages that produced a notification (not ones read in the open app), outgoing
  only when replied from the notification, possibly truncated text.
- Feed types `contact_signal`, `contact_message`, `phone_call`.

Acceptance: with the setting on, a WhatsApp message arrives once with its text; with it off, nothing changes.
Tests: parser fixtures for MessagingStyle, group and summary notifications; ingest dedupe.

## WP9 — Everything else in the feed, with sensitivity

Add these entity types to the subscriber and snapshots. Every payload carries `sensitivity`:
`normal` | `private` | `secret`.

| Entity type | Source | Sensitivity |
|---|---|---|
| `person` (+ child rows, handles) | `person/` | `normal`; hidden persons as is, plus `isHidden` |
| `relationship` | `friends/relationship/` | `normal` |
| `life_event`, `activity` (friends), `gift`, `phone_call`, `conversation` (+ messages) | `friends/` | `normal` (`gift` before `given`: `private`) |
| `person_note` | `friends/note/` | `private` |
| `person_fact` | `friends/fact/` | `secret` if `isSensitive`, else `private` |
| `person_contact_detail`, `person_document` (metadata only) | `friends/` | `private` |
| `entity_link` (event/task/journal/photo ↔ person/place) | `shared/links/` | `normal` |
| `calendar_object` | `dav_change` (WP2) | from `CLASS`: `PRIVATE`/`CONFIDENTIAL` → `private` |
| `journal_moment` (+ tags, mood, people, media refs) | `plugin/journal/` | `private` |
| `fitness_workout_session` (+ sets), `fitness_body_metric` | `plugin/fitness/` | `normal` / `private` for body metrics |
| `trip_planner_trip`, `itinerary` (with places) | `trip-planner/`, `itinerary/` | `normal` |
| `cook_session` | `plugin/recipe/` | `normal` |
| `contact_signal`, `contact_message` | `plugin/phone/` | `normal` / `private` |

Not exported: settings, notifications, morning briefs, devices, data health, service links, connections and tokens,
search and AI logs, reminders, duplicate suggestions, Bring shopping.

Acceptance: each type has a snapshot endpoint, appears in the feed on create/update/delete, and carries
`sensitivity`. Tests: one subscriber test per type (shared helper), snapshot paging test.

## Order

WP1 → WP2 (persons + calendar first) → WP3 → WP4 → WP9 (friends) → WP5 → WP6 → WP8 → WP7. Ship each WP as its own PR
against `main`; WP1–WP3 together unblock bytebunker's consumer.
