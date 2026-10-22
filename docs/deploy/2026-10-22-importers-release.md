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

## 1. Database schema (run before starting the new backend)

There are no migrations; this is what `mikro-orm schema:update --dump` reports against a DB at the previous
schema. Run these statements, **not** `schema:update --run`:

```sql
create table if not exists "custom_place_entity" (
    "id" serial primary key,
    "created_at" timestamptz not null default now(),
    "updated_at" timestamptz not null default now(),
    "name" varchar(255) not null,
    "latitude" double precision not null,
    "longitude" double precision not null,
    "radius_meters" int not null default 75,
    "role" text check ("role" in ('home', 'work', 'other')) not null default 'other',
    "valid_from" date null,
    "valid_to" date null,
    "notes" text null
);

alter table "pipeline_blueprint_entity"
    add column if not exists "key" varchar(255) null,
    add column if not exists "shipped_hash" varchar(64) null;
alter table "pipeline_blueprint_entity" add constraint "pipeline_blueprint_entity_key_unique" unique ("key");

alter table "pipeline_execution_entity" add column if not exists "dry_run" boolean not null default false;
```

`schema:update --run` would also drop `asset_entity.parent_asset_id` (a column the code does not know). Leave it
until it is clear nothing needs it.

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
2. Run the SQL from step 1.
3. Deploy the backend image built from `development`; check `/health` and that the log lists
   "Installed shipped blueprint …" for every extension.
4. Deploy the frontend (`pnpm --filter @bytebunker/frontend run deploy`, with the production env; plain `pnpm deploy` is a different pnpm command).
5. Optional: wipe and re-import (step 3) by uploading exports on the import page or into the import folder.
6. Optional: configure `myHub` and run the `my-hub/persons` blueprint once (`POST /my-hub/sync`).

## Open points

See `docs/import/takeout-import-plan.md` ("Open issues"). Notably: Spotify plays store the IP address
(`ipAddress`); decide whether to keep it before the re-import.
