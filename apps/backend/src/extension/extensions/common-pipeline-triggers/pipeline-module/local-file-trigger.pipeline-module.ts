import { Items, Required, Type } from 'ts-decorator-json-schema-generator';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleTypeEnum } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module-type.enum.js';
import { AbstractTriggerPipelineModule } from '../../../../etl/pipeline/pipeline-module/abstract-trigger-pipeline.module.js';
import { COMMON_PIPELINE_TRIGGERS_EXTENSION } from '../../local-extension.constant.js';
import { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';

@PipelineModuleJsonSchema()
export class LocalFileTriggerInput {
    @Required()
    @Type('array')
    @Items('string')
    public globPatterns!: string[];
}

@PipelineModuleJsonSchema()
export class LocalFileTriggerOutput {
    @Required()
    @Type(AssetDto)
    public fileAsset!: AssetDto;
}

@PipelineModule({
    extensionName: COMMON_PIPELINE_TRIGGERS_EXTENSION,
    type: PipelineModuleTypeEnum.TRIGGER,
    inputType: LocalFileTriggerInput,
    outputType: LocalFileTriggerOutput,
})
export class LocalFileTriggerPipelineModule extends AbstractTriggerPipelineModule<
    LocalFileTriggerInput,
    LocalFileTriggerOutput
> {}
