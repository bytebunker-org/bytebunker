import { NodeLabelEnum } from './node-label.enum.js';

export const allActivityTypes = Object.entries(NodeLabelEnum)
    .filter(([key]) => key.startsWith('ACTIVITY'))
    .map(([, value]) => value);

/**
 * How many activities are resolved, grouped and written to Neo4j/Postgres in one go.
 * Each chunk costs one Postgres transaction plus one Cypher round-trip per distinct activity "shape".
 */
export const ACTIVITY_GRAPH_CHUNK_SIZE = 500;

/**
 * Maximum number of stable keys put into a single `IN (...)` list / `INSERT` statement.
 */
export const STABLE_KEY_QUERY_CHUNK_SIZE = 1000;

/**
 * `NodeStableKeyEntity.stableKey` is a `varchar(512)`, so every key is truncated before it is
 * written to - or looked up in - the index.
 */
export const STABLE_KEY_MAX_LENGTH = 512;
