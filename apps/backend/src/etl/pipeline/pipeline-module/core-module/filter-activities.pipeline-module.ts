import { Description, Items, Min, Optional, Required, Type as SType } from 'ts-decorator-json-schema-generator';
import { PipelineModule } from '../decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../decorator/pipeline-module-json-schema.decorator.js';
import type { IPipelineModule, PipelineModuleExecutionContext } from '../type/pipeline-module.interface.js';
import { CORE_EXTENSION_NAME } from '../../../../extension/extension.constant.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { activityStartMs, activityTypes, parseIsoDate, PROGRESS_INTERVAL } from './activity-fields.util.js';

@PipelineModuleJsonSchema()
export class FilterActivitiesInput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];

    @Optional()
    @SType('string')
    @Description('ISO date or date-time; keeps activities starting at or after it')
    public dateFrom?: string;

    @Optional()
    @SType('string')
    @Description('ISO date or date-time; keeps activities starting before it (exclusive)')
    public dateTo?: string;

    @Optional()
    @Items('string')
    @Description('Keep activities whose @type or @secondaryTypes contains one of these; empty or unset keeps all')
    public types?: string[];

    @Optional()
    @SType('integer')
    @Min(0)
    @Description('Keep at most this many activities (the first ones after filtering)')
    public limit?: number;
}

@PipelineModuleJsonSchema()
export class FilterActivitiesOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];

    @Required()
    @SType('integer')
    public removedCount!: number;
}

@PipelineModule({
    extensionName: CORE_EXTENSION_NAME,
    inputType: FilterActivitiesInput,
    outputType: FilterActivitiesOutput,
    description:
        'Keeps only the activities that match a date range (by startTime), a list of activity types, and an ' +
        'optional maximum count. With a date bound set, activities without a valid startTime are dropped.',
})
export class FilterActivitiesPipelineModule implements IPipelineModule<FilterActivitiesInput, FilterActivitiesOutput> {
    public executeModule({
        inputData,
        progress,
    }: PipelineModuleExecutionContext<FilterActivitiesInput>): FilterActivitiesOutput {
        const activities = inputData.activities ?? [];
        const from = parseIsoDate('dateFrom', inputData.dateFrom);
        const to = parseIsoDate('dateTo', inputData.dateTo);
        const types = new Set(inputData.types ?? []);
        const limit = inputData.limit;
        const kept: ActivityDto[] = [];

        progress.report({ current: 0, total: activities.length, unit: 'activities', message: 'Filtering activities' });

        for (const [index, activity] of activities.entries()) {
            if (limit !== undefined && kept.length >= limit) {
                break;
            }

            if (index % PROGRESS_INTERVAL === 0) {
                progress.report({ current: index });
            }

            if (from !== undefined || to !== undefined) {
                const start = activityStartMs(activity);

                if (start === undefined || (from !== undefined && start < from) || (to !== undefined && start >= to)) {
                    continue;
                }
            }

            if (types.size && !activityTypes(activity).some((type) => types.has(type))) {
                continue;
            }

            kept.push(activity);
        }

        progress.report({
            current: activities.length,
            message: `Kept ${kept.length.toLocaleString('en-US')} of ${activities.length.toLocaleString('en-US')} activities`,
        });

        return { activities: kept, removedCount: activities.length - kept.length };
    }
}
