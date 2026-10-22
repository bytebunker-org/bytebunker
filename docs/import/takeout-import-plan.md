# Import plan: Takeout, browsers, messengers, Airbnb, calendars

Status: 2026-10-22. Goal: bytebunker as the long-term history log of everything, as far back as data exists.
my-hub keeps serving current, changing data (contacts, calendars, live sync); bytebunker stores the immutable
history and does not promise up-to-date answers for other clients.

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
nodes keyed by their handle (`email:<address>`, `airbnb:account:<id>`, `whatsapp:<export>:<name>`); merging them
with my-hub persons is a later step.

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

## Not in this round

Spotify Extended Streaming History (~280k plays), Google Fit (1.8 GB), Google Contacts vCards, Google Pay,
Play Store purchases, Chrome takeout settings. Spotify is the biggest remaining gain.

## Known issues found on the way

- `pnpm test` in apps/backend fails on a clean tree: vitest 2.1.9 cannot load with Vite 8
  (`__vite_ssr_exportName__ is not defined`). vitest 4.1.8 from the store runs the suites.
- Airbnb activity log shows 84 `airlock_suggested:account_login` entries and logins from Shanghai IPs (2021).
