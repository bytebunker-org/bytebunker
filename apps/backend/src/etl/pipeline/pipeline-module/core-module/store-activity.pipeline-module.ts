import { Items, Required, Type as SType } from 'ts-decorator-json-schema-generator';
import { PipelineModule } from '../decorator/pipeline-module.decorator.js';
import type { IPipelineModule, PipelineModuleExecutionContext } from '../type/pipeline-module.interface.js';
import { Logger } from '@nestjs/common';
import { CORE_EXTENSION_NAME } from '../../../../extension/extension.constant.js';
import { PipelineModuleJsonSchema } from '../decorator/pipeline-module-json-schema.decorator.js';
import { ActivityDto } from '../../../../activity-graph/dto/activity.dto.js';
import { AssetService } from '../../../asset/asset.service.js';
import { ActivityGraphPersisterService } from '../../../../activity-graph/activity-graph-persister.service.js';

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
}

@PipelineModule({
    extensionName: CORE_EXTENSION_NAME,
    inputType: StoreActivityInput,
    outputType: StoreActivityOutput,
})
export class StoreActivityPipelineModule implements IPipelineModule<StoreActivityInput, StoreActivityOutput> {
    private readonly logger = new Logger(StoreActivityPipelineModule.name);

    constructor(
        private readonly assetService: AssetService,
        private readonly activityGraphPersisterService: ActivityGraphPersisterService,
    ) {}

    public executeModule({
        em,
        inputData,
    }: PipelineModuleExecutionContext<StoreActivityInput>): Promise<StoreActivityOutput> {
        return this.activityGraphPersisterService.createActivityGraph(em, inputData.activities);
    }
}
