import { Migration } from '@mikro-orm/migrations';

/**
 * The schema as of the first migration (development at de68565). Databases from before migrations were created with
 * `schema:update` and already have it, so this only runs on an empty database.
 */
export class Migration20261022182937_baseline extends Migration {
    override async up(): Promise<void> {
        const [{ exists }] = await this.execute(
            `select to_regclass('public.pipeline_blueprint_entity') is not null as "exists"`,
        );

        if (exists) {
            return;
        }

        this.addSql(`create type "asset_type_enum" as enum ('primary', 'sidecar', 'pipeline');`);
        this.addSql(
            `create type "pipeline_execution_status_enum" as enum ('waiting', 'success', 'failed', 'aborted');`,
        );
        this.addSql(`create type "pipeline_error_status_enum" as enum ('aborted', 'failed');`);
        this.addSql(
            `create type "pipeline_node_execution_status_enum" as enum ('waiting', 'success', 'aborted', 'failed', 'branch-ignored');`,
        );
        this.addSql(`create type "pipeline_module_type_enum" as enum ('normal', 'trigger');`);
        this.addSql(
            `create type "setting_type_enum" as enum ('string', 'textblock', 'number', 'boolean', 'date', 'date-range', 'email', 'file', 'time', 'color', 'string-array', 'number-array', 'custom');`,
        );
        this.addSql(`create type "setting_target_type_enum" as enum ('global', 'user');`);
        this.addSql(
            `create table "asset_entity" ("id" uuid not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "type" "asset_type_enum" not null, "hash" bytea not null, "original_filename" varchar(255) not null, "mime_type" varchar(255) not null, "size" int null, "storage_path" varchar(255) null, "external_url" varchar(2048) null, "text_asset_preview" text null, "metadata" jsonb not null, constraint "asset_entity_pkey" primary key ("id"));`,
        );
        this.addSql(
            `alter table "asset_entity" add constraint "asset_entity_type_hash_unique" unique ("type", "hash");`,
        );

        this.addSql(
            `create table "extension_developer_entity" ("id" uuid not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "name" varchar(255) not null, constraint "extension_developer_entity_pkey" primary key ("id"));`,
        );
        this.addSql(
            `alter table "extension_developer_entity" add constraint "extension_developer_entity_name_unique" unique ("name");`,
        );

        this.addSql(
            `create table "extension_entity" ("id" uuid not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "developer_id" uuid not null, "name" varchar(64) not null, constraint "extension_entity_pkey" primary key ("id"));`,
        );
        this.addSql(`alter table "extension_entity" add constraint "extension_entity_name_unique" unique ("name");`);

        this.addSql(
            `create table "json_schema_entity" ("schema_uri" varchar(255) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "title" varchar(255) not null, "description" varchar(255) not null default '', "json_schema" jsonb not null, "extension_id" uuid not null, constraint "json_schema_entity_pkey" primary key ("schema_uri"));`,
        );

        this.addSql(
            `create table "node_stable_key_entity" ("stable_key" varchar(512) not null, "node_id" varchar(255) not null, constraint "node_stable_key_entity_pkey" primary key ("stable_key"));`,
        );

        this.addSql(
            `create table "pipeline_blueprint_entity" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "title" varchar(255) not null, "description" varchar(255) null, "data" jsonb not null);`,
        );

        this.addSql(
            `create table "pipeline_blueprint_trigger_entity" ("blueprint_id" int not null, "trigger_node_id" int not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "trigger_type" varchar(255) not null, constraint "pipeline_blueprint_trigger_entity_pkey" primary key ("blueprint_id", "trigger_node_id"));`,
        );

        this.addSql(
            `create table "pipeline_execution_entity" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "description" varchar(255) null, "blueprint_id" int not null, "execution_status" "pipeline_execution_status_enum" not null default 'waiting', "error_retry_count" smallint not null default 0, "latest_error_node_id" smallint null, "latest_error_status" "pipeline_error_status_enum" null, "latest_error_message" varchar(255) null, "latest_error_data" jsonb null);`,
        );

        this.addSql(
            `create table "pipeline_execution_data_entity" ("pipeline_execution_id" int not null, "node_id" smallint not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "execution_status" "pipeline_node_execution_status_enum" not null default 'waiting', "data" jsonb null, constraint "pipeline_execution_data_entity_pkey" primary key ("pipeline_execution_id", "node_id"));`,
        );

        this.addSql(
            `create table "pipeline_execution_log_entity" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "pipeline_execution_id" int not null, "node_id" smallint not null, "message" varchar(255) null, "data" jsonb null);`,
        );

        this.addSql(
            `create table "pipeline_module_entity" ("id" varchar(135) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "extension_id" uuid not null, "name" varchar(255) not null, "version" smallint not null, "type" "pipeline_module_type_enum" not null default 'normal', "input_type_schema_schema_uri" varchar(255) null, "output_type_schema_schema_uri" varchar(255) null, constraint "pipeline_module_entity_pkey" primary key ("id"));`,
        );

        this.addSql(
            `create table "pipeline_blueprint_entity_used_modules" ("pipeline_blueprint_entity_id" int not null, "pipeline_module_entity_id" varchar(135) not null, constraint "pipeline_blueprint_entity_used_modules_pkey" primary key ("pipeline_blueprint_entity_id", "pipeline_module_entity_id"));`,
        );

        this.addSql(
            `create table "setting_category_entity" ("key" varchar(64) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "parent_category_key" varchar(64) null, "icon" varchar(32) null, "hidden" boolean not null default false, constraint "setting_category_entity_pkey" primary key ("key"));`,
        );

        this.addSql(
            `create table "setting_entity" ("key" varchar(128) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "type" "setting_type_enum" not null, "parent_category_key" varchar(64) not null, "target_type" "setting_target_type_enum" not null, "validation_schema_schema_uri" varchar(255) not null, "default_value" jsonb null, "required" boolean not null default true, "hidden" boolean not null default false, constraint "setting_entity_pkey" primary key ("key"));`,
        );
        this.addSql(
            `create index "setting_entity_parent_category_key_index" on "setting_entity" ("parent_category_key");`,
        );

        this.addSql(
            `create table "user_entity" ("id" uuid not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "username" varchar(255) not null, "password" varchar(255) null, "deleted_at" timestamptz null, constraint "user_entity_pkey" primary key ("id"));`,
        );
        this.addSql(`alter table "user_entity" add constraint "user_entity_username_unique" unique ("username");`);

        this.addSql(
            `create table "stored_user_session_entity" ("session_id" varchar(255) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "data" jsonb not null, "expires_at" timestamptz not null, "user_id" uuid null, constraint "stored_user_session_entity_pkey" primary key ("session_id"));`,
        );

        this.addSql(
            `create table "setting_value_entity" ("setting_key" varchar(128) not null, "target_user_id" uuid not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "value" jsonb not null, constraint "setting_value_entity_pkey" primary key ("setting_key", "target_user_id"));`,
        );

        this.addSql(
            `alter table "extension_entity" add constraint "extension_entity_developer_id_foreign" foreign key ("developer_id") references "extension_developer_entity" ("id") on update cascade on delete cascade;`,
        );

        this.addSql(
            `alter table "json_schema_entity" add constraint "json_schema_entity_extension_id_foreign" foreign key ("extension_id") references "extension_entity" ("id") on update cascade on delete cascade;`,
        );

        this.addSql(
            `alter table "pipeline_execution_entity" add constraint "pipeline_execution_entity_blueprint_id_foreign" foreign key ("blueprint_id") references "pipeline_blueprint_entity" ("id") on update cascade on delete cascade;`,
        );

        this.addSql(
            `alter table "pipeline_execution_data_entity" add constraint "pipeline_execution_data_entity_pipeline_execution_id_foreign" foreign key ("pipeline_execution_id") references "pipeline_execution_entity" ("id") on update cascade on delete cascade;`,
        );

        this.addSql(
            `alter table "pipeline_execution_log_entity" add constraint "pipeline_execution_log_entity_pipeline_execution_id_foreign" foreign key ("pipeline_execution_id") references "pipeline_execution_entity" ("id") on update cascade on delete cascade;`,
        );

        this.addSql(
            `alter table "pipeline_module_entity" add constraint "pipeline_module_entity_extension_id_foreign" foreign key ("extension_id") references "extension_entity" ("id") on update cascade on delete cascade;`,
        );
        this.addSql(
            `alter table "pipeline_module_entity" add constraint "pipeline_module_entity_input_type_schema_schema_uri_foreign" foreign key ("input_type_schema_schema_uri") references "json_schema_entity" ("schema_uri") on update cascade on delete set null;`,
        );
        this.addSql(
            `alter table "pipeline_module_entity" add constraint "pipeline_module_entity_output_type_schema_schema_uri_foreign" foreign key ("output_type_schema_schema_uri") references "json_schema_entity" ("schema_uri") on update cascade on delete set null;`,
        );

        this.addSql(
            `alter table "pipeline_blueprint_entity_used_modules" add constraint "pipeline_blueprint_entity_used_modules_pipeline__4c45d_foreign" foreign key ("pipeline_blueprint_entity_id") references "pipeline_blueprint_entity" ("id") on update cascade on delete cascade;`,
        );
        this.addSql(
            `alter table "pipeline_blueprint_entity_used_modules" add constraint "pipeline_blueprint_entity_used_modules_pipeline__683e2_foreign" foreign key ("pipeline_module_entity_id") references "pipeline_module_entity" ("id") on update cascade on delete cascade;`,
        );

        this.addSql(
            `alter table "setting_category_entity" add constraint "setting_category_entity_parent_category_key_foreign" foreign key ("parent_category_key") references "setting_category_entity" ("key") on update cascade on delete set null;`,
        );

        this.addSql(
            `alter table "setting_entity" add constraint "setting_entity_parent_category_key_foreign" foreign key ("parent_category_key") references "setting_category_entity" ("key") on update cascade;`,
        );
        this.addSql(
            `alter table "setting_entity" add constraint "setting_entity_validation_schema_schema_uri_foreign" foreign key ("validation_schema_schema_uri") references "json_schema_entity" ("schema_uri") on update cascade;`,
        );

        this.addSql(
            `alter table "stored_user_session_entity" add constraint "stored_user_session_entity_user_id_foreign" foreign key ("user_id") references "user_entity" ("id") on update cascade on delete cascade;`,
        );

        this.addSql(
            `alter table "setting_value_entity" add constraint "setting_value_entity_setting_key_foreign" foreign key ("setting_key") references "setting_entity" ("key") on update cascade on delete cascade;`,
        );
        this.addSql(
            `alter table "setting_value_entity" add constraint "setting_value_entity_target_user_id_foreign" foreign key ("target_user_id") references "user_entity" ("id") on update cascade on delete cascade;`,
        );
    }
}
