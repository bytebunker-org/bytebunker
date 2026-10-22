import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { BlueprintDataDto } from '../dto/blueprint-data.dto.js';

/** Shape of a `*.blueprint.json` file an extension ships in its `blueprints/` folder. */
export interface ShippedBlueprint {
    /** `<extension folder>/<file name without .blueprint.json>`, e.g. `google/timeline`. */
    key: string;
    title: string;
    description?: string;
    data: BlueprintDataDto;
    /** Hash of `data`, see {@link hashBlueprintData}. */
    hash: string;
}

export type ShippedBlueprintAction = 'install' | 'update' | 'unchanged' | 'adopt-hash' | 'user-modified';

const FILE_SUFFIX = '.blueprint.json';

/** JSON with sorted object keys, so equal data hashes equally regardless of key order (jsonb reorders keys). */
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
    }

    return JSON.stringify(value) ?? 'null';
}

export function hashBlueprintData(data: unknown): string {
    return createHash('sha256').update(canonicalJson(data)).digest('hex');
}

/**
 * What to do with one shipped blueprint, given what is stored under its key:
 * - install: nothing stored yet
 * - unchanged: stored data is the shipped version
 * - update: shipped file changed and the user never edited the stored copy
 * - adopt-hash: stored data already equals the shipped version but the recorded hash is outdated
 * - user-modified: shipped file changed but the stored copy was edited, leave it alone
 */
export function decideShippedBlueprintAction(
    stored: { data: unknown; shippedHash?: string | null } | undefined,
    shippedHash: string,
): ShippedBlueprintAction {
    if (!stored) {
        return 'install';
    }

    const storedDataHash = hashBlueprintData(stored.data);

    if (storedDataHash === shippedHash) {
        return stored.shippedHash === shippedHash ? 'unchanged' : 'adopt-hash';
    }

    return storedDataHash === stored.shippedHash ? 'update' : 'user-modified';
}

/** Finds `<extensionsDir>/<extension>/blueprints/*.blueprint.json`. Unreadable or malformed files are reported. */
export async function loadShippedBlueprints(
    extensionsDir: string,
    onError: (file: string, error: Error) => void,
): Promise<ShippedBlueprint[]> {
    const result: ShippedBlueprint[] = [];
    const extensionFolders = await readdir(extensionsDir, { withFileTypes: true }).catch(() => []);

    for (const folder of extensionFolders.filter((entry) => entry.isDirectory())) {
        const blueprintDir = path.join(extensionsDir, folder.name, 'blueprints');
        const files = await readdir(blueprintDir).catch(() => [] as string[]);

        for (const file of files.filter((name) => name.endsWith(FILE_SUFFIX)).sort()) {
            const fullPath = path.join(blueprintDir, file);

            try {
                const parsed = JSON.parse(await readFile(fullPath, 'utf8')) as Partial<ShippedBlueprint>;

                if (typeof parsed.title !== 'string' || !parsed.data || !Array.isArray(parsed.data.nodes)) {
                    throw new Error('expected { title, description?, data: { nodes, edges } }');
                }

                // Both columns are varchar(255); a longer text makes every install of this blueprint fail on commit.
                if (parsed.title.length > 255 || (parsed.description?.length ?? 0) > 255) {
                    throw new Error('title and description must be at most 255 characters');
                }

                result.push({
                    key: `${folder.name}/${file.slice(0, -FILE_SUFFIX.length)}`,
                    title: parsed.title,
                    description: parsed.description,
                    data: parsed.data,
                    hash: hashBlueprintData(parsed.data),
                });
            } catch (error) {
                onError(fullPath, error as Error);
            }
        }
    }

    return result;
}
