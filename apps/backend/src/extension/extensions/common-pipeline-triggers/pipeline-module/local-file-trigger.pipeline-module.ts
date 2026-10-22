import { Items, Optional, Required, Type } from 'ts-decorator-json-schema-generator';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import { PipelineModuleTypeEnum } from '../../../../etl/pipeline/pipeline-module/type/pipeline-module-type.enum.js';
import { AbstractTriggerPipelineModule } from '../../../../etl/pipeline/pipeline-module/abstract-trigger-pipeline.module.js';
import { COMMON_PIPELINE_TRIGGERS_EXTENSION } from '../../local-extension.constant.js';
import { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';

@PipelineModuleJsonSchema()
export class LocalFileTriggerInput {
    /** micromatch globs on the path relative to the import folder (or upload/zip root). */
    @Required()
    @Type('array')
    @Items('string')
    public globPatterns!: string[];

    /**
     * Regular expressions tested against the first 64 KB of the file. A match routes the file here like a glob
     * match. For blueprints whose transform cannot recognise files itself, e.g. inline scripts.
     */
    @Optional()
    @Type('array')
    @Items('string')
    public contentPatterns?: string[];

    /**
     * When no blueprint matches a file by glob or content pattern, let the modules connected to this trigger
     * recognise it by content (`detectFile`). On by default.
     */
    @Optional()
    @Type('boolean')
    public detectByContent?: boolean;

    /**
     * Re-runs the blueprint even when a file with the exact same content was already imported successfully.
     * Off by default so dropping the same file twice does not pay the full transform + store cost again.
     */
    @Optional()
    @Type('boolean')
    public allowReimport?: boolean;
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
