import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import { promisify } from 'node:util';
import { gunzip as gunzipCallback, gzip as gzipCallback } from 'node:zlib';
import { AssetService } from '../../asset/asset.service.js';
import { AssetTypeEnum } from '../../asset/type/asset-type.enum.js';
import type { ExternalNodeOutputRef } from '../type/external-node-output-ref.type.js';

const gzip = promisify(gzipCallback);
const gunzip = promisify(gunzipCallback);

/**
 * Handles above this serialized size are stored as gzipped assets instead of inline JSONB. Postgres and MikroORM
 * copy a JSONB value several times (entity snapshot, parameter string, parsed result), which ran a 4 GB heap out
 * of memory for a 160 MB output (235k activities).
 */
export const INLINE_OUTPUT_MAX_BYTES = 4 * 1024 * 1024;

const REF_KEY = '$pipelineOutputAsset';

export function isExternalNodeOutputRef(value: unknown): value is ExternalNodeOutputRef {
    return typeof value === 'object' && value !== null && REF_KEY in value;
}

/**
 * Keeps large module outputs out of `pipeline_execution_data_entity.data`. Each top-level output handle is stored
 * on its own, so a node reading only `skipped` never loads `activities`.
 */
@Injectable()
export class PipelineOutputStoreService {
    private readonly logger = new Logger(PipelineOutputStoreService.name);

    constructor(private readonly assetService: AssetService) {}

    /** Replaces large handles of a module output with references to stored assets. */
    public async externalize(
        em: EntityManager,
        executionId: number,
        nodeId: number,
        output: unknown,
    ): Promise<unknown> {
        if (typeof output !== 'object' || output === null || Array.isArray(output)) {
            return output;
        }

        const result: Record<string, unknown> = {};

        for (const [handle, value] of Object.entries(output as Record<string, unknown>)) {
            if (value === undefined || value === null || typeof value !== 'object') {
                result[handle] = value;
                continue;
            }

            const json = JSON.stringify(value);

            if (json.length <= INLINE_OUTPUT_MAX_BYTES) {
                result[handle] = value;
                continue;
            }

            const compressed = await gzip(Buffer.from(json));
            const asset = await this.assetService.storeAsset(em, compressed, {
                type: AssetTypeEnum.PIPELINE,
                originalFilePath: `pipeline-output/${executionId}/node-${nodeId}-${handle}.json.gz`,
                size: compressed.byteLength,
                metadata: { 'Content-Type': 'application/gzip' },
            });

            this.logger.log(
                `Stored output "${handle}" of node ${nodeId} (execution ${executionId}) as asset ${asset.id}: ` +
                    `${(json.length / 1024 / 1024).toFixed(1)} MB → ${(compressed.byteLength / 1024 / 1024).toFixed(1)} MB`,
            );

            result[handle] = {
                [REF_KEY]: asset.id,
                bytes: json.length,
                ...(Array.isArray(value) ? { items: value.length } : {}),
            } satisfies ExternalNodeOutputRef;
        }

        return result;
    }

    /** Loads a handle value back if it was stored as an asset; returns other values unchanged. */
    public async resolve(em: EntityManager, value: unknown): Promise<unknown> {
        if (!isExternalNodeOutputRef(value)) {
            return value;
        }

        const compressed = await this.assetService.getAsset(em, value[REF_KEY]);

        return JSON.parse((await gunzip(compressed)).toString('utf8')) as unknown;
    }
}
