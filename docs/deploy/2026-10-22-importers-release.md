# Release 2026-10-22: importers, ingest pipeline, enrichment

`development` @ merge "Merge importers for Takeout, browsers, messengers and my-hub into development" plus the two
`.dockerignore` fixes after it.

## What ships

- Ingest pipeline: batched graph writes, large node outputs stored outside JSONB, dry runs, live progress,
  provenance, content-based file routing, `POST /imports` (files and zips), schedule (cron) trigger, failed runs
  marked `failed`, import-folder sweep for files the watcher missed.
- Blueprints ship with the code (`src/extension/extensions/<ext>/blueprints/*.blueprint.json`) and are installed
  or updated on boot; a blueprint edited in the UI is left alone.
- Importers: ICS (rewritten), Spotify Extended Streaming History, Google My Activity (DE/EN), YouTube search
  history, Firefox/Chrome history and bookmarks, WhatsApp chat export, Airbnb data export, Google Maps saved
  places and reviews, Google Timeline / Semantic Location History (updated keys), YouTube watch history (EN added).
- my-hub integration: person sync (`my-hub/persons`), calendar feed (`my-hub/calendar`), `store-objects` core module.
- Enrichment: canonical places, home/work, trips, daily summaries, offline/online reverse geocoding, custom places.
- Frontend: import/coverage/settings pages, cards for the new activity types.

Verified locally: backend typecheck and unit tests (461 pass; the 3 known "should be defined" specs fail as
before), tier-1 over the full takeout corpus (0 errors, 0 conflicting keys), full-corpus e2e (707,539 activities,
~3,400/s, no duplicate nodes), production Docker image builds (`docker build -f apps/backend/Dockerfile .`),
frontend compiles.

## 1. Database schema

Handled by migrations (`docs/MIGRATIONS.md`): the image runs `node ./dist/database/migrate.js` before the backend
starts. On the production database the baseline migration skips itself (the schema exists) and
`Migration20261022182949_pipeline_dry_run_shipped_blueprints_custom_places` adds `custom_place_entity`,
`pipeline_blueprint_entity.key`/`shipped_hash` and `pipeline_execution_entity.dry_run`/`trigger_asset_id`
(idempotent). A failed migration stops the container before the backend starts.

After migrating, the log warns that `asset_entity.parent_asset_id` differs from the entities. That column is not
dropped by anything; leave it until it is clear nothing needs it. Do not run `schema:update --run` any more.

## 1b. Volumes

Besides the existing `data/import`, `data/import-finished` and `data/import-failed` mounts:

| Host | Container | Why |
|---|---|---|
| `/data/bytebunker/import-processing` | `/opt/app/apps/backend/data/import-processing` | Files stay here while their pipelines run; picked up again after a restart. |
| `/data/bytebunker/temp` | `/opt/app/apps/backend/temp` | GeoNames dump cache (`geocoding.dataDir`), so it is not downloaded again after a restart. |

Optional: a host folder at `/tmp` if large Takeout zips are uploaded through the UI (`POST /imports` stages uploads
there).

## 2. Configuration

Backend (`env.yml` / `.env.production.toml` / environment), all optional:

| Key | Purpose |
|---|---|
| `myHub.baseUrl`, `myHub.token` (`MY_HUB__BASE_URL`, `MY_HUB__TOKEN`), `myHub.cfAccessClientId/Secret` | my-hub person and calendar sync. Needs my-hub's `/export` endpoints (my-hub branch `feat/bytebunker-person-export`, deploy that first). |
| `geocoding.dataDir` (default `./temp/geonames`) | GeoNames dump cache for offline reverse geocoding; mount a volume so it survives restarts. |
| `geocoding.nominatimBaseUrl`, `nominatimMinIntervalMs` | Online reverse geocoding (respect the Nominatim usage policy). |
| `geocoding.mapboxAccessToken`, `mapboxBaseUrl`, `mapboxMinIntervalMs` | Mapbox place refinement (temporary geocoding API only). |

Frontend build: the production build needs the `PUBLIC_*` variables available at build time
(`PUBLIC_API_BASE_URL`, `PUBLIC_PRODUCTION_COOKIE_DOMAIN`, `PUBLIC_MAPBOX_*`), e.g. from `.env.production`; without
them `vite build` fails with `MISSING_EXPORT`.

## 3. Graph data

Identity keys changed for ICS (UID + recurrence instance), Spotify (end time + URI + ms played; the old script
blueprint is replaced), Google Timeline/Semantic Location History and places. Importing the same exports again on
top of a graph built with the old keys creates duplicates. Recommended: wipe the graph and `node_stable_key_entity`
(and old pipeline executions) and re-import from the exports; the shipped blueprints are installed on boot.

## 4. Rollout

1. Back up Postgres and the Neo4j volume.
2. Create the host folders from step 1b and add the mounts.
3. Deploy the backend image built from `development`; check that the log shows "Applied 2 migration(s)" (the baseline is
   recorded but changes nothing on an existing database), then `/health`, and "Installed shipped blueprint …" for every extension.
4. Deploy the frontend (`pnpm --filter @bytebunker/frontend run deploy`, with the production env; plain `pnpm deploy` is a different pnpm command).
5. Optional: wipe and re-import (step 3) by uploading exports on the import page or into the import folder.
6. Optional: configure `myHub` and run the `my-hub/persons` blueprint once (`POST /my-hub/sync`).

## Open points

See `docs/import/takeout-import-plan.md` ("Open issues"). Spotify plays keep the IP address (`ipAddress`),
decided 2026-10-23.
