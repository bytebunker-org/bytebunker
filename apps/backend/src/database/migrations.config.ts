import type { MigrationsOptions } from '@mikro-orm/core';

/**
 * Schema migrations (`src/database/migrations`, compiled to `dist/database/migrations`). Create one after changing
 * an entity with `pnpm mikro-orm migration:create`; the production image applies pending ones on start
 * (`dist/database/migrate.js`).
 */
export const MIGRATIONS_OPTIONS: MigrationsOptions = {
    tableName: 'mikro_orm_migrations',
    path: './dist/database/migrations',
    pathTs: './src/database/migrations',
    glob: '!(*.d).{js,ts}',
    emit: 'ts',
    transactional: true,
    allOrNothing: true,
    snapshot: true,
    snapshotName: '.snapshot',
};
