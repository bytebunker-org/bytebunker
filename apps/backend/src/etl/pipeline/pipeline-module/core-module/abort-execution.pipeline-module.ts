import type { CreateHoldExecutionDto } from '../../dto/create-hold-execution.dto.js';
import { Optional } from 'ts-decorator-json-schema-generator';
import { PipelineModuleJsonSchema } from '../decorator/pipeline-module-json-schema.decorator.js';
import { PipelineModule } from '../decorator/pipeline-module.decorator.js';
import { holdExecution } from '../../util/hold-execution-builder.util.js';
import type { IPipelineModule, PipelineModuleExecutionContext } from '../type/pipeline-module.interface.js';
import { PIPELINE_MODULE_CORE_EXTENSION_NAME } from '../pipeline-module.constant.js';

@PipelineModuleJsonSchema()
export class AbortExecutionInput {
    @Optional()
    public message?: string;
}

@PipelineModule({
    extensionName: PIPELINE_MODULE_CORE_EXTENSION_NAME,
    inputType: AbortExecutionInput,
})
export class AbortExecutionPipelineModule implements IPipelineModule<AbortExecutionInput, undefined> {
    public executeModule({ inputData }: PipelineModuleExecutionContext<AbortExecutionInput>): CreateHoldExecutionDto {
        return holdExecution()
            .message(inputData.message ?? 'Execution was aborted via the module')
            .abortExecution()
            .build();
    }
}
