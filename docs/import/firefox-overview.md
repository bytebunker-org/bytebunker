# Firefox import — overview

Goal: ingest Firefox bookmarks and browsing history into bytebunker so that
page visits and bookmarking actions show up alongside the other archived
activities.

This file is the index. Detail lives in the sibling files:

- `firefox-takeout-export.md` — what the Firefox account/Sync takeout actually contains
- `firefox-places-sqlite.md` — what the local `places.sqlite` profile databases contain
- `firefox-multi-device.md` — how Sync works across the user's ~6 devices and what that means for the import

## TL;DR of available data

| Source | What it covers | Bookmarks | History | Notes |
| --- | --- | --- | --- | --- |
| `~/Documents/Takeout/firefox-sync/firefox-sync-takeout.json` | Account-level Sync export, April 2024 | yes (812 live + 1981 tombstones) | **no** (only counts are reported in `infos`) | Snapshot of server state on 2024-04-13 |
| `~/Documents/Takeout/firefox-sync/bookmarks-2024-04-13.json` | Standard Firefox bookmark backup, April 2024 | yes (775 URLs in 29 folders) | no | Same data as above but as the in-app tree, with `iconUri` |
| `~/.mozilla/firefox/djuhfx1l.default-release/places.sqlite` | "Stable" Firefox release on this box (`epimetheus`) | 887 URL bookmarks | 248 842 visits, 2020-05-28 → 2026-10-14 | Last used 2026-10-14 |
| `~/.mozilla/firefox/h0f01llj.dev-edition-default/places.sqlite` | Firefox Developer Edition on this box (`epimetheus`) | 890 URL bookmarks | 180 490 visits, 2019-07-23 → 2026-10-22 | Currently active profile |
| `~/.mozilla/firefox/tnp0hbu8.default/places.sqlite` | Old default profile | 4 | 11 visits (2025-02) | Practically unused |
| `bookmarkbackups/*.jsonlz4` in each profile | ~14 dated bookmark backups per profile, biweekly | yes | no | Useful for *when* a bookmark was added/removed, if needed later |
| `synced-tabs.db` | Currently-open tabs on every other Sync client | n/a | n/a (tabs only) | Useful as a device list, not a real source |
| `formhistory.sqlite` | Autocomplete entries from form fields | n/a | n/a | Out of scope for now (12k entries on this box, mostly noise) |
| Other Firefox installs on `triton`, `calypso`, `MacBook-Pro`, the Samsung S25+ | The same flavour of `places.sqlite` as above, just elsewhere | yes | yes | Not yet on this machine — see `firefox-multi-device.md` |

## What the user actually wants archived

Given the project description ("collect nice data on myself for having an
archive with all the actions, like visiting pages, bookmarks etc."), the
in-scope activities are:

1. **Page visits** — every entry in `moz_historyvisits` joined with `moz_places`. Each row is a single visit with a timestamp and a `visit_type` (link click, typed, redirect, reload, etc.). The "View" Activity Streams type is the natural fit.
2. **Bookmark add/move/edit** — entries in `moz_bookmarks` with `dateAdded` and `lastModified` timestamps. Historic bookmark *removals* are also recoverable (tombstones in the Sync takeout, or backup diffs).

Out of scope unless requested later:
- form autofill history, saved passwords, cookies, downloads, addon settings.

## Recommended import strategy (one-line summary, details in the per-source files)

1. Parse `places.sqlite` from **every** Firefox profile that exists on each of the user's machines. That is the only complete history source.
2. Use the Sync takeout's `bookmarksTree` for a clean April-2024 snapshot of the bookmark tree (folder structure with stable Sync GUIDs).
3. Use the per-profile `bookmarkbackups/*.jsonlz4` as additional snapshots if a bookmark add/remove timeline matters.
4. Treat all sources as additive — bytebunker already dedupes events, so feeding the same visit from multiple profiles is safe and is in fact the only way to get full coverage given Sync's history-retention limits (see `firefox-multi-device.md`).

## Importer (2026-10-22)

`browser-history:transform-browser-database` reads `places.sqlite` (and Chrome `History`). Numbers on this box:

| Profile | Visits read | Imported | Redirect hops | Reloads | Framed | Same-ms duplicates | Bookmarks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| default-release | 248 842 | 235 744 | 7 134 | 5 272 | 12 | 675 | 862 |
| dev-edition-default | 180 490 | 169 226 | 5 569 | 4 832 | 3 | 860 | 865 |

67 080 visits appear in both profiles (97% of them 2024–2026), so the two profiles add up to ~338k distinct visits.
See `firefox-multi-device.md` for why the visit key uses milliseconds.

## Open questions for the user

- Do you want me to extend this research to your other machines now (triton, calypso, MacBook, Android), or first wire up the importer for the local profiles and add the rest later?
- Should the Android profile be considered? Mobile Firefox keeps its own SQLite profile in app-private storage; getting it off-device usually means an `adb backup` or the built-in "Backup" feature in `about:config`.
- Should we capture the `bookmarkbackups/` folder series at all, or is "current state of bookmarks + add/remove via tombstones" enough?
