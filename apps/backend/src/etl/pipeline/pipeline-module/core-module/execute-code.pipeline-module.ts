import { Items, Optional, Required, Type as SType } from 'ts-decorator-json-schema-generator';
import { PipelineModuleJsonSchema } from '../decorator/pipeline-module-json-schema.decorator.js';
import { PipelineModule } from '../decorator/pipeline-module.decorator.js';
import type { IPipelineModule, PipelineModuleExecutionContext } from '../type/pipeline-module.interface.js';
import { CORE_EXTENSION_NAME } from '../../../../extension/extension.constant.js';
import { constants, createContext, Script } from 'node:vm';
import { hasOwn } from '../../../../util/util.js';
import { Injectable, Logger } from '@nestjs/common';
import { ActivityGraphService } from '../../../../activity-graph/activity-graph.service.js';
import { ActivityGraphNodeService } from '../../../../activity-graph/activity-graph-node.service.js';
import { ActivityStableKeyService } from '../../../../activity-graph/activity-stable-key.service.js';
import { transpile } from 'typescript';
import { AssetService } from '../../../asset/asset.service.js';

@PipelineModuleJsonSchema()
export class ExecuteCodeInput {
    @Required()
    public code!: string;

    @Optional()
    @SType('array')
    @Items('string')
    public customInputParameters?: string[];

    @Optional()
    @SType('array')
    @Items('string')
    public customOutputParameters?: string[];
}

@PipelineModuleJsonSchema()
export class ExecuteCodeOutput {}

@PipelineModule({
    extensionName: CORE_EXTENSION_NAME,
    inputType: ExecuteCodeInput,
    outputType: ExecuteCodeOutput,
})
@Injectable()
export class ExecuteCodePipelineModule implements IPipelineModule<ExecuteCodeInput, ExecuteCodeOutput> {
    constructor(
        private readonly activityGraphService: ActivityGraphService,
        private readonly activityGraphNodeService: ActivityGraphNodeService,
        private readonly activityStableKeyService: ActivityStableKeyService,
        private readonly assetService: AssetService,
    ) {}

    public executeModule(
        executionContext: PipelineModuleExecutionContext<ExecuteCodeInput>,
    ): ExecuteCodeOutput | Promise<ExecuteCodeOutput> {
        const scriptLogger = new Logger(
            `Pipeline ${executionContext.pipelineExecution.id}/${executionContext.currentNode.id} Script`,
        );
        const scriptExecutionContext = {
            logger: scriptLogger,
            activityGraphService: this.activityGraphService,
            activityGraphNodeService: this.activityGraphNodeService,
            activityStableKeyService: this.activityStableKeyService,
            assetService: this.assetService,
        };
        const scriptSandboxContext = {};

        const transpiledCode = transpile(executionContext.inputData.code);
        const script = new Script(transpiledCode, {
            filename: `pipeline-blueprint-${executionContext.pipelineExecution.blueprint.id}-node-${executionContext.currentNode.id}-script.js`,
            importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
        });

        const scriptContext = createContext(scriptSandboxContext, {
            name: `Pipeline ${executionContext.pipelineExecution.id}, Node ${executionContext.currentNode.id} Script Context`,
        });
        script.runInContext(scriptContext);

        if (!hasOwn(scriptContext, 'executeModule') || typeof scriptContext.executeModule !== 'function') {
            throw new Error('Script did not define executeModule function');
        }

        return scriptContext.executeModule({
            ...scriptExecutionContext,
            ...executionContext,
        }) as ExecuteCodeOutput | Promise<ExecuteCodeOutput>;
    }
}
