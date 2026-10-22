import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- available unflagged since Node 22.13, prod runs 22.22
import { DatabaseSync, type DatabaseSyncOptions } from 'node:sqlite';

export const SQLITE_MAGIC = 'SQLite format 3\0';

/** Byte offsets of the file format write/read versions in the database header; 2 means WAL mode. */
const HEADER_WRITE_VERSION_OFFSET = 18;
const HEADER_READ_VERSION_OFFSET = 19;

export function hasSqliteMagic(head: string | Buffer): boolean {
    return typeof head === 'string'
        ? head.startsWith(SQLITE_MAGIC)
        : head.subarray(0, SQLITE_MAGIC.length).toString('latin1') === SQLITE_MAGIC;
}

/**
 * Opens a SQLite file given as bytes read-only and hands it to `read`. Assets live in object storage and node:sqlite
 * only opens paths, so the bytes go to a private temp directory first, which is removed afterwards.
 *
 * Browser databases are usually in WAL mode. The copy has no `-wal`/`-shm` next to it, and SQLite would try to create
 * them even for a read-only connection. Switching the copy's header back to rollback-journal mode makes it a plain
 * self-contained file; the original is never touched.
 */
export async function readSqliteBuffer<T>(data: Buffer, fileName: string, read: (db: DatabaseSync) => T): Promise<T> {
    if (!hasSqliteMagic(data)) {
        throw new Error(`${fileName} is not a SQLite database`);
    }

    const directory = await fs.mkdtemp(path.join(tmpdir(), 'bytebunker-sqlite-'));
    const filePath = path.join(directory, fileName.replaceAll(/[^\w.-]/g, '_') || 'database.sqlite');

    try {
        if (data[HEADER_WRITE_VERSION_OFFSET] === 2 || data[HEADER_READ_VERSION_OFFSET] === 2) {
            data = Buffer.from(data);
            data[HEADER_WRITE_VERSION_OFFSET] = 1;
            data[HEADER_READ_VERSION_OFFSET] = 1;
        }

        await fs.writeFile(filePath, data, { mode: 0o600 });
        // `readOnly` exists since Node 22.12; the bundled typings predate it.
        const db = new DatabaseSync(filePath, { readOnly: true } as DatabaseSyncOptions);

        try {
            return read(db);
        } finally {
            db.close();
        }
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
}

export function hasTables(db: DatabaseSync, ...tables: string[]): boolean {
    const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[];
    const names = new Set(rows.map((row) => row.name));

    return tables.every((table) => names.has(table));
}

export function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];

    return rows.some((row) => row.name === column);
}
