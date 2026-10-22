# Local Firefox profiles — `places.sqlite`

`places.sqlite` is Firefox's master database for everything related to
URLs the user has interacted with: visit history, bookmarks, keywords,
input history, and per-page metadata. It is the **only** complete source
of browsing history available to us — the Sync takeout (see
`firefox-takeout-export.md`) does not include history.

## Profiles found on this machine (`epimetheus`, re-measured 2026-10-22)

`~/.mozilla/firefox/profiles.ini` lists three profiles. Two are in active
use. (An earlier survey of this notes file saw other profile folders —
`xc88zfrq`, `zd8kpuwk` — with different counts; the numbers below are the
current ones.)

| Path | Edition | `places.sqlite` size | Visits | Date range | Pages | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `djuhfx1l.default-release` | Firefox stable | 81 MB | 248 842 | 2020-05-28 → 2026-10-14 | 114 486 | last used 2026-10-14 |
| `h0f01llj.dev-edition-default` | Developer Edition | 61 MB (+4 MB WAL) | 180 490 | 2019-07-23 → 2026-10-22 | 81 615 | currently active |
| `tnp0hbu8.default` | (old `Profile1`) | 5 MB | 11 | 2025-02 | — | practically unused |

Both active profiles share the same Sync account: `moz_meta` shows
identical `sync/bookmarks/syncid = 75KmE8AHDRlS` and
`sync/history/syncid = l8BjLmH-mN40`.

The dev profile reaches back further in time because it carries
historical visits sync'd from the user's earlier installs.

## Schema (key tables only)

Firefox's official reference: <https://wiki.mozilla.org/Places/Database>.
Below is the subset we actually care about.

### `moz_places` — one row per distinct URL

```
id              INTEGER PRIMARY KEY
url             LONGVARCHAR
title           LONGVARCHAR             -- last seen <title>
rev_host        LONGVARCHAR             -- host reversed for index
visit_count     INTEGER                 -- count of moz_historyvisits rows
hidden          INTEGER                 -- 1 = framed/redirected, do not show
typed           INTEGER                 -- 1 = user typed this URL at least once
frecency        INTEGER                 -- Mozilla's "frequency × recency" score
last_visit_date INTEGER                 -- microseconds since epoch
guid            TEXT                    -- 12-char Sync identifier
foreign_count   INTEGER                 -- number of bookmarks/keywords pointing here
url_hash        INTEGER
description     TEXT                    -- meta description, if extracted
preview_image_url TEXT                  -- og:image, if extracted
site_name       TEXT
origin_id       INTEGER → moz_origins
```

Counts on this box: 181 333 places (default-release) + 49 061 places
(dev-edition). A page only gets a row here once even if visited many
times. ~957 / 947 of these have `visit_count = 0` (orphans — bookmarked
but never opened, or sync'd-in pages).

`description` is populated for 14 796 pages on the stable profile (13 375 on
dev), `preview_image_url` for 12 168 (8 802). These come from Firefox's metadata
extraction (`og:` and `<meta>` tags). They are nice-to-have for the
archive but not always present.

### `moz_historyvisits` — one row per actual visit

```
id                 INTEGER PRIMARY KEY
from_visit         INTEGER → moz_historyvisits.id   -- referrer visit, 0 = none
place_id           INTEGER → moz_places.id
visit_date         INTEGER                          -- microseconds since epoch
visit_type         INTEGER                          -- see table below
session            INTEGER
source             INTEGER                          -- see below
triggeringPlaceId  INTEGER
```

This is the core "page visit" table. Every row is one navigation event.

#### `visit_type` values (Mozilla's `nsINavHistoryService::TRANSITION_*` constants)

| value | name | meaning |
| --- | --- | --- |
| 1 | LINK | clicked a link |
| 2 | TYPED | typed in the URL bar |
| 3 | BOOKMARK | navigated via a bookmark |
| 4 | EMBED | iframe/embed (rarely stored) |
| 5 | REDIRECT_PERMANENT | 301 |
| 6 | REDIRECT_TEMPORARY | 302/303 |
| 7 | DOWNLOAD | started a download |
| 8 | FRAMED_LINK | clicked a link from inside an iframe |
| 9 | RELOAD | refresh |

Distribution on the stable profile (248 842 visits): 82% LINK, 7.7% TYPED,
5.5% REDIRECT_TEMPORARY, 2.4% REDIRECT_PERMANENT, 2.1% RELOAD, 135
DOWNLOAD, 26 BOOKMARK, 12 FRAMED_LINK. Dev edition is the same shape.

Note on redirects: types 5/6 mark the redirect **target** (the page that
was finally shown). The redirect *source* is the visit their `from_visit`
points at, usually on a page Firefox marks `moz_places.hidden = 1`. The
importer therefore keeps 5/6 visits and drops their sources (7 134 on
stable, 5 569 on dev).

#### `source` field

This is **not** a "synced from device X" flag. It is Mozilla's
`VISIT_SOURCE_*` constant indicating *how* the place got into the DB:
`0` = organic visit, `2` = arrived from a search result, `3` = arrived
from a bookmark. There is **no field anywhere in `places.sqlite` that
records which device a sync'd visit came from** — once a remote visit
is merged into the local DB it is indistinguishable from a local one.

Implication: when we import several profiles we cannot attribute a
synced visit to its true device of origin. The best we can do is
"this visit was *seen* by profile X". See `firefox-multi-device.md`.

### `moz_historyvisits_extra`

Schema exists (`visit_id, sync_json`), but **0 rows on both profiles** —
not used here. This is where Firefox would store extra sync metadata per
visit if it had any.

### `moz_bookmarks` — one row per bookmark / folder / separator

```
id            INTEGER PRIMARY KEY
type          INTEGER          -- 1 = URL bookmark, 2 = folder, 3 = separator
fk            INTEGER          -- → moz_places.id (only when type=1)
parent        INTEGER          -- → moz_bookmarks.id of the containing folder
position      INTEGER          -- order within parent
title         LONGVARCHAR
keyword_id    INTEGER → moz_keywords
folder_type   TEXT
dateAdded     INTEGER          -- microseconds since epoch
lastModified  INTEGER
guid          TEXT             -- 12-char Sync identifier (same as in takeout)
syncStatus    INTEGER
syncChangeCounter INTEGER
```

Counts (both profiles are nearly identical, since bookmarks are kept in
sync):

| profile | URL bookmarks | folders | separators | dateAdded range |
| --- | --- | --- | --- | --- |
| default-release | 887 | 36 | 9 | 2015-09-02 → 2026-07-31 |
| dev-edition     | 890 | 36 | 9 | 2015-09-02 → 2026-10-05 |

883 bookmarks share their GUID across both profiles, but only 843 of those
also share `dateAdded`: GUID is the reliable cross-profile identity. No tags
(the tags root is empty), 3 keywords. Live count matches the Sync takeout's 775 + folders + separators within rounding.

### `moz_origins`

One row per `(scheme, host)` pair. 10 730 origins on stable, 3 312 on
dev. Useful for grouping the archive "by site". Mozilla derives this
from `moz_places` automatically.

### `moz_places_metadata` — interaction telemetry per place visit

```
id                  INTEGER PRIMARY KEY
place_id            INTEGER
referrer_place_id   INTEGER
created_at, updated_at
total_view_time     INTEGER  -- ms the tab was foregrounded
typing_time         INTEGER
key_presses         INTEGER
scrolling_time      INTEGER
scrolling_distance  INTEGER
document_type       INTEGER
search_query_id     INTEGER
```

3 313 rows on stable, 9 700 on dev. This is interesting — it is Firefox's
"how engaged was the user with this page" data, fed into the Suggest /
Awesomebar ranking. Could be used to enrich page-visit Activities with a
"dwell time" and "interaction" measure if we want.

`moz_places_metadata_search_queries` is empty on both profiles, so we
have no captured search-query history.

### Tables we can ignore for the import

- `moz_anno_attributes`, `moz_annos`, `moz_items_annos` — only contain `downloads/destinationFileURI` and `downloads/metaData` annotations (16 rows on stable). Captures download targets, not interesting unless we add a downloads importer.
- `moz_keywords` — 3 entries, custom URL bar keywords.
- `moz_inputhistory` — URL bar autocomplete learning data.
- `moz_newtab_*`, `moz_previews_tombstones` — newtab page telemetry, unrelated to user-visible activity.

## Sibling files in each profile worth knowing about

| File | Contents | Useful for the importer? |
| --- | --- | --- |
| `favicons.sqlite` | Cached favicons (`moz_icons`) joined to pages by URL | Yes if we want to render icons in the archive UI without refetching |
| `bookmarkbackups/*.jsonlz4` | Dated bookmark backups, ~14 of them, every 1-2 weeks (lz4-compressed JSON of the same `bookmarksTree` shape as the takeout) | Optional — gives us an add/remove timeline for bookmarks beyond what `dateAdded`/`lastModified` already tell us |
| `formhistory.sqlite` | Autofill values typed into form fields (12 608 rows on dev, 2025-12-28 → 2026-04-27) | Out of scope unless we want to archive search-bar/form input |
| `synced-tabs.db` | Currently-open tabs on every other Sync client, plus the device list | Useful as a cross-reference of which other devices exist (see `firefox-multi-device.md`); the tab data is ephemeral |
| `storage-sync-v2.sqlite` | WebExtension storage sync data | Out of scope |
| `cookies.sqlite`, `logins.json`, `key4.db` | Cookies, saved passwords | Explicitly out of scope — sensitive |

## Practical extraction notes

1. Always **copy the SQLite files before reading** — Firefox keeps them open with WAL journaling, so reading the live file while Firefox is running can either hit a lock or miss the WAL contents. The dev profile shows a non-empty `places.sqlite-wal` of ~4 MB right now. The importer only receives the single `places.sqlite` file, so either close Firefox first (it checkpoints on exit) or snapshot the running profile with `sqlite3 places.sqlite ".backup /tmp/places.sqlite"`. The ingest harness copies `.sqlite` + `-wal` and checkpoints the copy.
2. All timestamps in `places.sqlite` are **microseconds since epoch** (divide by 1 000 000 for unix seconds). The Sync-collection JSON uses **milliseconds** (divide by 1 000). The `bookmarksTree`/backup JSON uses **microseconds**. Don't mix them.
3. URLs starting with `file://`, `about:`, `chrome://`, `moz-extension://` exist in `moz_places`. The importer keeps http(s), ftp and `file:` (385 local-document visits on stable) and skips everything else.
