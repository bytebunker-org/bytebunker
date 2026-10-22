# Database migrations

The Postgres schema is managed with MikroORM migrations in `apps/backend/src/database/migrations`. Configuration is
in `apps/backend/src/database/migrations.config.ts`.

## Deploys

The production image applies pending migrations before it starts the backend:

```sh
node ./dist/database/migrate.js && exec node ./dist/main.js
```

- A failed migration exits with code 1, so the backend does not start on a half-migrated schema. Each run is one
  transaction (`allOrNothing`).
- After migrating, the script compares the entities with the database. It logs a warning with the SQL if they still
  differ, e.g. because a migration is missing or the database was changed by hand. Column and table drops are not
  listed.
- Applied migrations are recorded in the `mikro_orm_migrations` table.

## Changing an entity

```sh
cd apps/backend
pnpm mikro-orm migration:create --name <what_changed>   # diff of the entities against migrations/.snapshot.json
pnpm migrate                                            # apply to your (worktree) database
```

Review the generated SQL before committing. Commit the migration together with the updated `.snapshot.json`.

Use `migration:create --blank` for data migrations. Do not run `schema:update --run` any more: changes made with it
are missing from the snapshot, so the next generated migration would not include them.

## The first two migrations

- **`Migration20261022182937_baseline`** is the schema of `development` at `de68565`, before migrations existed.
  - Existing databases were created with `schema:update` and already have this schema, so the migration checks for
    `pipeline_blueprint_entity` and does nothing if the table exists.
  - On an empty database it creates everything.
- **`Migration20261022182949_pipeline_dry_run_shipped_blueprints_custom_places`** adds:
  - `pipeline_execution_entity.dry_run` and `trigger_asset_id`;
  - `pipeline_blueprint_entity.key` and `shipped_hash`;
  - the `custom_place_entity` table.

  It is idempotent (`if not exists`), because development databases already got these columns by hand.

A database that was further behind than `de68565` gets the baseline skipped and only the later migrations applied.
The drift warning after migrating then lists what is missing; add it with a migration.
