import { Items, Required } from 'ts-decorator-json-schema-generator';
import type { AssetDto } from '../../../../etl/asset/dto/asset.dto.js';
import { GOOGLE_EXTENSION } from '../../local-extension.constant.js';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import { ActivityDto } from '../../../../graph-database/dto/activity.dto.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';

@PipelineModuleJsonSchema()
export class TransformSemanticLocationHistoryInput {
    @Required()
    public rawJson!: AssetDto;
}

@PipelineModuleJsonSchema()
export class TransformSemanticLocationHistoryOutput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

@PipelineModule({
    extensionName: GOOGLE_EXTENSION,
    inputType: TransformSemanticLocationHistoryInput,
    outputType: TransformSemanticLocationHistoryOutput,
})
export class TransformSemanticLocationHistoryPipelineModule
    implements IPipelineModule<TransformSemanticLocationHistoryInput, TransformSemanticLocationHistoryOutput>
{
    constructor(private readonly assetService: AssetService) {}

    public async executeModule({
        em,
        inputData,
    }: PipelineModuleExecutionContext<TransformSemanticLocationHistoryInput>): Promise<TransformSemanticLocationHistoryOutput> {
        const rawJson = await this.assetService.getAssetString(em, inputData.rawJson);
        const rawLocations = JSON.parse(rawJson);
        console.log(rawLocations);

        return {
            activities: [],
        };
    }
}
