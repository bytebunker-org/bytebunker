import { Items, Optional, Required, Type as SType } from 'ts-decorator-json-schema-generator';
import type { ASObject } from '@bytebunker/event-schema';
import { PipelineModule } from '../decorator/pipeline-module.decorator.js';
import type { IPipelineModule, PipelineModuleExecutionContext } from '../type/pipeline-module.interface.js';
import { CORE_EXTENSION_NAME } from '../../../../extension/extension.constant.js';
import { PipelineModuleJsonSchema } from '../decorator/pipeline-module-json-schema.decorator.js';
import { ActivityGraphPersisterService } from '../../../../activity-graph/activity-graph-persister.service.js';

@PipelineModuleJsonSchema()
export class StoreObjectsInput {
    /** Objects with `@type`, optional `@secondaryTypes` and `stableKeys`, e.g. Person + MyHubPerson. */
    @Required()
    @Items('object')
    public objects!: ASObject[];
}

@PipelineModuleJsonSchema()
export class StoreObjectsOutput {
    @Required()
    @SType('integer')
    public createdCount!: number;

    @Required()
    @SType('integer')
    public updatedCount!: number;

    /** Stable keys already indexed to another node than the object resolved to (see the persister). */
    @Required()
    @SType('integer')
    public conflictingKeyCount!: number;

    @Optional()
    @SType('boolean')
    public dryRun?: boolean;
}

/**
 * Writes objects that are not part of an activity (persons from an address book, places from a list) into the graph.
 * Existing nodes are found by any stable key and updated with the incoming properties; see
 * {@link ActivityGraphPersisterService.upsertObjects}.
 */
@PipelineModule({
    extensionName: CORE_EXTENSION_NAME,
    inputType: StoreObjectsInput,
    outputType: StoreObjectsOutput,
    progressWeight: 2,
})
export class StoreObjectsPipelineModule implements IPipelineModule<StoreObjectsInput, StoreObjectsOutput> {
    constructor(private readonly activityGraphPersisterService: ActivityGraphPersisterService) {}

    public async executeModule({
        em,
        inputData,
        pipelineExecution,
        progress,
        dryRun,
    }: PipelineModuleExecutionContext<StoreObjectsInput>): Promise<StoreObjectsOutput> {
        const objects = inputData.objects ?? [];

        progress.report({ current: 0, total: objects.length, unit: 'objects', message: 'Writing objects' });
        const result = await this.activityGraphPersisterService.upsertObjects(em, objects, {
            dryRun,
            provenance: { executionId: pipelineExecution.id, assetId: pipelineExecution.triggerAsset?.id },
            onProgress: ({ processed, total, created, updated }) =>
                progress.report({
                    current: processed,
                    total,
                    message: `${dryRun ? 'Would create' : 'Created'} ${created.toLocaleString('en-US')}, ${updated.toLocaleString('en-US')} updated`,
                }),
        });

        progress.message(
            `${dryRun ? 'Would create' : 'Created'} ${result.createdCount.toLocaleString('en-US')} objects, ` +
                `${result.updatedCount.toLocaleString('en-US')} updated` +
                (result.conflictingKeyCount > 0 ? `, ${result.conflictingKeyCount} conflicting keys` : ''),
        );

        return {
            createdCount: result.createdCount,
            updatedCount: result.updatedCount,
            conflictingKeyCount: result.conflictingKeyCount,
            dryRun: result.dryRun,
        };
    }
}
