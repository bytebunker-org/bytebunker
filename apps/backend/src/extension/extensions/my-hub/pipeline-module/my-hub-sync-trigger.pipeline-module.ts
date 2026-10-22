import { Required, Type } from 'ts-decorator-json-schema-generator';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleTypeEnum } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module-type.enum.js';
import { AbstractTriggerPipelineModule } from '../../../../etl/pipeline/pipeline-module/abstract-trigger-pipeline.module.js';
import { MY_HUB_EXTENSION } from '../../local-extension.constant.js';

@PipelineModuleJsonSchema()
export class MyHubSyncTriggerInput {}

@PipelineModuleJsonSchema()
export class MyHubSyncTriggerOutput {
    /** When the sync was requested (ISO 8601). */
    @Required()
    @Type('string')
    public triggeredAt!: string;
}

/**
 * Starts a my-hub sync blueprint. Fired by `POST /my-hub/sync` (all blueprints containing this trigger) or by
 * `POST /pipeline-execution` for one blueprint; a scheduler can call {@link MyHubSyncTriggerService.trigger} the
 * same way. Connect its `success` output to the `dependentModules` input of the sync modules.
 */
@PipelineModule({
    extensionName: MY_HUB_EXTENSION,
    type: PipelineModuleTypeEnum.TRIGGER,
    inputType: MyHubSyncTriggerInput,
    outputType: MyHubSyncTriggerOutput,
})
export class MyHubSyncTriggerPipelineModule extends AbstractTriggerPipelineModule<
    MyHubSyncTriggerInput,
    MyHubSyncTriggerOutput
> {}
