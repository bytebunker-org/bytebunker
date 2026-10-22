import { Migration } from '@mikro-orm/migrations';

/**
 * Dry runs and the trigger asset on pipeline executions, shipped (code-defined) blueprints, custom places.
 *
 * Idempotent: development databases got these columns by hand (`schema:update`) before migrations existed.
 */
export class Migration20261022182949_pipeline_dry_run_shipped_blueprints_custom_places extends Migration {
    override up(): void {
        this.addSql(
            `create table if not exists "custom_place_entity" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "name" varchar(255) not null, "latitude" double precision not null, "longitude" double precision not null, "radius_meters" int not null default 75, "role" text check ("role" in ('home', 'work', 'other')) not null default 'other', "valid_from" date null, "valid_to" date null, "notes" text null);`,
        );

        this.addSql(
            `alter table "pipeline_blueprint_entity" add column if not exists "key" varchar(255) null, add column if not exists "shipped_hash" varchar(64) null;`,
        );
        this.addConstraintIfMissing(
            'pipeline_blueprint_entity_key_unique',
            `alter table "pipeline_blueprint_entity" add constraint "pipeline_blueprint_entity_key_unique" unique ("key")`,
        );

        this.addSql(
            `alter table "pipeline_execution_entity" add column if not exists "trigger_asset_id" uuid null, add column if not exists "dry_run" boolean not null default false;`,
        );
        this.addConstraintIfMissing(
            'pipeline_execution_entity_trigger_asset_id_foreign',
            `alter table "pipeline_execution_entity" add constraint "pipeline_execution_entity_trigger_asset_id_foreign" foreign key ("trigger_asset_id") references "asset_entity" ("id") on update cascade on delete set null`,
        );
        this.addSql(
            `create index if not exists "pipeline_execution_entity_trigger_asset_id_index" on "pipeline_execution_entity" ("trigger_asset_id");`,
        );
    }

    override down(): void {
        this.addSql(`drop table if exists "custom_place_entity" cascade;`);

        this.addSql(
            `alter table "pipeline_execution_entity" drop constraint if exists "pipeline_execution_entity_trigger_asset_id_foreign";`,
        );
        this.addSql(`drop index if exists "pipeline_execution_entity_trigger_asset_id_index";`);
        this.addSql(
            `alter table "pipeline_execution_entity" drop column if exists "trigger_asset_id", drop column if exists "dry_run";`,
        );

        this.addSql(
            `alter table "pipeline_blueprint_entity" drop constraint if exists "pipeline_blueprint_entity_key_unique";`,
        );
        this.addSql(
            `alter table "pipeline_blueprint_entity" drop column if exists "key", drop column if exists "shipped_hash";`,
        );
    }

    /** Postgres has no `add constraint if not exists`. */
    private addConstraintIfMissing(name: string, statement: string): void {
        this.addSql(
            `do $$ begin if not exists (select 1 from pg_constraint where conname = '${name}') then ${statement}; end if; end $$;`,
        );
    }
}
