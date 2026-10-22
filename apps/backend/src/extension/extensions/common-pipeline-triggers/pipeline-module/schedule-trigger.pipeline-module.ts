import { Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleTypeEnum } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module-type.enum.js';
import { AbstractTriggerPipelineModule } from '../../../../etl/pipeline/pipeline-module/abstract-trigger-pipeline.module.js';
import { COMMON_PIPELINE_TRIGGERS_EXTENSION } from '../../local-extension.constant.js';

@PipelineModuleJsonSchema()
export class ScheduleTriggerInput {
    /** Cron expression (5 fields, or 6 with seconds first), e.g. "30 3 * * *" for every day at 03:30. */
    @Required()
    @Type('string')
    public cron!: string;

    /** IANA time zone the cron expression is evaluated in, e.g. "Europe/Berlin". Defaults to the server's zone. */
    @Optional()
    @Type('string')
    public timezone?: string;
}

@PipelineModuleJsonSchema()
export class ScheduleTriggerOutput {
    /** When the schedule fired (or the run was started by hand), ISO 8601. */
    @Required()
    @Type('string')
    public firedAt!: string;
}

@PipelineModule({
    extensionName: COMMON_PIPELINE_TRIGGERS_EXTENSION,
    type: PipelineModuleTypeEnum.TRIGGER,
    inputType: ScheduleTriggerInput,
    outputType: ScheduleTriggerOutput,
    description:
        'Starts the blueprint on a cron schedule. A run is skipped while the previous execution of the blueprint is ' +
        'still waiting or running. Can also be fired by hand (POST /pipelines-blueprints/:id/run).',
})
export class ScheduleTriggerPipelineModule extends AbstractTriggerPipelineModule<
    ScheduleTriggerInput,
    ScheduleTriggerOutput
> {}
