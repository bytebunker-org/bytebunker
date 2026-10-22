# Ingest flow — findings and improvement plan

_2026-10-22. Based on the ingest harness (`apps/backend/tools/ingest-harness/`) run over the takeout
corpus in `~/Documents/takeout`, on branch `feat/ingest-pipeline-test-harness` (= `development` +
harness). The Phase-1 graph-write batching from `docs/roadmap.md` is **not** on `development` yet; it
sits uncommitted in the main checkout. Every number below is for the code without it._

## How the flow works today

1. A file lands in the import folder (`localFileTriggerImportFolder`). A chokidar watcher sees it,
   finds blueprints whose local-file-trigger glob matches, stores the file as a pipeline asset (MinIO,
   deduplicated by content hash) and creates one `PipelineExecution` per matching blueprint. The file
   is then moved to `import-finished`.
2. BullMQ runs the blueprint node by node. Each node's whole output is stored as one JSONB row in
   `pipeline_execution_data_entity`; the next node reads it back.
3. The transform module parses the whole file in memory and returns every activity at once.
4. `store-activity` skips activities whose stable key is already in Postgres, then writes each
   remaining activity with its own Cypher query and its own Postgres transaction.

## What the harness measured

Tier 1 (all 52 corpus files through the transform modules, ~10 s):

| Source                                 | Activities | Written today | Distinct by key | Duplicate keys in one file | Notes                                                                  |
| -------------------------------------- | ---------: | ------------: | --------------: | -------------------------: | ---------------------------------------------------------------------- |
| Timeline.json (2014 → 2026)            |     34,560 |        34,560 |          33,037 |                      1,523 | 52,603 place refs → 26,718 distinct places                             |
| Timeline_old.json                      |     27,901 |            24 |              24 |                      1,140 | older snapshot, dedups cleanly against the new one                     |
| Semantic Location History 2017–19      |      3,765 |         2,165 |           2,164 |                          1 | fills real gaps: 2,116 segments have no Timeline segment within 10 min |
| YouTube watch history (German takeout) |      2,388 |         2,388 |           2,388 |                          0 | parser finds all 2,388 entries in the HTML                             |
| ICS (takeout + 2026 exports)           |        491 |           452 |             353 |                        102 | different events at the same start minute share a key                  |
| Spotify audio (script blueprint)       |    198,912 |       198,862 |         178,123 |                     20,785 | 3 of 19 files fail outright; 2025–2026 history never imports           |

Tier 2 (real pipeline, worktree instance):

- **Duplicates in the graph.** After the 300-record smoke import, nodes that no stable key points to
  (i.e. duplicates): Place 871 of 2,766 (31 %), Audio 1,763 of 5,084 (35 %), Video 89 of 2,061,
  Activity 506 of 11,786.
- **Re-import is idempotent** for activities: every file dropped a second time created 0 activities.
- **Store throughput ~20–40 activities/s** (Spotify ~18/s, YouTube ~25/s, location ~35/s), plus ~4.5 s
  fixed overhead per file. Full Timeline.json: 34,560 activities in 959 s (36/s). Full Spotify history
  ≈ 2–3 h.
- **Tier 1 predicts tier 2.** Full Timeline import: 1,523 activity nodes outside the key index, exactly
  the tier-1 "duplicate keys in file" count. Places: 52,603 nodes for 52,603 references — no place is
  reused within the file; 25,422 of them are duplicates.
- **Failures get stuck.** A transform error leaves the execution `waiting` with `errorRetryCount = 1`
  forever; nothing retries it and it never becomes `failed`. The cloned dev DB holds 22 such executions.
  The source file has already been moved to `import-finished`.
- **Settings fall back to defaults after the cache expires.** Twice, the first file dropped more than
  10 minutes after the last settings lookup (the settings cache TTL) resolved the import folder to the
  setting's default (`./data/import`) instead of the stored value (`./temp/data/import`). The trigger
  could not read the file, could not move it to `import-failed` either, and left it unprocessed in the
  import folder. The cache-miss path in `SettingService.getSettingValues` returns the setting without
  its stored value.
- **Restart loses the import.** Killing the backend while an ICS import ran: after restart the pending
  store job ran before modules were registered, failed with "Invalid internal module identifier
  bytebunker-core:store-activity@1, available modules:" (empty list), and the execution stayed stuck.
  This is exactly how 20 of the 22 stuck executions in the dev DB were created.

## Findings

### Correctness

> **Update (C1, 2026-10-22):** findings 1–4 are addressed for the key design: Spotify module (`spotify` extension),
> ICS keys `ics:<UID>[:<RECURRENCE-ID>]`, nested-visit keys, places by `placeId`. See "Key redesign results" below.

1. **Duplicate activities inside one file.** The persister only skips keys that already exist in
   Postgres. Two activities in the same file with the same key are both written; the key index keeps
   one, the other node becomes unreachable for dedup. Spotify alone produces ~20,800 of these.
2. **Duplicate shared objects inside one import.** Places and tracks referenced by several activities
   in one file get one node per reference (the known `existingASObjectStableKeyMap` bug). 31–35 % of
   Place/Audio nodes are duplicates. The uncommitted Phase-1 batching fixes this.
3. **Stable keys are too coarse, and any-key matching merges unrelated things.**
    - Spotify: key = start + end minute. Skipping through tracks puts several plays in the same minute
      (17,172 conflicting cases), so real plays collide.
    - Spotify: `ts` is when playback **ended** (Spotify's own docs, and the script's own comment); the
      script uses it as start time, so every listen is shifted by its duration.
    - ICS: each event carries `ics:<UID>` **and** a start-minute key. Dedup matches on any key, so two
      different events starting at the same time (e.g. parallel workshops) collapse into one, and
      the same event edited in two calendars duplicates.
    - Arrive/Move: key = start minute only. Google's export contains identical duplicate segments and
      edited segments with the same start but different end; today both get written.
    - Places carry a coordinate key (5 decimals ≈ 1 m) plus a `placeId` key. One placeId shows up with
      several coordinate keys, so it links key groups the persister resolves in arbitrary order.
4. **Spotify script throws on audiobook rows**, failing the whole file. Three files (2025-04 → 2026-06,
   ~25k plays) can never import. One bad row should be skipped and reported, not fail the file.
5. **`skipAlreadyImported` uses a global cutoff** (newest Move/Arrive of any source). Importing a newer
   export first makes every later backfill of older data silently skip.
6. **Localised takeouts don't match the globs.** The German takeout names the files
   `Verlauf/Wiedergabeverlauf.html` and `Kalender/*.ics`; the blueprints expect `watch-history.html`.
   Today the user renames files by hand.

### Reliability

7. **Failed executions never finish.** `holdModuleExecution` leaves the execution `waiting` until
   `errorRetryCount >= 3`, but nothing schedules a retry, so the count stays at 1.
8. **Startup race.** BullMQ workers start in `onModuleInit`; pipeline modules are registered in
   `onApplicationBootstrap`. Jobs left in the queue run before registration and fail with
   "Invalid internal module identifier …, available modules:" (empty list) — 20 of the 22 stuck
   executions in the dev DB; reproduced with `pnpm ingest:e2e --restart-during-import`.
9. **Job enqueued before commit.** `executeBlueprintFromTrigger` adds the BullMQ job inside the
   transaction that creates the execution and relies on a 500 ms delay to win the race.
10. **Files are moved to `import-finished` when the pipeline starts**, not when it succeeds, so a failed
    import looks finished on disk.
11. **Asset dedup trusts the database row.** A re-upload with a known hash reuses the existing asset
    row even if the object is missing from storage ("The specified key does not exist"), so that file
    can never import again. Rows cloned from the production-era DB all point at missing objects.
12. **Settings resolve to defaults on a cache miss** (see above): any feature reading settings after
    10 idle minutes gets defaults — for the trigger that means a lost import.

### Scale

13. **Per-activity writes**: one Cypher round trip and one Postgres transaction per activity.
14. **Whole files and whole outputs in memory and in JSONB.** Timeline produces a 23.5 MB JSONB row,
    each Spotify file 10–16 MB; `executeModule` loads all execution data of the pipeline for every node.
15. **Large `IN` lists.** The dedup lookup binds every key of the file as one parameter list; a file
    with more than ~65k keys exceeds Postgres' parameter limit.

### Tooling

16. Backend unit tests did not run on `development` (vitest 2 with the hoisted Vite 8). This branch
    applies the same vitest 4 bump that is pending in the main checkout. Three stale
    "should be defined" specs still fail on DI.
17. Blueprints lived only in the database (and in untracked JSON in the main checkout). The harness
    now versions them in `tools/ingest-harness/blueprints/`.

### Key redesign results (tier 1, C1)

| Source | Activities | Created (ideal) before → after | Conflicting keys in file | Objects refs → distinct (per file) |
| --- | ---: | ---: | ---: | --- |
| Timeline.json | 34,560 → 34,552 | 33,037 → 34,552 | 1,515 → 0 | 52,603 → 26,718 / 27,255 |
| Timeline_old.json | 27,901 → 27,894 | 24 → 24 | 1,133 → 0 | 42,189 → 20,821 / 21,342 |
| Semantic history 2017–19 | 3,765 | 2,164 → 2,164 | 1 → 1 | 5,769 → 1,981 / 2,454 |
| ICS (both sources) | 491 | 353 → 491 | 100 → 0 | unchanged |
| Spotify audio | 198,912 (3 files failed) → 236,026 | 178,123 → 236,024 | 17,172 → 0 | 198,912 → 67,689 / 236,026 → 86,081 |
| Spotify video (new) | 564 | 564 | 0 | 564 → 258 |

- **Timeline:** every conflict was a parent visit and its nested child (`hierarchyLevel` 1) starting in the same minute.
  Top-level visits keep the start-minute key, nested visits add level + place; identical segments are collapsed. Moves
  have no in-file conflicts with start-minute keys. Evaluated alternatives: start+end minute leaves 1,063 conflicts and
  loses 59 semantic↔Timeline matches (2,223 created instead of 2,164); start+activity type changes nothing for Timeline
  and loses 9 matches. Arrive keeps `semanticType` and `hierarchyLevel`.
- **Places:** `placeId` is the only key of a named place, coordinates (5 decimals) only key anonymous points. Across the
  three location sources: 27,522 → 28,244 places; before, 230 placeIds were merged into 34 nodes through shared
  coordinates. The increase is 526 Move endpoints that sat exactly on a named place's coordinate and no longer merge
  into it; linking those is left to place clustering. Coarser grids for anonymous points would give 9,393 (4 decimals)
  or 2,439 (3 decimals) instead of 26,605, but snapping is not clustering, so it is not used.
- **Spotify:** activity key = end second + URI, object key = URI. 4,811 rows are plays logged twice (same end second and
  URI, mostly differing in `ms_played`/offline fields) and are merged; 1 video row without URI is skipped. A name+artist
  key is not added: 3,290 name+artist pairs span 6,942 track URIs (single vs album versions, 2,092 with different
  albums) and 109 URIs changed name/artist, so any-key matching would merge distinct recordings and chain groups.

## Plan

Each step ends with a harness run; numbers above are the baseline to beat.

### 0. Land what exists

- Commit the Phase-1 batching work from the main checkout (persister UNWIND batching, stable-key index
  service, schema bootstrap, run idempotency). Rerun `pnpm ingest:e2e --reset --sample 300` and the
  full Timeline import: expect throughput up by an order of magnitude and Place/Audio duplicates at 0.
- Add an e2e invariant gate: `nodesNotInStableKeyIndex` must be 0 except where a known issue is listed.

### 1. Reliability (small, independent fixes)

- Mark an execution `failed` on an unexpected module error (or retry with BullMQ `attempts` + backoff
  and only then fail). Add a "retry execution" action. Clean up the stuck rows once.
- Register pipeline modules before workers start: discover in `onModuleInit` of the module service, or
  create workers with `autorun: false` and start them after discovery. Verify with
  `--restart-during-import`.
- Enqueue the first job after the transaction commits (return the execution id and schedule outside,
  or a small outbox).
- Move the file to `import-finished` only when all executions succeeded, to `import-failed` otherwise
  (keep the file in a "processing" folder in between).
- On hash dedup, check the object exists in storage; re-upload if not.
- Fix `getSettingValues` on a cache miss (reproduce: read a setting, wait past the 10-min TTL, read
  again). Read the trigger folders once at bootstrap and on settings change instead of per file.

### 2. Dedup correctness

- Persister: deduplicate inside the batch before writing (group activities and objects by stable key,
  union-find over key sets, first wins), so a file can never create two nodes for one key.
- Key design per source, each with a tier-1 test asserting 0 conflicting keys:
    - Spotify: `ts` (end) + track/episode URI; start = `ts − ms_played`.
    - ICS: `UID` + `RECURRENCE-ID` as the only identity; drop the start-minute key or make it a separate
      "similar event" hint that does not dedup.
    - Arrive/Move: start + end (minute) + type; collapse identical duplicate segments in the transform.
    - Places: `placeId` when present, coordinates only for anonymous points.
- Distinguish "identity" keys (dedup) from "matching" keys (link across sources) in the schema.
- Then wipe and re-import the dev graph from the corpus (`pnpm ingest:e2e --reset`, full).

### 3. Spotify as a real module

Replace the execute-code blueprint with a `spotify` extension (roadmap Phase 2): audio, episodes,
audiobooks, video; per-row errors collected into the execution log instead of failing the file.

### 4. Streaming and chunking

- Transform modules yield chunks (e.g. 5,000 activities); store-activity consumes chunk by chunk.
- Large node outputs go to the asset store, the JSONB row keeps a reference; `executeModule` loads only
  the input rows it needs.
- Chunk the dedup lookup (or use `= ANY($1::text[])`).
- Target from the harness: full corpus (~270k activities) in minutes, peak RSS bounded by chunk size.

### 5. Import UX

- Match files by content as well as by path (sniff JSON keys / HTML title), or ship localised globs
  for German and English takeouts.
- Make `skipAlreadyImported` per source (cutoff per generator), or drop it once imports are fast.
- Report per file: rows read, skipped (with reason), created, existing — the numbers the harness now
  computes externally.

### 6. Next sources (from `pnpm ingest:corpus inventory`)

By value and effort: Spotify video + audiobooks (tiny, same shape) → Airbnb (1.6 MB JSON, new
`Trip`/`Reservation` type) → Chrome history/bookmarks (small JSON) → Contacts VCF (seed `Person`) →
raw Location History records (78 MB, dense GPS) → Google My Activity (106 MB HTML, 30 products) →
Google Fit (1.7 GB, 20k files; decide ownership vs my-hub first). WhatsApp chats need a privacy decision.
Each new source starts as a manifest entry + tier-1 run before any graph write.

## Features

Ideas that build on the fixes above, grouped by what they give you. Each lists what it needs first.

### See an import before it lands

- **Dry run.** Run a blueprint on a file without writing: "would create 33,037, already have 1,523,
  12 rows skipped (reason), 3 keys conflicting", with sample rows. The tier-1 analysis
  (`tools/ingest-harness/lib/analyze-activities.ts`) already computes this; move it into the backend and
  show it in the execution view. _Needs: chunked outputs (plan 4)._
- **Drop zone in the UI.** Upload a file or a whole takeout `.zip` in the browser instead of copying into
  the watch folder. Zips are unpacked and every file is routed on its own.
- **Importer detection by content.** Each transform module declares `detect(file) → confidence`
  (JSON keys, HTML title, CSV header). Unknown files get "looks like Google Fit, no importer yet"
  instead of "no pipeline". Fixes the German file names for free.

### Watch and steer a running import

- **Live progress.** Modules report progress through the BullMQ job (the TODO in
  `PipelineSingleModuleExecutionConsumer`); stream it to the execution page: rows/s, ETA, current chunk.
- **Retry from a node.** "Re-run from here" on a failed node, reusing the stored upstream output.
  `continuePipelineExecution` already has `executeNodeSubtreeId`; it needs an API and a button.
- **Notifications.** Import finished or failed → my-hub notification (or ntfy), with the summary counts.

### Know where every fact came from

- **Provenance.** Store the execution id and source asset on every node and edge the persister creates
  (`importedBy`, `sourceAsset`, row offset). "Where does this listen come from?" becomes one click.
- **Undo an import.** With provenance, delete exactly what execution N created (and its stable keys).
  Makes experiments with new key designs cheap: import, inspect, undo.
- **Reprocess on module upgrade.** Raw files are kept as assets. When a transform module's version
  bumps, offer "reprocess N files with v2" and show the diff (created / removed / changed) before
  applying it. Turns key redesigns (plan 2) into a button instead of a wipe.

### Make the graph richer

- **Place consolidation.** Cluster coordinate-only places within a radius into one canonical place;
  seed names from Timeline's `userLocationProfile.frequentPlaces` and the place-visit `placeId`s.
  Today one café is dozens of nodes.
- **Reverse geocoding.** Name and address for places via a local Nominatim (no external calls from
  the warehouse), plus the local timezone for each activity.
- **Derived activities.** Detect trips (multi-day absence from home), commutes, "home"/"work" from
  dwell time; link listens that happened during a move ("music on the commute"), calendar events with
  the arrival at the same place and time ("confirmed attended").
- **Coverage map.** Per source and day: is there data? A heatmap shows gaps ("no location
  2020-03 → 2020-06") and which export would fill them.

### Make blueprints easier to build

- **Typed edges.** The modules already have JSON schemas for input and output; the editor can refuse
  a connection whose types don't match and show the schema on hover.
- **Inline sample data.** Each node in the editor shows the first rows of its last (or dry-run) output.
- **Generic core modules** so fewer blueprints need inline scripts: filter (date range, predicate),
  map fields, deduplicate, sample, split by type, merge.
- **Blueprints as code.** Ship blueprint JSON with each extension and install or update it on boot
  (the harness already versions them), so a fresh instance can import without clicking anything.
- **Live connectors as triggers.** Cron and webhook triggers next to the file trigger; then Spotify
  recently-played, CalDAV and Immich (lifted from my-hub) become pipelines that keep the history
  current between exports.

### Privacy and safety

- **Field policies.** Spotify rows carry the IP address, and the script stores it on every `Listen`
  node today. A per-source policy (drop / hash / keep) applied by the persister.
- **Synthetic fixtures.** An anonymiser that turns a corpus file into a small fake one with the same
  shape, so the harness checks can run in CI without personal data.

### Suggested order

1. Retry from a node, live progress, notifications — small, and they make the fixes above visible.
2. Provenance → undo → reprocess. They depend on each other and pay off during the key redesign.
3. Dry run + drop zone + detection — the import UX.
4. Place consolidation and geocoding, then derived activities and the coverage map.
5. Editor work and live connectors.

## Execution plan (2026-10-22)

### Done on `feat/ingest-pipeline-test-harness`

- Ingest harness (tier 1 transform, tier 2 e2e), vitest 4.
- Phase-1 graph-write batching ported from the main checkout (fixes in-file and shared-object duplicates).
- Live module progress (Redis, weighted pipeline progress, SSE), dry runs + apply, import report from
  store-activity, provenance on created nodes (`importExecutionId`, `importAssetId`, `importedAt`) and
  `GET /activities/provenance`.
- Module errors mark executions `failed`; jobs wait for module discovery (startup race).
- Content routing (glob → content pattern → `detectFile`), `POST /imports` for files and zips, watcher on the
  same service with folders resolved at boot (settings-cache bug).
- `POST /pipelines-blueprints/validate` for hand-written and AI-generated blueprints.

### Next, by workstream

| # | Workstream | Owner | Depends on |
| - | --- | --- | --- |
| A | Live verification: schema (`dry_run` column), harness update for the new context, e2e smoke + full Timeline benchmark, restart scenario, upload/dry-run/apply through the API | main thread | auth for API calls |
| B1 | Frontend import page: drop zone (files, folders, zips), dry-run toggle, per-file results, apply | agent | backend lib build |
| B2 | Frontend execution page: live progress (overall + per node, status messages), dry-run badge + apply, import report, provenance summary, stop loading full execution data | agent | backend lib build |
| B3 | Frontend blueprint editor: JSON import/export (paste generated blueprints), validate + issue panel, validate before save | agent | B2's node contract |
| C1 | Spotify module (audio, episodes, audiobooks, video; `ts` = end time; per-row errors) and stable-key redesign (Spotify, ICS UID+RECURRENCE-ID, Arrive/Move start+end, places by placeId) | agent | tier-1 corpus |
| C2 | Reliability rest: enqueue after commit, move files when the run ends, asset dedup checks storage, retry-from-node API | agent | — |
| C3 | Chunked outputs: large node outputs as assets, load only needed execution data | later | C2 |
| C4 | Blueprints as code (install shipped blueprints on boot), generic filter/map/dedupe modules | agent | — |
| D | Graph enrichment and new sources: see questions | after answers | C1 |

Agents work in their own git worktrees, run unit tests/typecheck/svelte-check, and hand back commits; the
main thread merges and runs the e2e harness against this worktree's instance.
