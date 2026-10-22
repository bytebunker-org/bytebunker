import { Injectable } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import * as R from 'remeda';
import { NodeStableKeyEntity } from './entity/node-stable-key.entity.js';
import { STABLE_KEY_MAX_LENGTH, STABLE_KEY_QUERY_CHUNK_SIZE } from './activity-graph.constant.js';

export interface NodeStableKeyRow {
    stableKey: string;
    nodeId: string;
}

/**
 * `stableKey` is stored in a `varchar(512)` column, so both reads and writes have to use the same
 * truncated key - otherwise a key longer than the column would be written truncated but looked up
 * in full and could never dedup again.
 */
export function truncateStableKey(stableKey: string): string {
    return stableKey.slice(0, STABLE_KEY_MAX_LENGTH);
}

/**
 * Thin access layer around the Postgres stable-key -> Neo4j node id index.
 *
 * Split out of the persister so the graph write path can be unit tested without a database and so
 * the `IN (...)` / `INSERT` statements are chunked in exactly one place.
 */
@Injectable()
export class NodeStableKeyIndexService {
    /**
     * Resolves the given stable keys to the node ids they are already mapped to. Keys without a
     * mapping are simply absent from the returned map.
     */
    public async findNodeIds(em: EntityManager, stableKeys: Iterable<string>): Promise<Map<string, string>> {
        const uniqueStableKeys = [
            ...new Set([...stableKeys].filter(Boolean).map((stableKey) => truncateStableKey(stableKey))),
        ];

        const nodeIdByStableKey = new Map<string, string>();

        if (uniqueStableKeys.length === 0) {
            return nodeIdByStableKey;
        }

        for (const chunk of R.chunk(uniqueStableKeys, STABLE_KEY_QUERY_CHUNK_SIZE)) {
            const rows = await em.find(
                NodeStableKeyEntity,
                {
                    stableKey: {
                        $in: chunk,
                    },
                },
                {
                    fields: ['stableKey', 'nodeId'],
                },
            );

            for (const row of rows) {
                nodeIdByStableKey.set(row.stableKey, row.nodeId);
            }
        }

        return nodeIdByStableKey;
    }

    /**
     * Inserts the given stable key -> node id mappings, ignoring keys that are already indexed.
     * A single `INSERT ... ON CONFLICT DO NOTHING` per chunk instead of one upsert per activity.
     */
    public async insertMissing(em: EntityManager, rows: NodeStableKeyRow[]): Promise<void> {
        const uniqueRows = [
            ...new Map(
                rows
                    .filter((row) => Boolean(row.stableKey) && Boolean(row.nodeId))
                    .map((row) => [
                        truncateStableKey(row.stableKey),
                        { ...row, stableKey: truncateStableKey(row.stableKey) },
                    ]),
            ).values(),
        ];

        if (uniqueRows.length === 0) {
            return;
        }

        for (const chunk of R.chunk(uniqueRows, STABLE_KEY_QUERY_CHUNK_SIZE)) {
            await em.createQueryBuilder(NodeStableKeyEntity).insert(chunk).onConflict('stableKey').ignore().execute();
        }
    }
}
