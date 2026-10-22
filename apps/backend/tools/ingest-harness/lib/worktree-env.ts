import fs from 'node:fs/promises';
import { join } from 'node:path';
import { BACKEND_DIR } from './corpus.js';

/** Everything on these hosts is production (see docs/WORKTREES.md). */
const PRODUCTION_HOST_PATTERN = /syscy\.de/;
const MAIN_DATABASE = 'bytebunker';

export interface HarnessEnv {
    backendUrl: string;
    postgres: { host: string; port: number; user: string; password: string; database: string };
    neo4j: { url: string; username: string; password: string };
}

type TomlValue = string | number | boolean | unknown[];

/**
 * Reads the flat `key = value` subset of TOML that `.env.development.toml` uses: sections, strings,
 * numbers (with `_` separators), booleans, single-line arrays. Enough for connection settings.
 */
export function parseSimpleToml(raw: string): Record<string, Record<string, TomlValue>> {
    const result: Record<string, Record<string, TomlValue>> = { '': {} };
    let section = '';

    for (const rawLine of raw.split('\n')) {
        const line = rawLine.trim();

        if (!line || line.startsWith('#')) {
            continue;
        }

        const sectionMatch = /^\[([^\]]+)]$/.exec(line);

        if (sectionMatch) {
            section = sectionMatch[1]!.trim();
            result[section] ??= {};
            continue;
        }

        const pair = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);

        if (!pair) {
            continue;
        }

        const [, key, rawValue] = pair;
        let value: TomlValue = rawValue!.replace(/\s+#.*$/, '').trim();

        if (/^".*"$/.test(value) || /^'.*'$/.test(value)) {
            value = value.slice(1, -1);
        } else if (/^[+-]?[\d_]+(\.\d+)?$/.test(value)) {
            value = Number(value.replaceAll('_', ''));
        } else if (value === 'true' || value === 'false') {
            value = value === 'true';
        } else if (value.startsWith('[')) {
            try {
                value = JSON.parse(value) as unknown[];
            } catch {
                // leave as string
            }
        }

        result[section]![key!] = value;
    }

    return result;
}

/**
 * Loads connection settings from the backend's development config and refuses anything that could touch
 * production or the main checkout's data: the e2e harness wipes the graph and pipeline tables.
 */
export async function loadHarnessEnv({ allowMainDatabase = false } = {}): Promise<HarnessEnv> {
    const configPath = join(BACKEND_DIR, '.env.development.toml');
    const raw = await fs.readFile(configPath, 'utf8');
    const activeLines = raw.split('\n').filter((line) => !line.trim().startsWith('#'));

    if (activeLines.some((line) => PRODUCTION_HOST_PATTERN.test(line))) {
        throw new Error(`${configPath} references a production host (syscy.de); refusing to run the e2e harness.`);
    }

    const toml = parseSimpleToml(raw);
    const orm = toml['mikroOrm'] ?? {};
    const neo4j = toml['neo4j'] ?? {};
    const database = String(orm['dbName'] ?? orm['database'] ?? '');

    if (!database) {
        throw new Error(`No [mikroOrm] database in ${configPath}`);
    }

    if (database === MAIN_DATABASE && !allowMainDatabase) {
        throw new Error(
            `${configPath} points at the main dev database "${MAIN_DATABASE}". Run the e2e harness from a worktree ` +
                `(tools/worktree/wt.sh setup) or pass --allow-main-database if you really mean it.`,
        );
    }

    const port = Number(toml['']!['port'] ?? 12100);

    return {
        backendUrl: `http://127.0.0.1:${port}`,
        postgres: {
            host: String(orm['host'] ?? '127.0.0.1'),
            port: Number(orm['port'] ?? 5432),
            user: String(orm['user'] ?? 'bytebunker'),
            password: String(orm['password'] ?? ''),
            database,
        },
        neo4j: {
            url: String(neo4j['connectionString'] ?? 'bolt://127.0.0.1:7687'),
            username: String(neo4j['username'] ?? 'neo4j'),
            password: String(neo4j['password'] ?? ''),
        },
    };
}
