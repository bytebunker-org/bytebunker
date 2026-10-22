import { Items, Optional, Required, Type as SType } from 'ts-decorator-json-schema-generator';
import { PipelineModule } from '../decorator/pipeline-module.decorator.js';
import type { IPipelineModule, PipelineModuleExecutionContext } from '../type/pipeline-module.interface.js';
import { Logger } from '@nestjs/common';
import { CORE_EXTENSION_NAME } from '../../../../extension/extension.constant.js';
import { PipelineModuleJsonSchema } from '../decorator/pipeline-module-json-schema.decorator.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { ActivityGraphPersisterService } from '../../../../activity-graph/activity-graph-persister.service.js';
import { analyzeActivities } from '../../../../activity-graph/activity-analysis.util.js';
import type { StoreActivityReport } from '../type/store-activity-report.interface.js';

@PipelineModuleJsonSchema()
export class StoreActivityInput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

@PipelineModuleJsonSchema()
export class StoreActivityOutput {
    @Required()
    @SType('integer')
    public createdCount!: number;

    @Required()
    @SType('integer')
    public existingCount!: number;

    /**
     * What the import did (or, in a dry run, would do): created/existing counts, new objects, examples, and the
     * data quality analysis of the incoming activities. Shown as the import report in the UI.
     */
    @Optional()
    @SType('object')
    public report?: StoreActivityReport;
}

@PipelineModule({
    extensionName: CORE_EXTENSION_NAME,
    inputType: StoreActivityInput,
    outputType: StoreActivityOutput,
    // Writing the graph is usually most of an import's time.
    progressWeight: 4,
})
export class StoreActivityPipelineModule implements IPipelineModule<StoreActivityInput, StoreActivityOutput> {
    private readonly logger = new Logger(StoreActivityPipelineModule.name);

    constructor(private readonly activityGraphPersisterService: ActivityGraphPersisterService) {}

    public async executeModule({
        em,
        inputData,
        pipelineExecution,
        progress,
        dryRun,
    }: PipelineModuleExecutionContext<StoreActivityInput>): Promise<StoreActivityOutput> {
        const activities = inputData.activities ?? [];

        progress.report({ current: 0, total: activities.length, unit: 'activities', message: 'Checking activities' });
        const analysis = analyzeActivities(activities);

        progress.message(dryRun ? 'Comparing with the graph (dry run)' : 'Writing to the graph');
        const result = await this.activityGraphPersisterService.createActivityGraph(em, activities, {
            dryRun,
            provenance: { executionId: pipelineExecution.id, assetId: pipelineExecution.triggerAsset?.id },
            onProgress: ({ processed, total, created, existing }) =>
                progress.report({
                    current: processed,
                    total,
                    message: `${dryRun ? 'Would create' : 'Created'} ${created.toLocaleString('en-US')}, ${existing.toLocaleString('en-US')} already present`,
                }),
        });

        progress.message(
            `${dryRun ? 'Would create' : 'Created'} ${result.createdCount.toLocaleString('en-US')} activities and ` +
                `${result.createdObjectCount.toLocaleString('en-US')} objects; ${result.existingCount.toLocaleString('en-US')} already present`,
        );

        return {
            createdCount: result.createdCount,
            existingCount: result.existingCount,
            report: {
                dryRun: result.dryRun,
                activityCount: activities.length,
                createdCount: result.createdCount,
                existingCount: result.existingCount,
                createdObjectCount: result.createdObjectCount,
                samples: result.samples,
                analysis,
            },
        };
    }
}
