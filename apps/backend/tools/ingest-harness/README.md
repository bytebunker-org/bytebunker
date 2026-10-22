# Ingest harness

Runs real personal-data exports through the import pipelines and reports what comes out. Two tiers:

| Tier          | Command                   | Needs             | What it checks                                                                                                                                                |
| ------------- | ------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — transform | `pnpm ingest:transform`   | corpus only       | Every transform module over every corpus file, no services. Output shape, stable keys, dedup prediction, size, speed. ~10 s for the whole corpus.             |
| 2 — e2e       | `pnpm ingest:e2e --reset` | worktree instance | The real path: file drop → local-file trigger → BullMQ → modules → Postgres + Neo4j. Timings per node, graph deltas, re-import idempotency, graph invariants. |

Run from `apps/backend`. Reports go to `temp/ingest-harness/` (`*-latest.md` plus timestamped JSON).

## Corpus

```sh
pnpm ingest:corpus sync        # copy manifest files from ~/Documents/takeout into temp/ingest-corpus/
pnpm ingest:corpus list        # what maps to which importer
pnpm ingest:corpus inventory   # temp/ingest-harness/inventory.md: what the takeout holds that nothing imports
```

`corpus.manifest.ts` lists each source: takeout glob → importer → path inside the import folder (so the blueprint glob
matches). The takeout folder is only ever read; set `INGEST_TAKEOUT_DIR` to use another one. The corpus is personal data
and stays in gitignored `temp/`.

## Tier 1 — transform

```sh
pnpm ingest:transform
INGEST_ONLY=timeline-2026,spotify-audio pnpm ingest:transform
```

Fails on problems that would make the store step throw or corrupt the stable-key index (unknown relationship property,
missing `@type`/actor/startTime, keys over 512 chars, transform exceptions), and on key conflicts above the importer's
`maxConflicts` in `corpus.manifest.ts` (activities sharing a key with different content, object keys linking separate
identities; 0 everywhere except one known semantic-history Move). Everything else is reported:

- **Created (today) vs (ideal)**: the persister only skips activities whose keys already exist in Postgres, so
  activities sharing a key inside one file are all written. The gap is duplicate nodes.
- **Dup keys in file / conflicting**: repeated keys; "conflicting" means the activities differ, i.e. the key is too
  coarse and real events would be merged or duplicated.
- **Objects refs → distinct**: object references vs. distinct objects by stable key.
- **Output MB**: size of the JSONB row the transform node writes.
- **Skipped rows**: rows a module skipped and counted instead of failing the file (its `skipped` output), e.g. Spotify
  plays logged twice or rows without a URI.

The importer of a corpus file comes from the manifest (by source id), so moving a source to another importer needs no
re-sync; a new source (e.g. `spotify-video`) needs `pnpm ingest:corpus sync`.

Each run diffs against the previous one.

## Tier 2 — e2e

```sh
tools/worktree/wt.sh setup                 # once per worktree (own DB copy, Neo4j, KeyDB index)
pnpm ingest:e2e --reset --sample 300       # smoke run, first 300 records per JSON export
pnpm ingest:e2e --reset --only timeline-2026 --reimport
pnpm ingest:e2e --reset                    # full corpus
pnpm ingest:e2e --reset --only ics-calendar-2026 --restart-during-import
```

The harness starts its own backend (`nest start`, worktree config) unless `--use-running`; stop any dev backend of this
worktree first, its BullMQ workers would take the jobs. It refuses the main checkout's database and any config
mentioning `syscy.de`.

`--reset` deletes all graph nodes, blueprints, pipeline executions, pipeline asset rows and stable keys of **this
worktree's** instance, then installs the blueprints from `blueprints/`. Without `--reset`, files are imported on top of
what is there and the tier-1 predictions are not compared.

Invariants at the end:

- `nodesNotInStableKeyIndex` — nodes no stable key points at. Each import registers its keys; a node missing from the
  index lost the key to another node, so it is a duplicate.
- `activitiesWithoutActor`, `unconnectedObjects`, `executionsStillWaiting`.

## Adding a source

1. Add a blueprint JSON to `blueprints/` and an `importers` entry in `corpus.manifest.ts`.
2. Add a `corpusSources` entry (and drop it from `knownUnsupported`).
3. Add the module to `moduleFactories` in `lib/run-transform.ts`.
4. `pnpm ingest:corpus sync && pnpm ingest:transform`.
