/**
 * Pure checks over a transform module's output (`activities`), mirroring what the store-activity path
 * will do with it: the output is stored as JSONB, read back, split into an activity node plus related
 * object nodes (any property holding an object with `@type`/`@id`), and deduplicated by `stableKeys`.
 */

/** Must match `relationshipInfoMap` in `src/activity-graph/schema/graph-schema.constant.ts`. */
export type RelationshipKeys = ReadonlySet<string>;

/** Postgres `node_stable_key_entity.stable_key` is cut to this many characters. */
export const STABLE_KEY_MAX_LENGTH = 512;

type Json = Record<string, unknown>;

export interface ActivityAnalysis {
    activityCount: number;
    byType: Record<string, number>;
    /** Serialized size of `{ activities }`, i.e. roughly the JSONB row the transform node writes. */
    outputBytes: number;
    timeRange: { min?: string; max?: string };
    problems: {
        /** Hard: persisting throws on these. */
        unknownRelationshipKeys: Record<string, number>;
        /** Hard: required on every activity. */
        missingType: number;
        missingActor: number;
        missingOrInvalidStartTime: number;
        /** Hard: truncated keys can collide in the dedup index. */
        stableKeysTooLong: number;
        /** Soft: activity is never deduplicated. */
        activitiesWithoutStableKeys: number;
        /** Soft: ends before it starts. */
        endBeforeStart: number;
        /**
         * Soft: activities in this file that share a stable key with an earlier activity in the same file. The
         * persister only checks keys that already exist in Postgres, so these are all written as separate nodes
         * while the index keeps one of them: either real events collapsed by too-coarse keys, or duplicates.
         */
        intraFileDuplicateActivityKeys: number;
        /** Soft: activities sharing a key but with different content (data that the key cannot tell apart). */
        intraFileConflictingActivityKeys: number;
        /** Soft: objects without stable keys get a fresh node per activity. */
        objectsWithoutStableKeys: number;
        /**
         * Soft: object stable keys that link otherwise separate identities (key A seen with B once and with C
         * elsewhere). The persister resolves the first key it finds, so such objects merge unpredictably.
         */
        objectsWithConflictingKeySets: number;
        /** Soft: nested non-object values the persister flattens with JSON.stringify. */
        stringifiedProperties: Record<string, number>;
    };
    objects: {
        /** Object references across all activities. */
        references: number;
        /** Distinct objects, grouping references that share any stable key. */
        distinct: number;
        byType: Record<string, number>;
    };
    examples: Record<string, unknown[]>;
}

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isASObject = (value: unknown): value is Json => isObject(value) && Boolean(value['@type'] || value['@id']);
const increment = (record: Record<string, number>, key: string): void => {
    record[key] = (record[key] ?? 0) + 1;
};

/** Union-find over object stable keys, to count distinct objects the way the dedup index would see them. */
class KeyGroups {
    private readonly parent = new Map<string, string>();

    public find(key: string): string {
        let root = key;

        while (this.parent.has(root) && this.parent.get(root) !== root) {
            root = this.parent.get(root)!;
        }

        this.parent.set(key, root);
        return root;
    }

    /** Returns true when the keys belonged to two different groups before. */
    public union(keys: string[]): boolean {
        const roots = new Set(keys.map((k) => (this.parent.has(k) ? this.find(k) : undefined)).filter(Boolean));

        for (const key of keys) {
            if (!this.parent.has(key)) {
                this.parent.set(key, key);
            }
        }

        const [first, ...rest] = keys.map((k) => this.find(k));

        for (const root of rest) {
            if (root !== first) {
                this.parent.set(root, first!);
            }
        }

        return roots.size > 1;
    }

    public groupCount(): number {
        return new Set([...this.parent.keys()].map((k) => this.find(k))).size;
    }
}

const MAX_EXAMPLES = 3;

export function analyzeActivities(activities: unknown[], relationshipKeys: RelationshipKeys): ActivityAnalysis {
    const analysis: ActivityAnalysis = {
        activityCount: activities.length,
        byType: {},
        outputBytes: Buffer.byteLength(JSON.stringify({ activities })),
        timeRange: {},
        problems: {
            unknownRelationshipKeys: {},
            missingType: 0,
            missingActor: 0,
            missingOrInvalidStartTime: 0,
            stableKeysTooLong: 0,
            activitiesWithoutStableKeys: 0,
            endBeforeStart: 0,
            intraFileDuplicateActivityKeys: 0,
            intraFileConflictingActivityKeys: 0,
            objectsWithoutStableKeys: 0,
            objectsWithConflictingKeySets: 0,
            stringifiedProperties: {},
        },
        objects: { references: 0, distinct: 0, byType: {} },
        examples: {},
    };
    const example = (problem: string, value: unknown): void => {
        const list = (analysis.examples[problem] ??= []);

        if (list.length < MAX_EXAMPLES) {
            list.push(value);
        }
    };

    // Activity keys → JSON of the first activity with that key, to tell duplicates from conflicts.
    const seenActivityKeys = new Map<string, string>();
    const objectGroups = new KeyGroups();
    const objectGroupTypes = new Map<string, string>();
    let minStart: number | undefined;
    let maxStart: number | undefined;

    for (const raw of activities) {
        if (!isObject(raw)) {
            analysis.problems.missingType++;
            continue;
        }

        const type = typeof raw['@type'] === 'string' ? raw['@type'] : undefined;
        const secondary = Array.isArray(raw['@secondaryTypes']) ? raw['@secondaryTypes'].join('+') : '';
        increment(analysis.byType, `${type ?? '(none)'}${secondary ? `[${secondary}]` : ''}`);

        if (!type) {
            analysis.problems.missingType++;
        }

        if (!raw['actor']) {
            analysis.problems.missingActor++;
        }

        const start = typeof raw['startTime'] === 'string' ? Date.parse(raw['startTime']) : Number.NaN;
        const end = typeof raw['endTime'] === 'string' ? Date.parse(raw['endTime']) : Number.NaN;

        if (Number.isNaN(start)) {
            analysis.problems.missingOrInvalidStartTime++;
            example('missingOrInvalidStartTime', raw['startTime']);
        } else {
            minStart = minStart === undefined ? start : Math.min(minStart, start);
            maxStart = maxStart === undefined ? start : Math.max(maxStart, start);

            if (!Number.isNaN(end) && end < start) {
                analysis.problems.endBeforeStart++;
                example('endBeforeStart', { startTime: raw['startTime'], endTime: raw['endTime'] });
            }
        }

        const stableKeys = Array.isArray(raw['stableKeys']) ? (raw['stableKeys'] as string[]).filter(Boolean) : [];

        if (!stableKeys.length) {
            analysis.problems.activitiesWithoutStableKeys++;
        }

        const { stableKeys: _ignored, ...withoutKeys } = raw;
        const fingerprint = JSON.stringify(withoutKeys);
        let isDuplicate = false;

        for (const key of stableKeys) {
            if (key.length > STABLE_KEY_MAX_LENGTH) {
                analysis.problems.stableKeysTooLong++;
                example('stableKeysTooLong', `${key.slice(0, 120)}… (${key.length} chars)`);
            }

            const previous = seenActivityKeys.get(key);

            if (previous !== undefined && !isDuplicate) {
                isDuplicate = true;
                analysis.problems.intraFileDuplicateActivityKeys++;

                if (previous !== fingerprint) {
                    analysis.problems.intraFileConflictingActivityKeys++;
                    example('intraFileConflictingActivityKeys', {
                        key,
                        first: summarizeActivity(JSON.parse(previous) as Json),
                        second: summarizeActivity(withoutKeys),
                    });
                }
            } else if (previous === undefined) {
                seenActivityKeys.set(key, fingerprint);
            }
        }

        for (const [property, value] of Object.entries(raw)) {
            if (property === 'stableKeys' || property === '@secondaryTypes') {
                continue;
            }

            if (isASObject(value)) {
                if (!relationshipKeys.has(property)) {
                    increment(analysis.problems.unknownRelationshipKeys, property);
                }

                // The actor and generator are references to existing nodes, not imported objects.
                if (property === 'actor' || property === 'generator') {
                    continue;
                }

                analysis.objects.references++;
                const objectKeys = Array.isArray(value['stableKeys'])
                    ? (value['stableKeys'] as string[]).filter(Boolean)
                    : [];

                if (!objectKeys.length) {
                    analysis.problems.objectsWithoutStableKeys++;
                    continue;
                }

                for (const key of objectKeys) {
                    if (key.length > STABLE_KEY_MAX_LENGTH) {
                        analysis.problems.stableKeysTooLong++;
                        example('stableKeysTooLong', `${key.slice(0, 120)}… (${key.length} chars)`);
                    }
                }

                if (objectGroups.union(objectKeys)) {
                    analysis.problems.objectsWithConflictingKeySets++;
                    example('objectsWithConflictingKeySets', { property, stableKeys: objectKeys });
                }

                objectGroupTypes.set(objectKeys[0]!, String(value['@type']));
            } else if (value !== null && typeof value === 'object') {
                increment(analysis.problems.stringifiedProperties, property);
            }
        }
    }

    analysis.objects.distinct = objectGroups.groupCount();

    for (const [key, type] of objectGroupTypes) {
        // Only count each group once, on its root key.
        if (objectGroups.find(key) === key) {
            increment(analysis.objects.byType, type);
        }
    }

    analysis.timeRange = {
        min: minStart === undefined ? undefined : new Date(minStart).toISOString(),
        max: maxStart === undefined ? undefined : new Date(maxStart).toISOString(),
    };

    return analysis;
}

function summarizeActivity(activity: Json): Json {
    const summary: Json = {};

    for (const [key, value] of Object.entries(activity)) {
        if (key === 'generator' || key === 'actor') {
            continue;
        }

        summary[key] = isObject(value)
            ? { '@type': value['@type'], name: value['name'], identifier: value['identifier'] }
            : value;
    }

    return summary;
}

/** Problems that make the store step throw or corrupt the dedup index. */
export function hardProblems(analysis: ActivityAnalysis): string[] {
    const { problems } = analysis;
    const errors: string[] = [];

    if (Object.keys(problems.unknownRelationshipKeys).length) {
        errors.push(`unknown relationship properties: ${JSON.stringify(problems.unknownRelationshipKeys)}`);
    }

    for (const key of ['missingType', 'missingActor', 'missingOrInvalidStartTime', 'stableKeysTooLong'] as const) {
        if (problems[key]) {
            errors.push(`${key}: ${problems[key]}`);
        }
    }

    return errors;
}
