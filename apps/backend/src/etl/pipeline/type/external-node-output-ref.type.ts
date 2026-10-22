/**
 * Stands in for a large module output handle in `pipeline_execution_data_entity.data`: the value itself is stored as a
 * gzipped JSON pipeline asset. The engine resolves it transparently when the handle feeds another node.
 */
export interface ExternalNodeOutputRef {
    $pipelineOutputAsset: string;
    /** Serialized JSON size in bytes. */
    bytes: number;
    /** Array length, if the value is an array (e.g. number of activities). */
    items?: number;
}
