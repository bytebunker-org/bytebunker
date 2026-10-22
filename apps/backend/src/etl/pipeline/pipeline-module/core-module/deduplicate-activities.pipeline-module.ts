import { Items, Required, Type as SType } from 'ts-decorator-json-schema-generator';
import { PipelineModule } from '../decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../decorator/pipeline-module-json-schema.decorator.js';
import type { IPipelineModule, PipelineModuleExecutionContext } from '../type/pipeline-module.interface.js';
import { CORE_EXTENSION_NAME } from '../../../../extension/extension.constant.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { PROGRESS_INTERVAL } from './activity-fields.util.js';

@PipelineModuleJsonSchema()
export class DeduplicateActivitiesInput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

@PipelineModuleJsonSchema()
export class DeduplicateActivitiesOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];

    @Required()
    @SType('integer')
    public removedCount!: number;
}

@PipelineModule({
    extensionName: CORE_EXTENSION_NAME,
    inputType: DeduplicateActivitiesInput,
    outputType: DeduplicateActivitiesOutput,
    description:
        'Removes activities that share a stable key with an earlier activity in the same input and keeps the first. ' +
        'Activities without stable keys are always kept. Does not look at what is already stored in the graph.',
})
export class DeduplicateActivitiesPipelineModule
    implements IPipelineModule<DeduplicateActivitiesInput, DeduplicateActivitiesOutput>
{
    public executeModule({
        inputData,
        progress,
    }: PipelineModuleExecutionContext<DeduplicateActivitiesInput>): DeduplicateActivitiesOutput {
        const activities = inputData.activities ?? [];
        const seen = new Set<string>();
        const kept: ActivityDto[] = [];

        progress.report({ current: 0, total: activities.length, unit: 'activities', message: 'Deduplicating' });

        for (const [index, activity] of activities.entries()) {
            if (index % PROGRESS_INTERVAL === 0) {
                progress.report({ current: index });
            }

            const keys = activity.stableKeys ?? [];

            if (keys.length && keys.some((key) => seen.has(key))) {
                continue;
            }

            for (const key of keys) seen.add(key);
            kept.push(activity);
        }

        const removedCount = activities.length - kept.length;

        progress.report({
            current: activities.length,
            message: `Removed ${removedCount.toLocaleString('en-US')} duplicates`,
        });

        return { activities: kept, removedCount };
    }
}
