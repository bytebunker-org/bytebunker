import { Items, Required } from 'ts-decorator-json-schema-generator';
import { PipelineModule } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module.decorator.js';
import type {
    IPipelineModule,
    PipelineModuleExecutionContext,
} from '../../../../etl/pipeline/pipeline-module/type/pipeline-module.interface.js';
import { PipelineModuleJsonSchema } from '../../../../etl/pipeline/pipeline-module/decorator/pipeline-module-json-schema.decorator.js';
import { ActivityDto } from '../../../../graph-database/dto/activity.dto.js';
import { AssetService } from '../../../../etl/asset/asset.service.js';
import { EventService } from '../../../../event/event.service.js';
import { Logger } from '@nestjs/common';
import { CORE_EXTENSION_NAME } from '../../../../extension/extension.constant.js';

@PipelineModuleJsonSchema()
export class StoreActivityInput {
    @Required()
    @Items(ActivityDto)
    public activities!: ActivityDto[];
}

@PipelineModuleJsonSchema()
export class StoreActivityOutput {}

@PipelineModule({
    extensionName: CORE_EXTENSION_NAME,
    inputType: StoreActivityInput,
    outputType: StoreActivityOutput,
})
export class StoreActivityPipelineModule implements IPipelineModule<StoreActivityInput, StoreActivityOutput> {
    private readonly logger = new Logger(StoreActivityPipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly eventService: EventService,
    ) {}

    public async executeModule({
        em,
        inputData,
    }: PipelineModuleExecutionContext<StoreActivityInput>): Promise<StoreActivityOutput> {
        return {};
    }
}
