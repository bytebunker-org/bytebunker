import { MikroORM } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config.js';

/**
 * Applies pending schema migrations, then reports any remaining difference between the entities and the database
 * (a missing migration, or a database changed by hand). Run before the backend starts: `node dist/database/migrate.js`.
 * Exits with 1 when a migration fails, so the container does not start the backend on a half-migrated schema.
 */
async function migrate(): Promise<void> {
    const orm = await MikroORM.init(config);

    try {
        const executed = await orm.getMigrator().up();
        console.info(
            executed.length
                ? `Applied ${executed.length} migration(s): ${executed.map((migration) => migration.name).join(', ')}`
                : 'Database schema is up to date',
        );

        const drift = await orm.schema.getUpdateSchemaSQL({ wrap: false, safe: true });

        if (drift.trim()) {
            console.warn(
                'The database differs from the entities after migrating; create a migration ' +
                    `(pnpm mikro-orm migration:create). Differences:\n${drift}`,
            );
        }
    } finally {
        await orm.close();
    }
}

migrate().catch((error: unknown) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
});
