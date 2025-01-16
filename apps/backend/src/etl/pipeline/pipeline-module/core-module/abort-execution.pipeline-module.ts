import type { CreateHoldExecutionDto } from '../../dto/create-hold-execution.dto.js';
import { Optional } from 'ts-decorator-json-schema-generator';
import { PipelineModuleJsonSchema } from '../decorator/pipeline-module-json-schema.decorator.js';
import { PipelineModule } from '../decorator/pipeline-module.decorator.js';
import { PipelineModuleService } from '../pipeline-module.service.js';
import { holdExecution } from '../../util/hold-execution-builder.util.js';
import type { IPipelineModule } from '../../type/pipeline-module.interface.js';

@PipelineModuleJsonSchema()
export class AbortExecutionInput {
    @Optional()
    public message?: string;
}

@PipelineModule({
    extensionName: PipelineModuleService.CORE_EXTENSION_NAME,
    inputType: AbortExecutionInput,
})
export class AbortExecutionPipelineModule implements IPipelineModule<AbortExecutionInput, undefined> {
    public executeModule(inputData: AbortExecutionInput): CreateHoldExecutionDto {
        return holdExecution()
            .message(inputData.message ?? 'Execution was aborted via the module')
            .abortExecution()
            .build();
    }
}
