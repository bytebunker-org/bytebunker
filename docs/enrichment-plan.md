# Graph enrichment — design

_2026-10-22. Workstream D of `docs/ingest-plan.md`. Builds on the stable-key redesign (C1) and provenance._

Four features, all computed **from the graph, never destructively**: raw imported nodes stay as they are;
enrichment adds nodes and edges that carry `@derived` provenance (generator = the enrichment module +
version, `importExecutionId` of the run). Re-running an enrichment replaces its own previous output, so
thresholds can be tuned and results recomputed.

Each enrichment is a pipeline module, run by a **schedule trigger** (new trigger module: cron) and on demand
from the UI, plus "after import" via a blueprint that chains it behind store-activity.

## What the data already offers

Measured on the corpus (Timeline.json):

- Every visit has `topCandidate.semanticType`: HOME 2,916, WORK 2,626, INFERRED_HOME 233, INFERRED_WORK 162,
  ALIASED_LOCATION 838, SEARCHED_ADDRESS 84, UNKNOWN 9,858. The transform drops this today; keeping it on the
  Arrive activity gives home and work **over time** (moves between homes) for free.
- 1,523 distinct `placeId`s across 16,517 visits.
- `userLocationProfile.frequentPlaces` (10 places, labelled HOME and WORK) and `frequentTrips` (commutes with
  direction, mode distribution, usual start/end minutes).
- Google Maps saved places (`Gespeichert/*.csv`, `Maps (Meine Orte)`) have names for places the user cared
  about.

## 1. Place consolidation

Goal: one place node per real place. Today one café is many `Place` nodes: one per coordinate key (≈1 m)
plus placeId links.

- **Canonical places**: new label `CanonicalPlace` (an `ASObject`), linked from raw places with `SAME_AS`.
  Activities keep pointing at raw places; queries go through `SAME_AS` (or a materialised `AT_PLACE` edge from
  the activity to the canonical place for fast reads).
- **Clustering**: places with the same placeId merge first. Remaining coordinate-only places are clustered
  with DBSCAN-style density clustering (default radius 75 m, min 1), and a placeId cluster absorbs anonymous
  points within its radius.
- **Names and roles**: name from saved places, geocoding (below) or the most frequent visit name. Roles HOME/WORK
  come from visit `semanticType` per time range (`HOME_DURING {from, to}` edges from the owner person), not a
  single "home" flag.
- **Output report**: places before/after, largest clusters, ambiguous merges (clusters spanning >300 m) for
  review.

## 2. Reverse geocoding

- Local **Nominatim** container with region extracts (no calls to outside services from the warehouse).
  Only canonical places are geocoded (≈ a few thousand), so a slow local instance is fine.
- Stored on the canonical place: display name, road, house number, city, postcode, country code, OSM id/type,
  geocoder version. Cached by rounded coordinate; re-geocode on demand.
- **Timezone** per place from an offline lookup library (`geo-tz`), stored on the canonical place and copied
  to activities as `localTimezone`, so the UI can show local times for travel.
- Needs a decision on regions (disk and import time grow with area).

## 3. Derived activities

Each derived node has stable keys from its inputs, so recomputation is idempotent.

- **Trips**: periods away from home (> 100 km from the home place active at that time, or ≥ 1 night
  away). `Travel` activity with start/end, destination canonical places (`TO`), transport modes from the
  moves, and `INCLUDES` edges to the activities inside.
- **Commutes**: moves between HOME and WORK on workdays; aggregated per week in the coverage/insights views.
- **Music on the move**: listens overlapping a move get a `DURING` edge to it ("what I listened to on the
  train to Paris").
- **Calendar confirmed**: an event with a location matched by an arrive at the same canonical place within
  ±1 h gets `CONFIRMED_BY`; events with no matching location data stay unconfirmed (useful for "did I go?").
- **Daily summary** node per day (places visited, distance per mode, listening minutes, events): cheap reads
  for the timeline UI and my-hub.

## 4. Coverage heatmap

- `GET /activities/coverage?from&to&groupBy=source|type` → per day and source: activity count. Sources are the
  generator extensions (google, youtube, spotify, ics, …).
- Frontend: year grid per source (GitHub-style), gaps highlighted, click a day → activity timeline for that
  day. Below it: "exports that could fill gaps" from the takeout inventory (`pnpm ingest:corpus inventory`
  knows the unimported areas).

## Order

1. Keep `semanticType` (and `hierarchyLevel`) on Arrive in the timeline transform — tiny, belongs to C1's
   follow-up.
2. Schedule trigger module + enrichment module skeleton (derived provenance, replace-own-output).
3. Coverage heatmap (no dependencies, immediately useful to judge the rest).
4. Place consolidation → geocoding → derived activities.

## Open questions

- Geocoder regions: which countries (Germany only, or every country with data)? Disk budget for Nominatim?
- Canonical places as new nodes with `SAME_AS` (recommended, non-destructive) vs. merging raw place nodes in
  place?
- Trip thresholds (100 km / one night) and clustering radius (75 m) as defaults, tunable in settings?
- Should derived data (trips, daily summaries) also be exposed to my-hub (morning brief, journal)?
