# Firefox Sync across multiple devices

The user has Firefox installed on roughly 5–6 machines plus an Android
phone, all signed into the same Firefox account. Understanding what
Sync does and does not do across that fleet matters because it
determines whether we can get away with importing one profile or need
to gather all of them.

## The user's Sync clients

Two sources tell us about the device fleet:

1. **Sync takeout** (April 2024) — `infos.collectionCounts.clients = 9`. The Sync server had 9 client records registered at that point. (One client = one Firefox install on one device. Reinstalling Firefox or re-signing-in creates a new client; old ones aren't always cleaned up, which is why this number is higher than the actual machine count.)

2. **`synced-tabs.db`** on the active dev-edition profile — gives us the *current* device list and a recent history of others that have pushed tab records. Combining its `moz_meta.remote_clients` (the live list of clients Firefox currently sees) with the `tabs` table (which still has stale entries for clients that have since gone quiet) yields:

| device name (as Firefox sees it) | type | machine | status |
| --- | --- | --- | --- |
| `moritz's Firefox on epimetheus` | desktop | epimetheus (this box) — stable channel | live, but profile abandoned 2026-03-14 |
| `moritz's Firefox Developer Edition on epimetheus` | desktop | epimetheus (this box) — dev channel | live, currently active |
| `moritz's Firefox on triton` | desktop | triton | live (in `tabs`) |
| `moritz's Firefox Developer Edition on triton` | desktop | triton | live |
| `morits Firefox auf Triton` | desktop | triton (older install, German locale) | listed in remote_clients, possibly stale |
| `morits Firefox auf calypso` / `Calypso Arch` | desktop | calypso | seen in `tabs` (two separate client IDs — likely a reinstall) |
| `moritzs Firefox auf MacBook-Pro` | desktop | MacBook | seen in `tabs` |
| `Firefox on samsung SM-S936B` / `Firefox on Samsung S25+` | mobile | Samsung Galaxy S25+ | live |
| `student's Firefox on robotiklabor-vm` | desktop | shared lab VM | almost certainly **not** the user's data — exclude |

Net unique machines: epimetheus, triton, calypso, MacBook-Pro,
Samsung S25+ → ~5 machines, ≥7 distinct Firefox profiles.

Most of these have their own `places.sqlite` — and because of how Sync
handles history (next section), each one likely contains visits the
others don't.

## What Sync actually moves between devices

Firefox Sync uses an end-to-end-encrypted store on Mozilla's servers.
Each "engine" syncs one collection. The takeout's `collectionCounts`
header lists every collection the user's account has on the server:

```
clients, crypto, meta, tabs,
bookmarks, history, addons, prefs,
forms, passwords, extension-storage
```

Behavior per collection:

- **bookmarks** — full state, hierarchical, with tombstones for deletes. Every device ends up with effectively the complete set; this is why both local profiles have ~870 bookmarks and the Sync takeout has 812 live records (the small delta is just bookmarks added between April 2024 and now).

- **history** — *not* a full mirror. Each client uploads a recent slice of its visits and pulls down what other clients uploaded. The server enforces per-collection size limits, and the Firefox client only pushes a limited number of newest visits per sync cycle. Empirically: the takeout reported `history = 14 095` records server-side in April 2024 even though this single machine's stable profile has 350 K local visits. So **the server's history view is an order of magnitude smaller than the union of local histories**. Visits older than the server retention window only exist on the device that originally recorded them.

  Mozilla's published docs (`mozilla-services.readthedocs.io`) describe the history record format but do not state the retention numbers. Treat the exact limit as unknown; just know that "Sync gives me everything from every device" is wrong.

- **tabs** — only the *currently open* tabs per client. Ephemeral; not useful for an archive.

- **clients** — one record per Sync install, used to identify the fleet (this is what `synced-tabs.db.moz_meta.remote_clients` reflects).

- **forms, passwords, addons, prefs, extension-storage** — out of scope for the page-visit/bookmark archive.

## Implications for the bytebunker import

1. **Bookmarks: any one profile is enough.** All profiles converge on the same bookmark set (live + tombstones), differing only by the small lag since the last sync. The simplest source is the active dev-edition `places.sqlite`. The Sync takeout from April 2024 is a useful additional snapshot if we want a frozen reference point.

2. **History: we need every device's `places.sqlite` to be complete.** Importing just the local dev profile would give us 108 K visits going back to 2019; the local stable profile adds another 350 K mostly-overlapping visits going back to late 2023. The other machines (triton, calypso, MacBook, Android) almost certainly hold visits that *neither* of these has, because Sync's history retention is bounded.

3. **No device-of-origin attribution is preserved** in `moz_historyvisits` once a visit has been merged in via Sync. The `source` column is `VISIT_SOURCE_*` (organic / searched / bookmarked), not "from device X". The `clients` collection in Sync names the device, but individual *visit* records do not carry that name. Best we can do downstream is "this visit was first observed by profile X" — and even that requires we keep the import-source label per row.

4. **Dedup is the importer's responsibility — but bytebunker already handles event dedup.** Same `(url, visit_date)` will arrive multiple times if multiple profiles all sync'd it; the existing dedup will collapse those. We just need the importer to emit deterministic-keyed events from each source and let the platform sort it out.

5. **Android is the awkward one.** Mozilla Firefox for Android (`org.mozilla.firefox`) keeps its profile in app-private storage at `/data/data/org.mozilla.firefox/files/mozilla/<profile>.default/`. To get `places.sqlite` off the device, options are:
   - `adb backup` of the app data (requires the app to allow backups; recent Firefox builds have varied here).
   - Use Firefox for Android's built-in profile-export (limited; mainly bookmarks).
   - Rely on what's already been pushed up via Sync — i.e. accept that Android-only history older than the Sync window is lost.

## Suggested phased plan

| Phase | Sources | Coverage we get |
| --- | --- | --- |
| 1 | local stable + dev `places.sqlite` + Sync takeout bookmarks | ~95% of bookmarks, ~6 years of history weighted heavily toward this machine |
| 2 | `places.sqlite` collected from triton, calypso, MacBook-Pro | adds machine-local visits beyond the Sync window for each of them |
| 3 | Android `places.sqlite` (or accept what Sync already merged) | mobile-only visits, if they can be extracted |
| later | `bookmarkbackups/` series across all machines | bookmark add/remove timeline, if needed |

Each phase reuses the same importer code path — the only thing that
changes is the file we point it at, and ideally an "import_source"
label (machine name + profile path) so the archive remembers where each
visit was first seen.
