import {
    Default,
    Description,
    Enum,
    Items,
    Min,
    Optional,
    Required,
    Type as SType,
} from 'ts-decorator-json-schema-generator';
import { PipelineModule } from '../decorator/pipeline-module.decorator.js';
import { PipelineModuleJsonSchema } from '../decorator/pipeline-module-json-schema.decorator.js';
import type { IPipelineModule, PipelineModuleExecutionContext } from '../type/pipeline-module.interface.js';
import { CORE_EXTENSION_NAME } from '../../../../extension/extension.constant.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';

export enum SampleActivitiesMode {
    FIRST = 'first',
    EVERY_NTH = 'every-nth',
    RANDOM = 'random',
}

@PipelineModuleJsonSchema()
export class SampleActivitiesInput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];

    @Optional()
    @Enum(SampleActivitiesMode, 'string')
    @Default(SampleActivitiesMode.FIRST)
    @Description('"first": the first n; "every-nth": every nth starting with the first; "random": n random ones')
    public mode?: SampleActivitiesMode;

    @Required()
    @SType('integer')
    @Min(1)
    @Description('The count for "first" and "random", the step for "every-nth"')
    public n!: number;

    @Optional()
    @SType('string')
    @Description('Seed for "random", the same seed gives the same sample; defaults to a fixed seed')
    public seed?: string;
}

@PipelineModuleJsonSchema()
export class SampleActivitiesOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];

    @Required()
    @SType('integer')
    public removedCount!: number;
}

const DEFAULT_SEED = 'bytebunker';

/* eslint-disable unicorn/numeric-separators-style, unicorn/number-literal-case, unicorn/prefer-math-trunc, unicorn/prefer-code-point -- standard mulberry32 constants */
/** Small seedable PRNG (mulberry32) so random samples are reproducible. */
export function seededRandom(seed: string): () => number {
    let state = 1779033703 ^ seed.length;

    for (let i = 0; i < seed.length; i++) {
        state = Math.imul(state ^ seed.charCodeAt(i), 3432918353);
        state = (state << 13) | (state >>> 19);
    }

    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* eslint-enable */

@PipelineModule({
    extensionName: CORE_EXTENSION_NAME,
    inputType: SampleActivitiesInput,
    outputType: SampleActivitiesOutput,
    description:
        'Reduces the activities to a sample: the first n, every nth, or n random ones (reproducible with a seed). ' +
        'The original order is kept. Useful for trying a blueprint on a small slice of a big export.',
})
export class SampleActivitiesPipelineModule implements IPipelineModule<SampleActivitiesInput, SampleActivitiesOutput> {
    public executeModule({
        inputData,
        progress,
    }: PipelineModuleExecutionContext<SampleActivitiesInput>): SampleActivitiesOutput {
        const activities = inputData.activities ?? [];
        const mode = inputData.mode ?? SampleActivitiesMode.FIRST;
        const n = Math.floor(Number(inputData.n));

        if (!Number.isFinite(n) || n < 1) {
            throw new Error(`n must be a positive integer, got "${String(inputData.n)}"`);
        }

        progress.report({ current: 0, total: activities.length, unit: 'activities', message: `Sampling (${mode})` });

        let sample: ActivityDto[];

        switch (mode) {
            case SampleActivitiesMode.FIRST:
                sample = activities.slice(0, n);
                break;
            case SampleActivitiesMode.EVERY_NTH:
                sample = activities.filter((_, index) => index % n === 0);
                break;
            case SampleActivitiesMode.RANDOM: {
                if (n >= activities.length) {
                    sample = activities;
                    break;
                }

                const random = seededRandom(inputData.seed ?? DEFAULT_SEED);
                const indices = activities.map((_, index) => index);

                // Partial Fisher-Yates: only the first n slots need to be settled.
                for (let i = 0; i < n; i++) {
                    const j = i + Math.floor(random() * (indices.length - i));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }

                sample = indices
                    .slice(0, n)
                    .sort((a, b) => a - b)
                    .map((index) => activities[index]);
                break;
            }
            default:
                throw new Error(`Unknown sample mode "${String(mode)}"`);
        }

        progress.report({
            current: activities.length,
            message: `Sampled ${sample.length.toLocaleString('en-US')} of ${activities.length.toLocaleString('en-US')} activities`,
        });

        return { activities: sample, removedCount: activities.length - sample.length };
    }
}
