# Firefox Sync takeout export

Located at `/home/moritz/Documents/Takeout/firefox-sync/`. Two files,
both plain JSON, both dated 2024-04-13.

## File 1 — `firefox-sync-takeout.json` (2.5 MB)

This is what Mozilla produces when you request a Firefox account data
export. It is *not* a full backup of everything Sync stores — it is
essentially "here is the bookmarks collection, plus a header telling you
what other collections exist on the server".

### Top-level shape

```json
{
  "infos": { ... },
  "collections": { "bookmarks": { ... } },
  "bookmarksTree": { ... }
}
```

### `infos`

Contains the API response metadata and, importantly, the
`collectionCounts` reported by the Sync server at export time:

```json
"collectionCounts": {
  "crypto": 1,
  "clients": 9,          // 9 Sync clients (devices/profile installs) ever registered
  "addons": 60,
  "meta": 1,
  "extension-storage": 6,
  "bookmarks": 2793,     // includes tombstones — only ~812 are live
  "history": 14095,      // server-side cap; local profiles have 100K+
  "tabs": 7,
  "passwords": 444,
  "forms": 36414,
  "prefs": 1
}
```

> **Important**: those counts describe what is on the Sync *server*.
> The takeout file itself only carries the `bookmarks` collection. History,
> passwords, forms, etc. are not exported here. To get history, you need
> the local `places.sqlite` files (see `firefox-places-sqlite.md`).

### `collections.bookmarks`

```jsonc
{
  "response": { /* HTTP headers from the sync.services.mozilla.com call */ },
  "records": [
    // 2793 entries total, most are tombstones
    { "id": "-0jtwqYU9JoJ", "deleted": true },
    { "id": "-4M67t9mO9kj",
      "type": "bookmark",
      "parentid": "unfiled",
      "parentName": "unfiled",
      "hasDupe": true,
      "dateAdded": 1598377456649,        // ms since epoch
      "bmkUri":   "http://...",
      "title":    "..." },
    ...
  ]
}
```

Counts:

- **2793** records total
- **1981** are `{deleted: true}` tombstones (i.e. bookmarks that were created and later removed across the user's browsing history → useful if we want to record bookmark *removal* events)
- **812** live records, of which:
  - 775 have `bmkUri` (actual URL bookmarks)
  - 28 have `children` (folders)
  - 9 are separators

Live-record fields seen: `id, type, parentid, hasDupe, parentName, dateAdded, title, bmkUri, children?, pos?, keyword?, tags?`.

The raw `data.payload.ciphertext` is also present per record (Sync stores
everything client-side encrypted), but Mozilla decrypted it for the
takeout and surfaced the result as `cleartext` / the `records` array. We
can ignore the ciphertext blob.

### `bookmarksTree`

Same data as the `bookmarks` collection but rendered as the actual nested
tree (the same shape Firefox uses internally):

```jsonc
{
  "guid": "root________",
  "type": "text/x-moz-place-container",
  "root": "placesRoot",
  "children": [
    { "guid": "menu________",    "title": "menu",     "children": [...] },   // 18
    { "guid": "toolbar_____",    "title": "toolbar",  "children": [...] },   // 96
    { "guid": "unfiled_____",    "title": "unfiled",  "children": [...] },   // 231
    { "guid": "mobile______",    "title": "mobile",   "children": [...] }    //  33
  ]
}
```

Walk counts: 813 nodes total → 775 URL bookmarks (`text/x-moz-place`),
29 folders (`text/x-moz-place-container`), 9 separators
(`text/x-moz-place-separator`). Note the URL count matches the live
records in the collection above.

Per-URL fields: `guid, title, index, dateAdded, lastModified, id,
typeCode, iconUri, type, uri`. Timestamps here are **microseconds** since
epoch (whereas the `collections.bookmarks` records use **milliseconds**).

## File 2 — `bookmarks-2024-04-13.json` (227 KB)

This is just `bookmarksTree` from the takeout above, saved as its own
file. It is what "Bookmarks → Manage Bookmarks → Import and Backup →
Backup…" produces. Identical shape and counts. Redundant with the
takeout if we use `bookmarksTree`, but easier to feed to the importer
alone.

## What's useful from this source

- A single, clean snapshot of the **bookmark tree as of 2024-04-13**, including the four root folders (`menu`, `toolbar`, `unfiled`, `mobile`).
- Stable **Sync GUIDs** for every bookmark and folder — these match `moz_bookmarks.guid` in every local profile, so they are the natural cross-profile identifier.
- A list of **bookmark deletions** as tombstones — gives an "X was deleted at some point before 2024-04-13" signal, but no exact timestamp.

## What's *not* in here

- No history at all (despite `collectionCounts.history = 14095`). The takeout simply omits that collection.
- No passwords, no forms, no addon settings, no open tabs.
- No newer data than 2024-04-13 — we have continued to bookmark things since then. Use local `places.sqlite` for the up-to-date bookmark state.
